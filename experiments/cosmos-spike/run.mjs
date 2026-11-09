import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { performance } from 'node:perf_hooks'
import { CosmosRest } from './cosmos-rest.mjs'
import { asOf, owner, raw, fixtures, history, dashboard, strength, referenceSummary } from './model.mjs'

const subscription = process.env.COSMOS_SPIKE_SUBSCRIPTION
const group = process.env.COSMOS_SPIKE_GROUP
const account = process.env.COSMOS_SPIKE_ACCOUNT
for (const value of [subscription, group, account]) assert.match(value ?? '', /^[a-zA-Z0-9-]+$/)
assert.match(group, /^rg-trazo-cosmos-spike-/)
assert.match(account, /^trazospike/)
const database = 'spike-20261108'
const collection = `dbs/${database}/colls/activities`
const directory = new URL('../../artifacts/cosmos-spike/', import.meta.url)
mkdirSync(directory, { recursive: true })
const reportPath = new URL('results.json', directory)

function az(args) {
  // Only validated account identifiers and fixed CLI arguments, no secrets in argv.
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command',
    `& az ${args.join(' ')} --subscription ${subscription} --only-show-errors -o json`],
  { encoding: 'utf8', windowsHide: true, timeout: 120000 })
  if (result.status !== 0) throw new Error('Azure management request failed (output suppressed)')
  return JSON.parse(result.stdout)
}

function connect() {
  const info = az(['cosmosdb', 'show', '-g', group, '-n', account])
  assert.equal(info.provisioningState, 'Succeeded')
  assert.ok(info.capabilities.some(c => c.name === 'EnableServerless'), 'Refuse provisioned accounts')
  assert.equal(info.locations.length, 1)
  const keys = az(['cosmosdb', 'keys', 'list', '-g', group, '-n', account])
  return new CosmosRest(info.documentEndpoint, keys.primaryMasterKey)
}

const rounded = n => Math.round(n * 1000) / 1000
function summarizeSamples(samples) {
  return Object.fromEntries([...new Set(samples.map(s => s.label))].map(label => {
    const rows = samples.filter(s => s.label === label)
    const times = rows.map(s => s.milliseconds).sort((a, b) => a - b)
    return [label, { requests: rows.length, ru: rounded(rows.reduce((n, s) => n + s.ru, 0)),
      meanRu: rounded(rows.reduce((n, s) => n + s.ru, 0) / rows.length),
      p50Ms: rounded(times[Math.floor((times.length - 1) * .5)]),
      p95Ms: rounded(times[Math.ceil((times.length - 1) * .95)]),
      retries: rows.reduce((n, s) => n + s.retries, 0), bytes: rows.reduce((n, s) => n + s.bytes, 0) }]
  }))
}

const mode = process.argv[2] ?? 'seed'
assert.ok(['seed', 'probe'].includes(mode))
const client = connect()
let report = mode === 'probe' ? JSON.parse(readFileSync(reportPath, 'utf8')) : {
  startedAt: new Date().toISOString(), account, group, database, syntheticDataOnly: true,
  transport: 'Node 24 fetch, Cosmos REST HTTPS from local workstation to Central US; no .NET/ACA/browser benchmark',
  sqlBaseline: { firstHtmlSeconds: 77.077, warmHtmlSeconds: .425, anonymousSessionSeconds: .162,
    measuredAt: '2026-11-08T20:07:47Z', note: 'Includes ACA and SQL resume, unlike this direct Cosmos test' },
  checks: [], batches: [],
}

function check(name, run) { run(); report.checks.push(name); console.log(`PASS ${name}`) }
async function measure(label, action) {
  const start = performance.now(), offset = client.samples.length
  const result = await action()
  report.batches.push({ label, milliseconds: rounded(performance.now() - start),
    requests: client.samples.length - offset,
    ru: rounded(client.samples.slice(offset).reduce((n, s) => n + s.ru, 0)) })
  return result
}

