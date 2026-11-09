// Synthetic feasibility model. No production imports, connection strings or real records.
export const asOf = '2026-11-08'
export const owner = 'synthetic-owner'
export const raw = '{"id":9007199254740993,"huge":1e400,"extreme":1e200000,"duplicate":1,"duplicate":2,"nul":"\\u0000","precise":0.12345678901234567890123456789}'
const timestamp = '2026-11-08T00:00:00.000Z'
const ex = (id, name, order, sets) => ({ id, exerciseName: name, order, sets })
const set = (setNumber, reps, weightKg, rest = {}) => ({ setNumber, reps, weightKg, ...rest })
const activity = (id, date, type, extra = {}) => ({
  id, ownerId: owner, documentType: 'activity', schemaVersion: 1,
  date, type, durationSeconds: 900, createdAt: timestamp, updatedAt: timestamp,
  running: null, walking: null, exercises: [], rawPayloadJson: raw, ...extra,
})

export function fixtures() {
  return [
    activity('fixture-running-a', '2026-11-02', 'Running', {
      running: { distanceKm: 5, averagePaceSecondsPerKm: 300, averageHeartRate: 140 } }),
    activity('fixture-running-b', '2026-11-03', 'Running', {
      running: { distanceKm: 10, averagePaceSecondsPerKm: 360, averageHeartRate: 160 } }),
    activity('fixture-running-null', '2026-11-03', 'Running', {
      running: { distanceKm: null, averagePaceSecondsPerKm: null, averageHeartRate: null } }),
    activity('fixture-walking', '2026-11-04', 'Walking', { walking: { distanceKm: 99 } }),
    activity('fixture-other', '2026-11-05', 'Other', { activitySubtype: 'Football' }),
    activity('fixture-future', '2026-11-09', 'Running', {
      running: { distanceKm: 999, averagePaceSecondsPerKm: 1, averageHeartRate: 999 } }),
    activity('fixture-strength-a', '2020-01-01', 'Strength', { exercises: [
      ex('exercise-a', ' bench press ', 1, [set(1, 10, 20, { side: 'Left' }),
        set(2, 0, 50, { durationSeconds: 30, side: 'Right' })]),
      ex('exercise-b', 'bench press', 2, [set(1, 8, 30, { side: 'Both' })]),
      ex('exercise-accent', 'Bénch Press', 3, [set(1, 100, 100)]),
      ex('exercise-unknown', 'Pull / up & hold?', 4, [set(1, 15, null), set(2, 0, null, { durationSeconds: 45 })]),
      ex('exercise-zero', 'Zero', 5, [set(1, 5, 0)]),
    ] }),
    activity('fixture-strength-b', '2020-01-02', 'Strength', { exercises: [
      ex('exercise-c', 'BENCH PRESS', 1, [set(1, 6, 40), set(2, 6, 40), set(3, 20, null)]),
    ] }),
    activity('fixture-strength-c', '2020-01-02', 'Strength', { exercises: [
      ex('exercise-d', 'Bench Press', 1, [set(1, 10, 20)]),
    ] }),
  ]
}

export function history(count = 1200) {
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(2021, 10, 1 + Math.floor(i * 1820 / count))).toISOString().slice(0, 10)
    const type = ['Running', 'Strength', 'Walking', 'Other'][i % 4]
    return activity(`history-${String(i).padStart(5, '0')}`, date, type, {
      rawPayloadJson: `{"synthetic":"${'x'.repeat(20000)}","id":9007199254740993,"huge":1e400}`,
      ...(type === 'Running' ? { running: { distanceKm: 5 + i % 10,
        averagePaceSecondsPerKm: 300 + i % 90, averageHeartRate: 140 + i % 20 } } : {}),
      ...(type === 'Walking' ? { walking: { distanceKm: 3 } } : {}),
      ...(type === 'Strength' ? { exercises: [ex(`history-ex-${i}`, 'Squat', 1,
        [set(1, 8, 20 + i % 60), set(2, 8, null)])] } : {}),
    })
  })
}

export const aggregateQuery = `SELECT c.date, COUNT(1) AS sessions,
 SUM(IIF(c.type = "Running" AND IS_NUMBER(c.running.distanceKm), c.running.distanceKm, 0)) AS distanceKm,
 SUM(IIF(c.type = "Running" AND c.running.distanceKm > 0 AND c.running.averagePaceSecondsPerKm > 0, c.running.distanceKm, 0)) AS paceDistance,
 SUM(IIF(c.type = "Running" AND c.running.distanceKm > 0 AND c.running.averagePaceSecondsPerKm > 0, c.running.distanceKm * c.running.averagePaceSecondsPerKm, 0)) AS paceTotal,
 SUM(IIF(c.type = "Running" AND c.running.averageHeartRate > 0, c.running.averageHeartRate, 0)) AS heartTotal,
 SUM(IIF(c.type = "Running" AND c.running.averageHeartRate > 0, 1, 0)) AS heartCount
 FROM c WHERE c.documentType = "activity" AND c.date >= @from AND c.date <= @to GROUP BY c.date`

export function summarize(days) {
  const sum = field => days.reduce((total, row) => total + row[field], 0)
  return { sessions: sum('sessions'), distanceKm: sum('distanceKm'),
    paceSecondsPerKm: sum('paceDistance') ? sum('paceTotal') / sum('paceDistance') : null,
    averageHeartRate: sum('heartCount') ? sum('heartTotal') / sum('heartCount') : null }
}

