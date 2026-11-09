// Integration against an explicitly selected disposable Cosmos database only.
// Caller creates/deletes the isolated database/container and grants data access.
// No resource creation, production URL, personal password or SQL connection here.
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { AuthClient, checkAuth, testPassword, testPasswordHash } from './auth-client.mjs'
import { checkImport } from './import-checks.mjs'
import { checkDashboardPeriods } from './dashboard-checks.mjs'
import { checkWalking } from './walking-checks.mjs'
import { checkStrengthProgress, progressPath } from './strength-progress-checks.mjs'

const root = fileURLToPath(new URL('../', import.meta.url))
const endpoint = process.env.COSMOS_TEST_ENDPOINT
const database = process.env.COSMOS_TEST_DATABASE
const container = process.env.COSMOS_TEST_CONTAINER ?? 'records'
assert.match(endpoint ?? '', /^https:\/\/[a-z0-9-]+\.documents\.azure\.com(?::443)?\/?$/)
assert.match(database ?? '', /^trazo_test_[a-zA-Z0-9_]+$/, 'A disposable trazo_test_* database is required')
assert.match(container, /^records(?:_test_[a-zA-Z0-9_]+)?$/)
const bundledDotnet = path.join(root, 'artifacts/tooling/dotnet/dotnet.exe')
const dotnet = process.env.DOTNET_EXECUTABLE ?? (existsSync(bundledDotnet) ? bundledDotnet : 'dotnet')
const dll = path.join(root, 'backend/bin/Debug/net10.0/Progress.Api.dll')
assert.ok(existsSync(dll), 'Build backend Debug before running Cosmos smoke')
const port = Number(process.env.COSMOS_TEST_PORT ?? 5145)
assert.ok(Number.isInteger(port) && port >= 1024 && port <= 65535)
const base = `http://127.0.0.1:${port}`
const createdIds = new Set()
const bodyIds = []
const report = { startedAt: new Date().toISOString(), database, container, provider: 'Cosmos',
  syntheticDataOnly: true, checks: [], requiresDatabaseCleanup: true }
let server, serverLog = '', client

