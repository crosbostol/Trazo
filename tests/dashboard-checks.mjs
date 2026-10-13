import assert from 'node:assert/strict'
import { presetRange, rangeError, santiagoToday, periodLabels } from '../frontend/src/dashboardPeriod.ts'
import { activityLabel } from '../frontend/src/format.ts'
import { validateActivityJson, formatActivityJson } from '../frontend/src/importActivity.ts'

export async function checkDashboardPeriods(request, today) {
  assert.deepEqual(presetRange('week', '2026-09-27'), {from:'2026-09-21',to:'2026-09-27'})
  assert.deepEqual(presetRange('week', '2026-09-28'), {from:'2026-09-28',to:'2026-09-28'})
  assert.deepEqual(presetRange('month', '2026-03-01'), {from:'2026-03-01',to:'2026-03-01'})
  assert.deepEqual(presetRange('month', '2026-09-27'), {from:'2026-09-01',to:'2026-09-27'})
  assert.equal(santiagoToday(new Date('2026-09-28T02:59:59Z')), '2026-09-27')
  assert.equal(santiagoToday(new Date('2026-09-28T03:00:00Z')), '2026-09-28')
  assert.equal(periodLabels.month, 'Mes')
  assert.equal(periodLabels.custom, 'Personalizado')
  assert.ok(rangeError('2026-02-30','2026-03-01',today))
  assert.ok(rangeError('2026-03-02','2026-03-01',today))
  assert.ok(rangeError(today,'9999-12-31',today))
  assert.equal(rangeError(today,today,today), '')
  const period = async (from, to) => request(`/api/dashboard?from=${from}&to=${to}`)
  const initial = await period(today,today)
  assert.equal(initial.sessions,0)
  assert.equal(initial.distanceKm,0)
  assert.equal(initial.paceSecondsPerKm,null)
  assert.equal(initial.averageHeartRate,null)
  assert.equal(initial.series.length,1)
  for (const query of ['from=2026-02-30&to=2026-03-01','from=2026-03-02&to=2026-03-01',
    `from=${today}`,`to=${today}`,`from=${today}&to=9999-12-31`,'from=x&to=y','from=2026-1-1&to=2026-01-02'])
    await request(`/api/dashboard?${query}`,'GET',undefined,400)

  const run = await request('/api/activities','POST',{date:today,type:'Running',durationSeconds:600,
    running:{distanceKm:1,averagePaceSecondsPerKm:600,averageHeartRate:140}},201)
  const source = `{"date":"${today}","type":"Other","activitySubtype":"Football","durationSeconds":3600,"mood":4,"energy":3,"rpe":6,"subjectiveNotes":"Partido","notes":null,"rawPayload":{"id":9007199254740993,"value":1e400}}`
  assert.equal(validateActivityJson(source).activitySubtype,'Football')
  const other = await request('/api/activities','POST',formatActivityJson(source),201)
  assert.equal(other.type,'Other')
  assert.equal(activityLabel(other),'Football')
  assert.equal(activityLabel({type:'Other'}),'Otra actividad')
  const detail = await request(`/api/activities/${other.id}`)
  assert.equal(detail.activitySubtype,'Football')
  assert.equal(detail.running,null)
  assert.deepEqual(detail.exercises,[])
  assert.equal(detail.subjectiveNotes,'Partido')
  assert.match(detail.rawPayloadJson,/9007199254740993/)
  assert.match(detail.rawPayloadJson,/1e400/)
  assert.equal((await request('/api/activities')).find(a=>a.id===other.id).activitySubtype,'Football')
  for (const kind of ['week','month']) {
    const {from,to} = presetRange(kind,today)
    const dashboard = await period(from,to)
    assert.equal(dashboard.from,from)
    assert.equal(dashboard.to,to)
    assert.equal(dashboard.sessions,2)
    assert.equal(dashboard.distanceKm,1)
    assert.equal(dashboard.paceSecondsPerKm,600)
    assert.equal(dashboard.averageHeartRate,140)
    assert.equal(dashboard.granularity,'day')
    assert.equal(dashboard.series.reduce((sum,p)=>sum+p.sessions,0),2)
    assert.equal(dashboard.latestActivity.activitySubtype,'Football')
    assert.equal(dashboard.activities.length,2)
  }
  const old = await period('2020-01-01','2020-02-15')
  assert.equal(old.sessions,0)
  assert.equal(old.granularity,'week')
  assert.equal(old.latestActivity.id,other.id)
  assert.equal(old.series[0].date,'2020-01-01')
  assert.equal(old.series.at(-1).endDate,'2020-02-15')
  assert.deepEqual(old.activities,[])
  const legacy = await request('/api/dashboard')
  assert.equal(legacy.activitiesThisWeek,2)
  assert.equal(legacy.distanceThisWeekKm,1)
  assert.equal(legacy.recentPaceSecondsPerKm,600)
  assert.equal(legacy.recentAverageHeartRate,140)
  const plain = await request('/api/activities','POST',{date:today,type:'Other',durationSeconds:60,activitySubtype:null},201)
  await request(`/api/activities/${plain.id}`,'DELETE',undefined,204)
  for (const invalid of [
    {...JSON.parse(source),running:{}},
    {...JSON.parse(source),exercises:[{exerciseName:'Plancha',order:1,sets:[{setNumber:1,reps:1}]}]},
    {...JSON.parse(source),activitySubtype:' '},
    {...JSON.parse(source),activitySubtype:'x'.repeat(201)},
    {...JSON.parse(source),activitySubtype:'bad\0label'},
    {date:today,type:'Walking',activitySubtype:'Football',durationSeconds:60}
  ]) {
    assert.throws(()=>validateActivityJson(JSON.stringify(invalid)))
    await request('/api/activities','POST',invalid,400)
  }
  for (const activity of [run,other]) {
    await request(`/api/activities/${activity.id}`,'DELETE',undefined,204)
    await request(`/api/activities/${activity.id}`,'GET',undefined,404)
  }
  assert.equal((await period(today,today)).sessions,0)
  console.log('PASS range API/frontend contracts, Other/Football import/read/list/detail/delete, null subtype, raw precision, running isolation, validation and global latest')
}
