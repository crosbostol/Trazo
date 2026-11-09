// Disposable benchmark transport, not a replacement for the production .NET SDK.
// Keys are supplied in memory; never write credentials, auth headers or bodies to logs.
import { createHmac } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { setTimeout as delay } from 'node:timers/promises'

export class CosmosRest {
  constructor(endpoint, key) {
    this.endpoint = new URL(endpoint)
    if (this.endpoint.protocol !== 'https:' || !this.endpoint.hostname.endsWith('.documents.azure.com'))
      throw new Error('Expected an Azure Cosmos DB HTTPS endpoint')
    this.key = Buffer.from(key, 'base64')
    this.samples = []
    this.sessions = new Map()
  }

  async request(label, method, path, type, resource, body, extra = {}) {
    const started = performance.now()
    let charge = 0
    for (let attempt = 0; attempt < 5; attempt++) {
      const date = new Date().toUTCString().toLowerCase()
      const signature = createHmac('sha256', this.key)
        .update(`${method.toLowerCase()}\n${type}\n${resource}\n${date}\n\n`).digest('base64')
      const partition = extra['x-ms-documentdb-partitionkey']
      const session = partition ? this.sessions.get(partition) : undefined
      const response = await fetch(new URL(path, this.endpoint), {
        method, signal: AbortSignal.timeout(60000),
        headers: {
          authorization: encodeURIComponent(`type=master&ver=1.0&sig=${signature}`),
          'x-ms-date': date, 'x-ms-version': '2018-12-31',
          'Content-Type': 'application/json',
          ...(session ? { 'x-ms-session-token': session } : {}), ...extra,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const text = await response.text()
      charge += Number(response.headers.get('x-ms-request-charge') ?? 0)
      if (response.status === 429 && attempt < 4) {
        await delay(Math.min(10000, Number(response.headers.get('x-ms-retry-after-ms') ?? 1000)))
        continue
      }
      const sample = { label, status: response.status, milliseconds: performance.now() - started,
        ru: charge, bytes: Buffer.byteLength(text), retries: attempt }
      this.samples.push(sample)
      if (!response.ok) {
        const error = new Error(`${label}: Cosmos HTTP ${response.status}`)
        error.status = response.status
        // Only the machine-readable service code is exposed, never the response message/body.
        try { error.code = JSON.parse(text).code } catch { /* no JSON */ }
        throw error
      }
      if (partition && response.headers.has('x-ms-session-token'))
        this.sessions.set(partition, response.headers.get('x-ms-session-token'))
      return { data: text ? JSON.parse(text) : null,
        continuation: response.headers.get('x-ms-continuation'), sample }
    }
  }

  async query(label, collection, owner, query, values = {}, pageSize = -1) {
    const items = []
    let continuation
    do {
      const page = await this.request(label, 'POST', `${collection}/docs`, 'docs', collection,
        { query, parameters: Object.entries(values).map(([name, value]) => ({ name: `@${name}`, value })) },
        { 'Content-Type': 'application/query+json', 'x-ms-documentdb-isquery': 'true',
          'x-ms-documentdb-partitionkey': JSON.stringify([owner]),
          'x-ms-max-item-count': String(pageSize),
          ...(continuation ? { 'x-ms-continuation': continuation } : {}) })
      items.push(...page.data.Documents)
      continuation = page.continuation
    } while (continuation)
    return items
  }

  async put(collection, doc, label = 'write') {
    return this.request(label, 'POST', `${collection}/docs`, 'docs', collection, doc,
      { 'x-ms-documentdb-partitionkey': JSON.stringify([doc.ownerId]) })
  }

  async read(collection, owner, id, label = 'point-read') {
    const resource = `${collection}/docs/${id}`
    return (await this.request(label, 'GET', resource, 'docs', resource, undefined,
      { 'x-ms-documentdb-partitionkey': JSON.stringify([owner]) })).data
  }
}