function safe(text) {
  for (const secret of [testPassword, testPasswordHash, process.env.COSMOS_TEST_KEY, process.env.Cosmos__Key].filter(Boolean))
    text = text.replaceAll(secret, '[REDACTED]')
  return text
}
function passed(message) { report.checks.push(message); console.log(`PASS ${message}`) }
async function stopServer() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return
  const stopped = new Promise(resolve => server.once('exit', resolve))
  server.kill()
  await stopped
}
async function startServer() {
  const started = performance.now()
  server = spawn(dotnet, [dll, '--contentRoot', path.join(root, 'backend'), '--environment', 'Development',
    '--urls', base, '--Database:Provider=Cosmos', '--Database:Initialize=false', '--Database:SeedDemo=false'], {
    cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, Auth__PasswordHash: testPasswordHash,
      Cosmos__Endpoint: endpoint, Cosmos__Database: database, Cosmos__Container: container,
      ...(process.env.COSMOS_TEST_KEY ? { Cosmos__Key: process.env.COSMOS_TEST_KEY } : {}),
    },
  })
  server.stdout.on('data', chunk => { serverLog += chunk })
  server.stderr.on('data', chunk => { serverLog += chunk })
  for (let attempt = 0; attempt < 120; attempt++) {
    assert.equal(server.exitCode, null, 'Cosmos API process exited; see sanitized startup logs')
    try {
      const response = await fetch(base + '/health/ready', { signal: AbortSignal.timeout(2000) })
      if (response.status === 200) return Math.round(performance.now() - started)
    } catch { /* first startup can wait for Azure CLI credentials/key ring */ }
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('Cosmos API did not become ready within 60 seconds')
}
async function request(route, method = 'GET', body, expected = 200) {
  const response = await client.fetch(route, { method,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
  const text = await response.text()
  assert.equal(response.status, expected, `${method} ${route}: ${safe(text.slice(0, 2000))}`)
  const data = text ? JSON.parse(text) : null
  if (method === 'POST' && route === '/api/activities' && data?.id) createdIds.add(data.id)
  if (method === 'POST' && route === '/api/body-measurements' && data?.id) bodyIds.push(data.id)
  if (method === 'DELETE' && response.ok) createdIds.delete(route.split('/').at(-1))
  return data
}

try {
  await new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(port, '127.0.0.1', () => probe.close(resolve))
  })
  report.initialStartupMs = await startServer()
  client = await checkAuth(base)
  client.timeoutMs = 120000
  const info = await request('/api/database-info')
  assert.equal(info.database, database, 'Test process must point at the explicitly selected test database')
  assert.equal(info.isDemo, false)
  assert.equal(info.hasLegacySeedHistory, false)
  assert.deepEqual(await request('/api/activities'), [], 'Refuse an existing activity dataset')
  assert.deepEqual(await request('/api/body-measurements'), [], 'Refuse an existing body dataset')
  const empty = await request('/api/dashboard')
  assert.equal(empty.totalActivities, 0)
  assert.equal(empty.latestActivity, null)
  assert.equal(empty.recentPaceSecondsPerKm, null)
  assert.equal(empty.weeklyDistance.length, 12)
  assert.ok(empty.weeklyDistance.every(x => x.distanceKm === 0))
  passed('authentication/CSRF, explicit test database, empty legacy dashboard')

  await checkImport(request, empty.asOf)
  passed('shared import regressions and exact raw JSON precision')
  await checkDashboardPeriods(request, empty.asOf)
  passed('shared ranged/legacy dashboard contracts and Other activity')
  await checkWalking(request, empty.asOf, undefined, { sqlChecks: false })
  passed('shared Walking HTTP/domain regressions without SQL-only constraints')
  await checkStrengthProgress(request, undefined, base, { sqlChecks: false })
  passed('shared strength grouping/PRs/nulls/zero/timing/sides and immediate deletion')

  // .NET OrdinalIgnoreCase must not conflate Unicode expansions like ß and SS.
  const unicodeIds = []
  for (const [name, weight] of [['Straße', 10], ['STRASSE', 100], ['Press / & ? ñ', 20]]) {
    const value = await request('/api/activities', 'POST', { date: empty.asOf, type: 'Strength', durationSeconds: 60,
      exercises: [{ exerciseName: name, order: 1, sets: [{ setNumber: 1, reps: 5, weightKg: weight }] }] }, 201)
    unicodeIds.push(value.id)
  }
  assert.equal((await request(progressPath('straße'))).prs.heaviestWeight.value, 10)
  assert.equal((await request(progressPath('strasse'))).prs.heaviestWeight.value, 100)
  assert.equal((await request(progressPath('Press / & ? ñ'))).prs.heaviestWeight.value, 20)
  for (const id of unicodeIds) await request(`/api/activities/${id}`, 'DELETE', undefined, 204)
  passed('Unicode ordinal grouping and URL-encoded exercise names')

  // High entropy prevents gzip from hiding an implementation that only handles a
  // single Cosmos document. Base64 is valid ASCII JSON string data by construction.
  const entropy = randomBytes(2200000).toString('base64')
  const marker = 'COSMOS_PRIVATE_PAYLOAD_SENTINEL'
  const raw = `{"id":9007199254740993,"huge":1e200000,"duplicate":1,"duplicate":2,"nul":"\\u0000","marker":"${marker}","entropy":"${entropy}"}`
  assert.ok(Buffer.byteLength(raw) > 2 * 1024 * 1024)
  const largeBody = `{"date":"${empty.asOf}","type":"Other","durationSeconds":60,"rawPayload":${raw}}`
  const large = await request('/api/activities', 'POST', largeBody, 201)
  assert.ok(large.rawPayloadJson === raw, 'Create response preserves exact large raw JSON')
  assert.ok((await request(`/api/activities/${large.id}`)).rawPayloadJson === raw, 'Detail preserves exact large raw JSON')
  const duplicate = await request('/api/activities', 'POST', largeBody, 201)
  await request(`/api/activities/${large.id}`, 'DELETE', undefined, 204)
  assert.ok((await request(`/api/activities/${duplicate.id}`)).rawPayloadJson === raw,
    'Deleting one activity must preserve another activity sharing content-addressed chunks')
  const slim = await request(`/api/dashboard?from=${empty.asOf}&to=${empty.asOf}`)
  assert.doesNotMatch(JSON.stringify(slim), /rawPayload|COSMOS_PRIVATE_PAYLOAD_SENTINEL/)
  await request(`/api/activities/${duplicate.id}`, 'DELETE', undefined, 204)
  assert.equal((await request('/api/activities')).length, 0)
  passed('>2 MB high-entropy payload, exact round-trip, shared chunks and slim dashboard')

  const body = await request('/api/body-measurements', 'POST', {
    date: empty.asOf, weightKg: 75.5, bodyFatPercentage: 18.25, notes: 'Synthetic Cosmos fixture',
  }, 201)
  assert.ok(body.id)
  assert.equal((await request('/api/body-measurements')).find(x => x.id === body.id).weightKg, 75.5)
  await request('/api/body-measurements', 'POST', { date: empty.asOf, weightKg: -1 }, 400)
  passed('body measurements create/read and domain validation')

  const heldCookies = new Map(client.cookies)
  await stopServer()
  report.restartStartupMs = await startServer()
  const refreshed = new AuthClient(base, {}, 120000)
  refreshed.cookies = heldCookies
  assert.equal((await refreshed.session()).authenticated, true,
    'Same cookie must survive a different process reading the Cosmos key ring')
  client = refreshed
  assert.equal((await request('/api/body-measurements')).length, 1)
  assert.equal((await request('/api/dashboard')).totalActivities, 0)
  passed('persisted Cosmos DataProtection key ring preserves cookie across process restart')
  assert.ok(!serverLog.includes(marker), 'Opaque payload marker must not appear in backend logs')
  assert.ok(!serverLog.includes(testPassword) && !serverLog.includes(testPasswordHash), 'Auth credentials must not be logged')
  if (process.env.COSMOS_TEST_KEY) assert.ok(!serverLog.includes(process.env.COSMOS_TEST_KEY), 'Cosmos key must not be logged')
  await request('/api/auth/logout', 'POST', undefined, 204)
  assert.equal((await client.session()).authenticated, false)
  report.success = true
} catch (error) {
  report.success = false
  report.error = safe(error.message)
  console.error(safe(error.message))
  console.error(safe(serverLog.slice(-5000)))
  process.exitCode = 1
} finally {
  // Only roots returned by this process are deleted. Other records, including
  // body/key/chunk documents, are removed when caller deletes the disposable DB.
  const cleanupFailures = []
  if (createdIds.size && client && server?.exitCode === null && server?.signalCode === null) {
    try {
      if (!(await client.session()).authenticated) await client.login()
      for (const id of [...createdIds]) {
        const response = await client.fetch(`/api/activities/${id}`, { method: 'DELETE' })
        if (![204, 404].includes(response.status)) cleanupFailures.push(id)
        else createdIds.delete(id)
      }
    } catch { cleanupFailures.push('API cleanup unavailable') }
  }
  await stopServer()
  report.remainingCreatedActivityIds = [...createdIds]
  report.cleanupFailures = cleanupFailures
  report.createdBodyIds = bodyIds
  report.completedAt = new Date().toISOString()
  const output = path.join(root, 'artifacts/cosmos-api-smoke')
  mkdirSync(output, { recursive: true })
  writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Cosmos smoke complete; success=${report.success === true}. Delete disposable database ${database} to remove synthetic body/key/chunk records.`)
}