async function seed() {
  await client.request('setup-database', 'POST', 'dbs', 'dbs', '', { id: database })
  await client.request('setup-container', 'POST', `dbs/${database}/colls`, 'colls', `dbs/${database}`, {
    id: 'activities', partitionKey: { paths: ['/ownerId'], kind: 'Hash', version: 2 },
    indexingPolicy: { automatic: true, indexingMode: 'consistent', includedPaths: [{ path: '/*' }],
      excludedPaths: [{ path: '/rawPayloadJson/?' }, { path: '/"_etag"/?' }],
      compositeIndexes: [[{ path: '/date', order: 'descending' }, { path: '/createdAt', order: 'descending' },
        { path: '/id', order: 'descending' }]] },
  })
  const fixed = fixtures()
  for (const doc of fixed) await client.put(collection, doc)
  // Same id in a different logical partition must not leak into the owner's results.
  await client.put(collection, { ...fixed[0], ownerId: 'synthetic-other-owner', running: { distanceKm: 99999 } })
  const precision = await client.read(collection, owner, fixed[0].id)
  check('raw JSON text round-trip: large integers, exponents, duplicates, escaped NUL, decimals', () =>
    assert.equal(precision.rawPayloadJson, raw))
  await assert.rejects(client.read(collection, 'nonexistent-owner', fixed[0].id), e => e.status === 404)
  report.checks.push('point read requires matching owner partition')
  const dash = await dashboard(client, collection, '2026-11-02', asOf)
  check('dashboard fixture: 5 sessions, running-only 15 km, pace 340, heart rate 150; excludes future/other owner', () => {
    assert.deepEqual({ sessions: dash.sessions, distanceKm: dash.distanceKm,
      paceSecondsPerKm: dash.paceSecondsPerKm, averageHeartRate: dash.averageHeartRate },
    { sessions: 5, distanceKm: 15, paceSecondsPerKm: 340, averageHeartRate: 150 })
    assert.equal(dash.activities.length, 5)
    assert.equal(dash.latest.id, 'fixture-other')
    assert.doesNotMatch(JSON.stringify(dash), /rawPayload/)
  })
  const p = await strength(client, collection, 'bEnCh PrEsS')
  check('strength fixtures: grouping/trim, repeated entries, four PRs, tie order, nulls, timed sets, sides', () => {
    assert.equal(p.sessions.length, 3)
    assert.equal(p.sessions[0].volumeKg, 440)
    assert.equal(p.sessions[0].knownWeightReps, 18)
    assert.equal(p.prs.heaviestWeight.weightKg, 50)
    assert.equal(p.prs.mostRepsAtAnyWeight.reps, 20)
    assert.equal(p.prs.highestSetVolume.volumeKg, 240)
    assert.equal(p.prs.highestSetVolume.activityId, 'fixture-strength-a')
    assert.equal(p.prs.highestSessionVolume.volumeKg, 480)
    assert.deepEqual(p.series.map(x => x.weightKg), [50, 40, 20])
    assert.deepEqual(p.sessions[0].sets.map(x => x.side), ['Left', 'Right', 'Both'])
    assert.equal(p.sessions[0].sets[1].volumeKg, null)
    assert.equal(p.sessions[0].sets[1].durationSeconds, 30)
    assert.doesNotMatch(JSON.stringify(p), /rawPayload/)
  })
  assert.equal((await strength(client, collection, 'Bénch Press')).prs.heaviestWeight.weightKg, 100)
  const unknown = await strength(client, collection, 'Pull / up & hold?')
  assert.equal(unknown.sessions[0].volumeKg, null)
  assert.equal(unknown.prs.heaviestWeight, null)
  assert.equal((await strength(client, collection, 'Zero')).prs.highestSessionVolume.volumeKg, 0)
  report.checks.push('accent-sensitive exercise separation; unknown weight vs actual zero')
  const historical = history()
  // Bounded concurrency; no automatic throughput provisioning or upsert into existing data.
  const queue = [...historical]
  await measure('seed-1200', () => Promise.all(Array.from({ length: 6 }, async () => {
    while (queue.length) await client.put(collection, queue.shift(), 'history-write')
  })))
  report.dataset = { activities: fixed.length + historical.length, otherOwnerActivities: 1,
    historicalActivities: historical.length, historyPayloadBytes: 20000,
    logicalBytes: [...fixed, ...historical].reduce((n, d) => n + Buffer.byteLength(JSON.stringify(d)), 0) }
  const expected = referenceSummary([...fixed, ...historical], '2026-10-01', asOf)
  for (let i = 0; i < 10; i++) {
    const result = await measure('dashboard-full', () => dashboard(client, collection, '2026-10-01', asOf))
    assert.deepEqual({ sessions: result.sessions, distanceKm: result.distanceKm,
      paceSecondsPerKm: result.paceSecondsPerKm, averageHeartRate: result.averageHeartRate }, expected)
    await measure('strength-full', () => strength(client, collection, 'Squat'))
    await client.read(collection, owner, historical[i].id, 'history-point-read')
  }
  report.checks.push('dashboard over five-year history matches independent in-memory calculation (10 repetitions)')
  const listing = await measure('list-full-page', () => client.query('list-page', collection, owner,
    'SELECT TOP 50 c.id, c.date, c.type FROM c WHERE c.documentType = "activity" ORDER BY c.date DESC, c.createdAt DESC, c.id DESC', {}, 17)
  )
  assert.equal(listing.length, 50)
  assert.equal(new Set(listing.map(x => x.id)).size, 50)
  report.checks.push('continuation tokens: 50 distinct summaries with page size 17')
  // Documented SQL compatibility gap: Cosmos documents cannot exceed 2 MB.
  await assert.rejects(client.put(collection, { ...fixed[0], id: 'oversized', rawPayloadJson: 'x'.repeat(2200000) }),
    e => e.status === 413)
  report.checks.push('oversized document rejected with 413; migration requires explicit payload size strategy')
  const resource = `${collection}/docs/${fixed[4].id}`
  await client.request('delete', 'DELETE', resource, 'docs', resource, undefined,
    { 'x-ms-documentdb-partitionkey': JSON.stringify([owner]) })
  await assert.rejects(client.read(collection, owner, fixed[4].id), e => e.status === 404)
  assert.equal((await dashboard(client, collection, '2026-11-02', asOf)).sessions,
    referenceSummary([...fixed, ...historical].filter(x => x.id !== fixed[4].id), '2026-11-02', asOf).sessions)
  report.checks.push('delete reflected immediately in point read and dashboard')
  await client.put(collection, fixed[4])
  report.lastDataRequestAt = new Date().toISOString()
  report.readyForIdleProbe = true
}

