import assert from 'node:assert/strict'
import { sql } from './sql-test-support.mjs'

export const progressPath = name => `/api/strength/progress?${new URLSearchParams({exercise:name})}`
export async function strengthFixtures(request) {
  const ids = []
  const set = (setNumber,reps,weightKg,extra={}) => ({setNumber,reps,weightKg,...extra})
  const exercise = (exerciseName,order,sets) => ({exerciseName,order,sets})
  try {
    for (const [date,exercises] of [
      ['2020-01-01',[
        exercise('Bench Press',1,[set(1,10,20,{side:'Left'}),set(2,0,50,{durationSeconds:30,side:'Right'})]),
        exercise('bench press',2,[set(1,8,30,{side:'Both'})]),
        exercise('Pull / up & hold?',3,[set(1,15,null),set(2,0,null,{durationSeconds:45})]),
        exercise('Bénch Press',4,[set(1,100,100)]),
        exercise('Zero',5,[set(1,5,0)]),
        exercise('Timed only',6,[set(1,0,null,{durationSeconds:60})])]],
      ['2020-01-02',[exercise('BENCH PRESS',1,[set(1,6,40),set(2,6,40),set(3,20,null)])]],
      ['2020-01-02',[exercise('Bench Press',1,[set(1,10,20)])]],
    ]) {
      const activity = await request('/api/activities','POST',{date,type:'Strength',durationSeconds:900,exercises,rawPayload:{notInAnalytics:true}},201)
      ids.push(activity.id)
    }
    return ids
  } catch(error) {
    for(const id of ids) await request(`/api/activities/${id}`,'DELETE',undefined,204)
    throw error
  }
}

export async function checkStrengthProgress(request,database,baseUrl) {
  for (const route of ['/api/strength/exercises',progressPath('Bench Press')])
    assert.equal((await fetch(baseUrl+route)).status,401,'Strength analytics require authentication')
  assert.deepEqual(await request('/api/strength/exercises'),[])
  await request('/api/strength/progress','GET',undefined,400)
  await request(progressPath('   '),'GET',undefined,400)
  await request(progressPath('missing'),'GET',undefined,404)
  // Simulate a legacy activity with no exercises, without changing API integrity rules.
  const legacy = '11111111-1111-1111-1111-111111111111'
  sql(database,`INSERT INTO Activities (Id,Date,Type,DurationSeconds,CreatedAt,UpdatedAt) VALUES ('${legacy}','2020-01-01','Strength',60,SYSUTCDATETIME(),SYSUTCDATETIME())`)
  const ids = [legacy]
  try {
    assert.deepEqual(await request('/api/strength/exercises'),[])
    const fixtures = await strengthFixtures(request); ids.push(...fixtures)
    sql(database,`UPDATE StrengthExercise SET ExerciseName=N' bench press ' WHERE ActivityId='${fixtures[0]}' AND [Order]=1`)
    const choices = await request('/api/strength/exercises')
    assert.equal(choices.length,5)
    assert.equal(choices.filter(x=>x.name.toLowerCase()==='bench press').length,1)
    assert.equal(choices[0].lastDate,'2020-01-02')
    const p = await request(progressPath('  bEnCh PrEsS  '))
    assert.equal(p.sessions.length,3)
    assert.equal(p.sessions[0].sets[0].exerciseName,' bench press ')
    assert.equal(p.sessions[0].setCount,3,'Repeated exercise entries consolidate per Activity')
    assert.equal(p.sessions[0].knownWeightReps,18)
    assert.equal(p.sessions[0].volumeKg,440)
    assert.deepEqual(p.sessions[0].sets.map(s=>s.side),['Left','Right','Both'])
    assert.equal(p.sessions[0].sets[1].durationSeconds,30)
    assert.equal(p.sessions[0].sets[1].volumeKg,null)
    assert.equal(p.prs.heaviestWeight.value,50)
    assert.equal(p.prs.heaviestWeight.activityId,fixtures[0])
    assert.equal(p.prs.mostRepsAtAnyWeight.value,20)
    assert.equal(p.prs.mostRepsAtAnyWeight.weightKg,null)
    assert.equal(p.prs.highestSetVolume.value,240)
    assert.equal(p.prs.highestSetVolume.activityId,fixtures[0],'Earliest date wins tied PR')
    assert.equal(p.prs.highestSessionVolume.value,480)
    assert.equal(p.prs.highestSessionVolume.activityId,fixtures[1])
    assert.deepEqual(p.series.map(s=>s.weightKg),[50,40,20])
    assert.equal(p.series[1].date,p.series[2].date,'Same-day sessions remain distinct')
    assert.notEqual(p.series[1].activityId,p.series[2].activityId)
    assert.doesNotMatch(JSON.stringify(p),/rawPayload|notInAnalytics/)
    for(const session of p.sessions) assert.equal((await request(`/api/activities/${session.activityId}`)).type,'Strength')
    const unknown = await request(progressPath('Pull / up & hold?'))
    assert.equal(unknown.sessions[0].knownWeightReps,null)
    assert.equal(unknown.sessions[0].volumeKg,null)
    assert.equal(unknown.series[0].weightKg,null)
    assert.equal(unknown.prs.heaviestWeight,null)
    assert.equal(unknown.prs.highestSetVolume,null)
    assert.equal(unknown.prs.highestSessionVolume,null)
    assert.equal(unknown.prs.mostRepsAtAnyWeight.value,15)
    assert.equal((await request(progressPath('Timed only'))).prs.mostRepsAtAnyWeight,null)
    const zero = await request(progressPath('Zero'))
    assert.equal(zero.prs.heaviestWeight.value,0)
    assert.equal(zero.prs.highestSessionVolume.value,0)
    assert.equal((await request(progressPath('Bénch Press'))).prs.heaviestWeight.value,100,'Accents stay separate')
    assert.deepEqual(await request(progressPath('Bench Press')),p,'Deterministic results')
    console.log('PASS strength progress: auth, grouping/trim, legacy empty, sessions, 4 PRs/ties, null/zero, duration/side, encoded names, exercise isolation and source links')
  } finally {
    for(const id of ids) await request(`/api/activities/${id}`,'DELETE',undefined,204)
  }
  assert.deepEqual(await request('/api/strength/exercises'),[],'Deletion is reflected immediately')
}
