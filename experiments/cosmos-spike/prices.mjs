import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'

// Public Azure Retail Prices API, no billing credentials. Estimates are not invoices.
const directory = new URL('../../artifacts/cosmos-spike/', import.meta.url)
mkdirSync(directory, { recursive: true })
const url = new URL('https://prices.azure.com/api/retail/prices')
url.searchParams.set('$filter', "armRegionName eq 'centralus' and (serviceName eq 'Azure Cosmos DB' or serviceName eq 'Container Registry' or serviceName eq 'SQL Database') and priceType eq 'Consumption'")
let next = url.href
const items = []
async function fetchPrices(target) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(target, { signal: AbortSignal.timeout(30000) })
    if (response.ok) return response.json()
    if (response.status !== 429 || attempt === 4) throw new Error(`Azure prices HTTP ${response.status}`)
    const seconds = Number(response.headers.get('retry-after'))
    await delay(Math.min(30000, (seconds > 0 ? seconds : 5 * (attempt + 1)) * 1000))
  }
}
while (next) {
  const page = await fetchPrices(next)
  items.push(...page.Items)
  next = page.NextPageLink
}
const ru = items.find(x => x.productName === 'Azure Cosmos DB serverless' && x.meterName === '1M RUs')
const storage = items.find(x => x.productName === 'Azure Cosmos DB' && x.meterName === 'Data Stored' && x.skuName === 'RUs')
const basic = items.find(x => x.productName === 'SQL Database Single Basic' && x.skuName === 'B')
const registryUrl = new URL('https://prices.azure.com/api/retail/prices')
registryUrl.searchParams.set('$filter', "armRegionName eq 'eastus2' and serviceName eq 'Container Registry' and priceType eq 'Consumption'")
const registry = (await fetchPrices(registryUrl)).Items.find(x => x.productName === 'Container Registry' &&
  x.skuName === 'Basic' && x.meterName === 'Basic Registry Unit')
if (!ru || !storage || !basic || !registry) {
  console.log(JSON.stringify(items.filter(x => /stored|storage|serverless/i.test(x.meterName + x.productName))
    .map(x => ({ product: x.productName, meter: x.meterName, price: x.retailPrice, unit: x.unitOfMeasure })), null, 2))
  throw new Error('Expected pricing meters not found; inspect public meter names')
}
if (ru.unitOfMeasure !== '1M' || storage.unitOfMeasure !== '1 GB/Month' ||
    basic.unitOfMeasure !== '1/Day' || registry.unitOfMeasure !== '1/Day' ||
    storage.retailPrice <= 0 || registry.retailPrice <= 0)
  throw new Error('Unexpected units or free meters; refuse a misleading Serverless estimate')
const pick = x => ({ product: x.productName, meter: x.meterName, sku: x.skuName,
  unit: x.unitOfMeasure, usd: x.retailPrice, region: x.armRegionName, effectiveStartDate: x.effectiveStartDate,
  meterId: x.meterId })
const report = JSON.parse(readFileSync(new URL('results.json', directory), 'utf8'))
const meanBatch = label => {
  const rows = report.batches.filter(x => x.label === label)
  if (!rows.length) throw new Error(`Missing benchmark batch: ${label}`)
  return rows.reduce((n, x) => n + x.ru, 0) / rows.length
}
const writeRu = meanBatch('seed-1200') / report.dataset.historicalActivities
const detailRu = (report.sampleGroups.probe?.['history-point-read'] ?? report.sampleGroups.seed['history-point-read'])?.meanRu
if (!detailRu) throw new Error('Run idle probe first to measure 20 KB point reads separately')
const listingRu = meanBatch('list-full-page')
const scenario = { dashboards: 60, strengthViews: 30, listPages: 120, activityDetails: 100,
  writes: 32, deletes: 20, logicalStorageGb: .05 }
const monthlyRu = scenario.dashboards * meanBatch('dashboard-full') + scenario.strengthViews * meanBatch('strength-full') +
  scenario.listPages * listingRu + scenario.activityDetails * detailRu + scenario.writes * writeRu +
  scenario.deletes * report.sampleGroups.seed.delete.meanRu
const result = { queriedAt: new Date().toISOString(), currency: 'USD', source: url.href, registrySource: registryUrl.href,
  meters: { serverlessRu: pick(ru), storage: pick(storage), sqlBasic: pick(basic), registryBasic: pick(registry) },
  scenario, measuredRuPerOperation: { dashboard: meanBatch('dashboard-full'), strength: meanBatch('strength-full'),
    listPage: listingRu, detail: detailRu, write20Kb: writeRu },
  estimate: { monthlyRu, monthlyOperationsUsd: monthlyRu / 1e6 * ru.retailPrice,
    monthlyStorageUsd: scenario.logicalStorageGb * storage.retailPrice,
    monthlyCosmosUsdBeforeIndexOverhead: monthlyRu / 1e6 * ru.retailPrice + scenario.logicalStorageGb * storage.retailPrice,
    sqlBasicMonthlyUsd: basic.retailPrice * 30.44,
    registryBasicMonthlyUsd: registry.retailPrice * 30.44 },
  caveats: ['Scenario is synthetic, not actual usage or an Azure invoice.',
    'Storage estimate excludes index overhead; Cosmos charges for stored data including indexes.',
    'No compute hosting, networking, restore charges, tax or subscription discounts included.',
    'Write estimate uses 20 KB activities for every write, including smaller body measurements (conservative).',
    'Strength view reads all exercise metadata and the selected history: cost grows with history.',
    'Registry meter uses the production registry region, East US 2; SQL/Cosmos use Central US.'],
}
writeFileSync(new URL('prices.json', directory), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