async function probe() {
  const idleMs = Date.now() - Date.parse(report.lastDataRequestAt)
  assert.ok(idleMs >= 10 * 60 * 1000, 'Wait at least ten minutes without data-plane requests')
  // New process, no cached session token or HTTP connection. CLI authentication is excluded.
  const first = await measure('fresh-process-after-idle-read', () => client.read(collection, owner, 'fixture-running-a', 'idle-point-read'))
  assert.equal(first.rawPayloadJson, raw)
  await measure('after-idle-dashboard', () => dashboard(client, collection, '2026-10-01', asOf))
  await measure('after-idle-strength', () => strength(client, collection, 'Squat'))
  const count = await client.query('owner-count', collection, owner,
    'SELECT VALUE COUNT(1) FROM c WHERE c.documentType = "activity"')
  assert.equal(count[0], report.dataset.activities)
  const allHistory = await measure('all-history-dashboard', () => dashboard(client, collection, '2020-01-01', asOf))
  const expectedHistory = referenceSummary([...fixtures(), ...history()], '2020-01-01', asOf)
  assert.deepEqual({ sessions: allHistory.sessions, distanceKm: allHistory.distanceKm,
    paceSecondsPerKm: allHistory.paceSecondsPerKm, averageHeartRate: allHistory.averageHeartRate }, expectedHistory)
  for (let i = 0; i < 10; i++)
    await client.read(collection, owner, `history-${String(i).padStart(5, '0')}`, 'history-point-read')
  await measure('list-full-page', () => client.query('list-page', collection, owner,
    'SELECT TOP 50 c.id, c.date, c.type FROM c WHERE c.documentType = "activity" ORDER BY c.date DESC, c.createdAt DESC, c.id DESC', {}, 17))
  report.idleProbe = { idleSeconds: rounded(idleMs / 1000), measuredAt: new Date().toISOString(),
    note: 'Direct Cosmos requests from a new local Node process after >=10 min; not the full Trazo startup or a 60-minute idle test' }
  report.checks.push('fresh-process read, dashboard and strength after ten minutes idle')
  report.checks.push('all 1209 owner activities persisted; owner partition excludes the extra foreign record')
  report.checks.push('five-year custom range matches independent aggregate reference')
}

try {
  await (mode === 'seed' ? seed() : probe())
  report.success = true
  delete report.failure
} catch (error) {
  report.success = false
  report.failure = { message: error.message, code: error.code }
  process.exitCode = 1
  console.error(error.message)
} finally {
  report.sampleGroups = { ...(report.sampleGroups ?? {}), [mode]: summarizeSamples(client.samples) }
  if (client.samples.length) report.lastDataRequestAt = new Date().toISOString()
  if (mode === 'probe' && report.success) report.readyForIdleProbe = false
  report.updatedAt = new Date().toISOString()
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify({ success: report.success, checks: report.checks.length,
    results: reportPath.pathname, summary: summarizeSamples(client.samples) }, null, 2))
}
