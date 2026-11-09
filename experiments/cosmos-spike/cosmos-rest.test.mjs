import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CosmosRest } from './cosmos-rest.mjs'

const collection = 'dbs/spike-test/colls/activities'
const makeClient = () => new CosmosRest('https://trazospike-test.documents.azure.com', Buffer.from('fake-key').toString('base64'))
const json = (body, headers = {}, status = 200) => new Response(JSON.stringify(body), { status,
  headers: { 'content-type': 'application/json', 'x-ms-request-charge': '1', ...headers } })

test('query follows empty pages and continuation without mixing owner partitions', async t => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    seen.push(options.headers)
    return seen.length === 1 ? json({ Documents: [] }, { 'x-ms-continuation': 'opaque-page-2' }) :
      json({ Documents: [{ id: 'expected' }] })
  })
  const client = makeClient()
  const rows = await client.query('query', collection, 'owner-a', 'SELECT c.id FROM c')
  assert.deepEqual(rows, [{ id: 'expected' }])
  assert.equal(seen.length, 2)
  assert.equal(seen[1]['x-ms-continuation'], 'opaque-page-2')
  assert.ok(seen.every(h => h['x-ms-documentdb-partitionkey'] === '["owner-a"]'))
  assert.equal(client.samples.reduce((n, s) => n + s.ru, 0), 2)
})

test('429 retries count request charges and do not log response bodies', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ?
    json({ code: 'TooManyRequests', message: 'PRIVATE_PAYLOAD' }, { 'x-ms-retry-after-ms': '0' }, 429) :
    json({ id: 'expected' }, { 'x-ms-request-charge': '2' }))
  const client = makeClient()
  assert.equal((await client.read(collection, 'owner-a', 'expected')).id, 'expected')
  assert.equal(client.samples[0].ru, 3)
  assert.equal(client.samples[0].retries, 1)
  assert.doesNotMatch(JSON.stringify(client.samples), /PRIVATE_PAYLOAD|fake-key/)
})

test('session token is scoped to its owner partition', async t => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    seen.push(options.headers)
    return json({ id: 'a' }, { 'x-ms-session-token': 'opaque-owner-a-session' })
  })
  const client = makeClient()
  await client.read(collection, 'owner-a', 'a')
  await client.read(collection, 'owner-a', 'a')
  await client.read(collection, 'owner-b', 'a')
  assert.equal(seen[1]['x-ms-session-token'], 'opaque-owner-a-session')
  assert.equal(seen[2]['x-ms-session-token'], undefined)
})

test('error exposes status and code without secret response text', async t => {
  t.mock.method(globalThis, 'fetch', async () => json({ code: 'BadRequest', message: 'PRIVATE_PAYLOAD' }, {}, 400))
  await assert.rejects(makeClient().read(collection, 'owner-a', 'a'), error => {
    assert.equal(error.status, 400)
    assert.equal(error.code, 'BadRequest')
    assert.doesNotMatch(error.message, /PRIVATE_PAYLOAD/)
    return true
  })
})

test('refuses plaintext endpoints and unrelated hosts', () => {
  assert.throws(() => new CosmosRest('http://trazospike-test.documents.azure.com', 'fake'))
  assert.throws(() => new CosmosRest('https://documents.azure.com.unrelated.example', 'fake'))
})
