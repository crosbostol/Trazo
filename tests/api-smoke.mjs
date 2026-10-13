// Integration tests against real SQL Server in a disposable, isolated database.
// Prerequisites: docker compose up -d --wait; dotnet build backend
import { sql, connection, createDatabase, dropDatabase } from './sql-test-support.mjs'
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'node:net'
import { serializeActivityRequest } from '../frontend/src/rawPayload.ts'
import { checkImport } from './import-checks.mjs'
import { checkDashboardPeriods } from './dashboard-checks.mjs'
import { checkWalking } from './walking-checks.mjs'
import { checkStrengthProgress } from './strength-progress-checks.mjs'
import { checkDatabaseSetup } from './database-setup-checks.mjs'
import { checkAuth, testPassword, testPasswordHash } from './auth-client.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const database = `progress_test_${Date.now()}`
const reviewDatabase = `${database}_demo`
const port = 5144
let server
let productionServer
let serverLog = ''
let authClient
const request = async (route, method = 'GET', body, expected = 200) => {
  const response = await authClient.fetch(route, { method, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) })
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${route}: ${text}`)
  return text ? JSON.parse(text) : null
}
const day = (date, offset) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10) }
let createdDatabase = false
let createdReviewDatabase = false
try {
  const buildChecks = spawnSync('dotnet', ['build', path.join(root, 'tests/ReviewChecks')], {cwd:root,encoding:'utf8',windowsHide:true,timeout:120000})
  assert.equal(buildChecks.status, 0, buildChecks.stderr || buildChecks.stdout)
  checkDatabaseSetup(sql)
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close(resolve))
  })
  createDatabase(database)
  createdDatabase = true
  server = spawn('dotnet', [path.join(root, 'backend/bin/Debug/net10.0/Progress.Api.dll'),
    '--contentRoot', path.join(root, 'backend'), '--environment', 'Development',
    '--urls', `http://127.0.0.1:${port}`, '--Database:SeedDemo=false',
    `--ConnectionStrings:Progress=${connection(database)}`],
  { cwd: root, env: {...process.env, Auth__PasswordHash:testPasswordHash}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', chunk => { serverLog += chunk })
  server.stderr.on('data', chunk => { serverLog += chunk })
  let ready = false
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode != null) throw new Error(serverLog)
    try { if ((await fetch(`http://127.0.0.1:${port}/health/ready`)).ok) { ready = true; break } } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  assert.ok(ready, 'API should start within 30 seconds')
  authClient = await checkAuth(`http://127.0.0.1:${port}`)
  const empty = await request('/api/dashboard')
  assert.equal(empty.totalActivities, 0)
  assert.equal(empty.latestActivity, null)
  assert.equal(empty.recentPaceSecondsPerKm, null)
  assert.equal(empty.recentAverageHeartRate, null)
  assert.equal(empty.weeklyDistance.length, 12)
  assert.ok(empty.weeklyDistance.every(w => w.distanceKm === 0))
  console.log('PASS empty database, migrations and dashboard')

  const today = empty.asOf
  const info = await request('/api/database-info')
  assert.deepEqual(info, { database, isDemo: false, hasLegacySeedHistory: false })
  await checkImport(request, today)
  await checkDashboardPeriods(request, today)
  await checkStrengthProgress(request, database, `http://127.0.0.1:${port}`)
  const base = { date: today, type: 'Running', durationSeconds: 600 }
  const run = await request('/api/activities', 'POST', { ...base, mood: 3, energy: 4, rpe: 5,
    subjectiveNotes: 'Sesión de prueba', rawPayload: { source: 'test', untouched: { text: 'ñ · ✓', values: [1, null, 3] } },
    running: { distanceKm: 1, averagePaceSecondsPerKm: 600, averageHeartRate: 140,
      laps: [{ lapNumber: 1, distanceKm: 1, durationSeconds: 600, averagePaceSecondsPerKm: 600 }] } }, 201)
  const readRun = await request(`/api/activities/${run.id}`)
  assert.equal(readRun.running.laps.length, 1)
  assert.equal(readRun.running.totalDurationSeconds, 600)
  assert.equal(readRun.running.maxPowerWatts, null)
  assert.equal(readRun.rawPayload.untouched.text, 'ñ · ✓')
  assert.equal(readRun.subjectiveNotes, 'Sesión de prueba')
  await request('/api/activities', 'POST', { ...base, durationSeconds: 1440, running: { distanceKm: 3, averagePaceSecondsPerKm: 480, averageHeartRate: 160 } }, 201)
  await request('/api/activities', 'POST', { ...base, date: day(today, -30), running: { distanceKm: 50, averagePaceSecondsPerKm: 900 } }, 201)
  await request('/api/activities', 'POST', { ...base, date: day(today, 1), running: { distanceKm: 100, averagePaceSecondsPerKm: 900 } }, 201)
  // Old and future runs must not distort the rolling 30-day metrics.
  const dashboard = await request('/api/dashboard')
  assert.equal(dashboard.distanceLast30DaysKm, 4)
  assert.equal(dashboard.distanceThisWeekKm, 4)
  assert.equal(dashboard.activitiesThisWeek, 2)
  assert.equal(dashboard.recentPaceSecondsPerKm, 510)
  assert.equal(dashboard.recentAverageHeartRate, 150)
  await checkWalking(request, today, database)
  assert.equal(dashboard.totalActivities, 3)
  assert.equal(dashboard.latestActivity.date, today)
  const monday = new Date(`${dashboard.weekStartsOn}T12:00:00Z`)
  assert.equal(monday.getUTCDay(), 1)
  // Inclusive 30-day boundary and nullable metrics.
  await request('/api/activities', 'POST', { ...base, date: day(today, -29), running: { distanceKm: 2 } }, 201)
  assert.equal((await request('/api/dashboard')).distanceLast30DaysKm, 6)
  console.log('PASS running, laps, JSON, nullable metrics, weekly and rolling aggregates')

  const strength = await request('/api/activities', 'POST', { ...base, type: 'Strength', exercises: [
    { exerciseName: 'Split squat', order: 1, sets: [ { setNumber: 1, reps: 10, side: 'Left' }, { setNumber: 2, reps: 10, side: 'Right' } ] },
    { exerciseName: 'Kettlebell swing', order: 2, sets: [ { setNumber: 1, reps: 20, weightKg: 16, side: 'Both' } ] },
    { exerciseName: 'Plank', order: 3, sets: [ { setNumber: 1, reps: 0, durationSeconds: 30 } ] }
  ] }, 201)
  const readStrength = await request(`/api/activities/${strength.id}`)
  assert.equal(readStrength.exercises[0].sets[1].side, 'Right')
  assert.equal(readStrength.exercises[1].sets[0].weightKg, 16)
  assert.equal(readStrength.exercises[2].sets[0].durationSeconds, 30)
  for (const type of ['Walking', 'Cycling', 'Hiking']) await request('/api/activities', 'POST', { ...base, type, ...(type === 'Walking' ? {walking:{}} : {}) }, 201)
  const list = await request('/api/activities')
  assert.ok(list.every((a, i) => i === 0 || list[i - 1].date >= a.date))
  console.log('PASS strength sets, sides, weights, timed sets and other activity types')

  for (const invalid of [ { date: today, durationSeconds: 600 }, { ...base, durationSeconds: 0 }, { ...base, mood: 6 }, { ...base, energy: 0 }, { ...base, rpe: 11 },
    { ...base, type: 'Unknown' }, { ...base, type: 0 }, { ...base, date: 'invalid' }, { ...base, running: { distanceKm: -1 } },
    { ...base, running: { totalDurationSeconds: 999 } }, { ...base, running: { movingDurationSeconds: 601 } },
    { ...base, type: 'Walking', running: {} }, { ...base, running: { laps: null } },
    { ...base, running: { laps: [{ lapNumber: 1 }, { lapNumber: 1 }] } },
    { ...base, exercises: [{ exerciseName: 'Push-up', order: 1, sets: [] }] },
    { ...base, type: 'Strength', exercises: [{ exerciseName: '', order: 1, sets: [] }] },
    { ...base, type: 'Strength', exercises: [{ exerciseName: 'Test', order: 1, sets: [{ setNumber: 1, reps: -1 }] }] },
    { ...base, type: 'Strength', exercises: [null] }
  ]) await request('/api/activities', 'POST', invalid, 400)
  await request('/api/body-measurements', 'POST', { date: today, weightKg: -1 }, 400)
  await request('/api/body-measurements', 'POST', { date: today, weightKg: 76, bodyFatPercentage: 101 }, 400)
  await request('/api/body-measurements', 'POST', { date: today, weightKg: 76.2, notes: 'Isolated test' }, 201)
  const measurements = await request('/api/body-measurements')
  assert.equal(measurements[0].weightKg, 76.2)
  assert.equal(measurements[0].bodyFatPercentage, null)
  console.log('PASS invalid requests return 400, body measurements persist independently')

  await request(`/api/activities/${run.id}`, 'DELETE', undefined, 204)
  await request(`/api/activities/${strength.id}`, 'DELETE', undefined, 204)
  await request(`/api/activities/${run.id}`, 'GET', undefined, 404)
  await request(`/api/activities/${run.id}`, 'DELETE', undefined, 404)
  const count = query => Number(sql(database, query))
  assert.equal(count(`SELECT count(*) FROM "RunningLap" WHERE "ActivityId" = '${run.id}'`), 0)
  assert.equal(count(`SELECT count(*) FROM "RunningDetails" WHERE "ActivityId" = '${run.id}'`), 0)
  assert.equal(count('SELECT count(*) FROM "StrengthSet"'), 0)
  assert.equal(count('SELECT count(*) FROM "StrengthExercise"'), 0)
  assert.ok((await request('/api/activities')).some(a => a.type === 'Walking'), 'Delete must preserve other activities')
  assert.equal((await request('/api/body-measurements')).length, 1, 'Delete must preserve body measurements')
  const schema = await request('/openapi/v1.json')
  assert.ok(Object.keys(schema.paths).some(p => p.includes('/api/dashboard')))
  console.log('PASS cascade deletion, missing resources and OpenAPI')

  const validRun = { ...base, running: {} }
  const exercise = { exerciseName: 'Push-up', order: 1, sets: [{ setNumber: 1, reps: 10 }] }
  for (const invalid of [
    base, { ...base, running: null }, { ...base, type: 'Strength' },
    { ...base, type: 'Strength', exercises: [] },
    { ...base, type: 'Strength', exercises: [{ ...exercise, sets: [] }] },
    { ...validRun, notes: 'bad\u0000text' },
    ...[
      { averageHeartRate: 0 }, { averageHeartRate: -1 }, { averageHeartRate: 170, maxHeartRate: 150 },
      { averagePaceSecondsPerKm: 0 },
      { averageCadence: -1 }, { averageCadence: 170, maxCadence: 160 },
      { averagePowerWatts: -1 }, { averagePowerWatts: 400, maxPowerWatts: 350 },
      { minElevationMeters: 10, maxElevationMeters: -10 }, { totalAscentMeters: -1 },
      { runningDurationSeconds: 500, walkingDurationSeconds: 200 }, { runningDurationSeconds: 601 },
      { activeCalories: 500, totalCalories: 300 }, { aerobicTrainingEffect: 6 },
      { laps: [{ lapNumber: 1 }] }, { laps: [null] },
      { laps: [{ lapNumber: 1, durationSeconds: 400 }, { lapNumber: 2, durationSeconds: 400 }] },
      { laps: [{ lapNumber: 1, distanceKm: -1 }] },
      { distanceKm: 1, laps: [{ lapNumber: 1, distanceKm: 100 }] },
    ].map(running => ({ ...base, running })),
    ...[
      [{ setNumber: 1, reps: 0 }], [{ setNumber: 1, reps: 1, durationSeconds: 601 }],
      [{ setNumber: 1, reps: 10, weightKg: -1 }], [{ setNumber: 1, reps: 1, side: 'Unknown' }],
      [{ setNumber: 1, reps: 1 }, { setNumber: 1, reps: 2 }], [null],
    ].map(sets => ({ ...base, type: 'Strength', exercises: [{ ...exercise, sets }] })),
    { ...base, type: 'Strength', exercises: [exercise, exercise] },
  ]) await request('/api/activities', 'POST', invalid, 400)
  await request('/api/body-measurements', 'POST', { date: today, weightKg: 75, notes: '\u0000' }, 400)
  await request('/api/activities', 'POST', serializeActivityRequest(validRun, '{"tooBig":1e200000}'), 201)
  await request('/api/activities', 'POST', `{"date":"${today}","type":"Running","durationSeconds":600,"running":{"distanceKm":1e400}}`, 400)
  const exact = await request('/api/activities', 'POST', serializeActivityRequest(validRun,
    '{"id":9007199254740993,"big":1e400,"label":"PRIVATE_PAYLOAD_SENTINEL"}'), 201)
  const exactRead = await request(`/api/activities/${exact.id}`)
  assert.match(exactRead.rawPayloadJson, /9007199254740993/)
  assert.match(exactRead.rawPayloadJson, /1e400/)
  assert.ok(!serverLog.includes('PRIVATE_PAYLOAD_SENTINEL'), 'Payload values must not be logged')
  assert.throws(() => serializeActivityRequest(validRun, '{invalid'), /JSON válido/)
  assert.deepEqual(JSON.parse(serializeActivityRequest({}, '')), { rawPayload: null })
  await request('/api/activities', 'POST', { ...base, running: { minElevationMeters: -200, maxElevationMeters: -100,
    averageCadence: 0, maxCadence: 0, averagePowerWatts: 0, maxPowerWatts: 0 } }, 201)
  await request('/api/activities', 'POST', { ...base, running: { laps: [{ lapNumber: 1, durationSeconds: 601 }] } }, 201)
  const slimDashboard = await request('/api/dashboard')
  assert.ok(!('rawPayload' in slimDashboard.latestActivity))
  assert.ok(!('rawPayloadJson' in slimDashboard.latestActivity))
  console.log('PASS domain regressions, valid negative elevation/zero power, opaque JSON precision and payload privacy')

  createDatabase(reviewDatabase)
  createdReviewDatabase = true
  let productionLog = ''
  productionServer = spawn('dotnet', [path.join(root, 'backend/bin/Debug/net10.0/Progress.Api.dll'),
    '--contentRoot', path.join(root, 'backend'), '--environment', 'Production',
    '--urls', 'http://127.0.0.1:0', '--Database:Initialize=true', '--Database:SeedDemo=true',
    `--ConnectionStrings:Progress=${connection(reviewDatabase)}`],
  { cwd: root, env: {...process.env, Auth__PasswordHash:testPasswordHash}, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
  productionServer.stdout.on('data', chunk => { productionLog += chunk })
  productionServer.stderr.on('data', chunk => { productionLog += chunk })
  let productionUrl
  for (let attempt = 0; attempt < 40; attempt++) {
    productionUrl = productionLog.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)/)?.[1]
    if (productionUrl) break
    if (productionServer.exitCode != null) throw new Error(productionLog)
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  assert.ok(productionUrl, 'Production API must start without migrating or seeding')
  assert.equal((await fetch(`${productionUrl}/openapi/v1.json`)).status, 404)
  const malformed = await fetch(`${productionUrl}/api/activities`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{invalid' })
  assert.equal(malformed.status, 401)
  assert.equal((await fetch(`${productionUrl}/health/live`)).status, 200)
  assert.equal((await fetch(`${productionUrl}/health/ready`)).status, 200)
  const preflight = await fetch(`${productionUrl}/api/activities`, { method: 'OPTIONS', headers: { Origin: 'https://untrusted.example', 'Access-Control-Request-Method': 'POST' } })
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), null)
  assert.equal(Number(sql(reviewDatabase, "SELECT count(*) FROM sys.tables")), 0)
  const productionStopped = new Promise(resolve => productionServer.once('exit', resolve))
  productionServer.kill()
  await productionStopped
  console.log('PASS Production: no migrations/seed/OpenAPI, protected writes, health readiness and no permissive CORS')
  const checks = spawnSync('dotnet', ['run', '--no-build', '--project', path.join(root, 'tests/ReviewChecks')], {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000,
    env: { ...process.env, REVIEW_TEST_CONNECTION: `${connection(reviewDatabase)}` },
  })
  console.log(checks.stdout)
  assert.equal(checks.status, 0, checks.stderr || checks.error?.message || checks.stdout)
  console.log('All API integration checks passed.')
  assert.ok(!serverLog.includes(testPassword) && !serverLog.includes(testPasswordHash), 'Credentials must not appear in logs')
} catch (error) {
  console.error(error)
  console.error(serverLog.slice(-5000))
  process.exitCode = 1
} finally {
  if (productionServer && productionServer.exitCode === null && productionServer.signalCode === null) {
    const stopped = new Promise(resolve => productionServer.once('exit', resolve))
    productionServer.kill()
    await stopped
  }
  if (server && server.exitCode === null && server.signalCode === null) {
    const stopped = new Promise(resolve => server.once('exit', resolve))
    server.kill()
    await stopped
  }
  if (createdDatabase && /^progress_test_\d+$/.test(database)) dropDatabase(database)
  if (createdReviewDatabase && /^progress_test_\d+_demo$/.test(reviewDatabase)) dropDatabase(reviewDatabase)
}
