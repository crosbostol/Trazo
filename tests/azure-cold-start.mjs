// Read-only management observation followed by anonymous HTTP requests. Never
// restarts replicas, pauses databases, changes scale or uses a personal password.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

const subscription = process.env.TRAZO_SUBSCRIPTION
const group = process.env.TRAZO_GROUP
const app = process.env.TRAZO_APP
const base = new URL(process.env.TRAZO_URL)
for (const value of [subscription, group, app]) assert.match(value ?? '', /^[a-zA-Z0-9-]+$/)
assert.equal(base.protocol, 'https:')
function az(args) {
  const command = [...args, '--subscription', subscription, '--only-show-errors', '-o', 'json']
  const result = process.platform === 'win32'
    ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `az ${command.join(' ')}`], { encoding: 'utf8', windowsHide: true, timeout: 30000 })
    : spawnSync('az', command, { encoding: 'utf8', timeout: 30000 })
  if (result.status !== 0) throw new Error('Azure management observation failed')
  return JSON.parse(result.stdout)
}
let revision, zero = false
for (let attempt = 0; attempt < 40; attempt++) {
  const state = az(['containerapp', 'show', '-g', group, '-n', app])
  assert.equal(state.properties.configuration.activeRevisionsMode, 'Single', 'Single revision mode required for an unambiguous measurement')
  assert.equal(state.properties.template.scale.minReplicas, 0, 'No scale configuration is changed by this script')
  revision = state.properties.latestReadyRevisionName
  assert.match(revision, /^[a-zA-Z0-9-]+$/)
  if (revision === state.properties.latestRevisionName &&
      az(['containerapp', 'replica', 'list', '-g', group, '-n', app, '--revision', revision]).length === 0) {
    zero = true
    break
  }
  await delay(30000)
}
assert.ok(zero, 'No natural scale-to-zero window within observation period; no restart was forced')
console.log('Observed latest production revision at zero replicas; measuring first HTTPS request.')
const started = performance.now()
const response = await fetch(base, { signal: AbortSignal.timeout(180000) })
const headers = performance.now()
await response.text()
const html = performance.now()
assert.equal(response.status, 200)
const session = await fetch(new URL('/api/auth/session', base), { signal: AbortSignal.timeout(120000) })
await session.text()
assert.equal(session.status, 200)
const report = { measuredAt: new Date().toISOString(), revision, zeroReplicasObserved: true,
  htmlSeconds: (html - started) / 1000, headersSeconds: (headers - started) / 1000,
  anonymousSessionAdditionalSeconds: (performance.now() - html) / 1000,
  method: 'Anonymous HTTPS after management-only observation of natural scale-to-zero; no forced restart' }
const directory = new URL('../artifacts/azure-cold-start/', import.meta.url)
mkdirSync(directory, { recursive: true })
writeFileSync(new URL('latest.json', directory), JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