export function referenceSummary(docs, from, to) {
  const eligible = docs.filter(d => d.documentType === 'activity' && d.date >= from && d.date <= to)
  const runs = eligible.filter(d => d.type === 'Running')
  const paceRuns = runs.filter(d => d.running?.distanceKm > 0 && d.running?.averagePaceSecondsPerKm > 0)
  const heartRuns = runs.filter(d => d.running?.averageHeartRate > 0)
  const distance = paceRuns.reduce((s, d) => s + d.running.distanceKm, 0)
  return { sessions: eligible.length, distanceKm: runs.reduce((s, d) => s + (d.running?.distanceKm ?? 0), 0),
    paceSecondsPerKm: distance ? paceRuns.reduce((s, d) => s + d.running.distanceKm * d.running.averagePaceSecondsPerKm, 0) / distance : null,
    averageHeartRate: heartRuns.length ? heartRuns.reduce((s, d) => s + d.running.averageHeartRate, 0) / heartRuns.length : null }
}

export async function dashboard(client, collection, from, to) {
  const daily = await client.query('dashboard-aggregate', collection, owner, aggregateQuery, { from, to })
  const projection = 'c.id, c.date, c.type, c.durationSeconds, c.running, c.walking'
  const order = 'ORDER BY c.date DESC, c.createdAt DESC, c.id DESC'
  const latest = await client.query('dashboard-latest', collection, owner,
    `SELECT TOP 1 ${projection} FROM c WHERE c.documentType = "activity" AND c.date <= @to ${order}`, { to: asOf })
  const activities = await client.query('dashboard-recent', collection, owner,
    `SELECT TOP 5 ${projection} FROM c WHERE c.documentType = "activity" AND c.date >= @from AND c.date <= @to ${order}`, { from, to })
  return { ...summarize(daily), daily, latest: latest[0] ?? null, activities }
}

// Scope: this JS normalizer covers the fixtures only. A production .NET port must
// retain StringComparer.OrdinalIgnoreCase; JS uppercasing is not Unicode parity.
export const matches = (a, b) => a.trim().toUpperCase() === b.trim().toUpperCase()
const finite = x => Number.isFinite(x) ? x : null
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0

export async function strength(client, collection, name) {
  const metadata = await client.query('strength-metadata', collection, owner,
    `SELECT c.id AS activityId, c.date, c.createdAt, e.id AS exerciseId, e.exerciseName, e["order"] AS exerciseOrder
     FROM c JOIN e IN c.exercises WHERE c.documentType = "activity" AND c.type = "Strength"`)
  const selected = metadata.filter(e => matches(e.exerciseName, name)).sort((a, b) =>
    compare(a.date, b.date) || compare(a.createdAt, b.createdAt) || compare(a.activityId, b.activityId) ||
    a.exerciseOrder - b.exerciseOrder || compare(a.exerciseId, b.exerciseId))
  if (!selected.length) return null
  const entries = await client.query('strength-sets', collection, owner,
    `SELECT e.id, e.sets FROM c JOIN e IN c.exercises WHERE c.documentType = "activity"
     AND c.type = "Strength" AND ARRAY_CONTAINS(@ids, e.id)`, { ids: selected.map(e => e.exerciseId) })
  const byId = new Map(entries.map(e => [e.id, e.sets]))
  const byActivity = new Map()
  for (const e of selected) {
    if (!byActivity.has(e.activityId)) byActivity.set(e.activityId, { activityId: e.activityId, date: e.date, sets: [] })
    byActivity.get(e.activityId).sets.push(...byId.get(e.exerciseId).toSorted((a, b) => a.setNumber - b.setNumber)
      .map(s => ({ ...s, exerciseId: e.exerciseId, exerciseName: e.exerciseName,
        volumeKg: s.weightKg !== null && s.reps > 0 ? finite(s.weightKg * s.reps) : null })))
  }
  const sessions = [...byActivity.values()].map(s => {
    const weighted = s.sets.filter(x => x.weightKg !== null && x.reps > 0)
    const weights = s.sets.map(x => x.weightKg).filter(x => x !== null)
    return { ...s, setCount: s.sets.length, knownWeightReps: weighted.length ? weighted.reduce((n, x) => n + x.reps, 0) : null,
      volumeKg: weighted.length && weighted.every(x => x.volumeKg !== null) ? finite(weighted.reduce((n, x) => n + x.volumeKg, 0)) : null,
      bestWeightKg: weights.length ? Math.max(...weights) : null }
  })
  const candidates = sessions.flatMap(s => s.sets.map(set => ({ activityId: s.activityId, date: s.date, ...set })))
  function best(metric, rows = candidates) {
    const valid = rows.filter(x => metric(x) !== null)
    return valid.reduce((winner, x) => !winner || metric(x) > metric(winner) ? x : winner, null)
  }
  return { sessions, prs: { heaviestWeight: best(x => x.weightKg), mostRepsAtAnyWeight: best(x => x.reps > 0 ? x.reps : null),
    highestSetVolume: best(x => x.volumeKg), highestSessionVolume: best(x => x.volumeKg, sessions) },
    series: sessions.map(s => ({ activityId: s.activityId, date: s.date, weightKg: s.bestWeightKg })) }
}
