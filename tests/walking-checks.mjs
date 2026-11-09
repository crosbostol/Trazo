import assert from 'node:assert/strict'
import { validateActivityJson, formatActivityJson } from '../frontend/src/importActivity.ts'
import { sql } from './sql-test-support.mjs'

export const walkingExample = {
  distanceKm:1.26, totalDurationSeconds:911, movingDurationSeconds:901,
  averagePaceSecondsPerKm:724, averageHeartRate:148, maxHeartRate:161,
  recoveryHeartRate:32, averageCadence:104, maxCadence:115, steps:1616,
  aerobicTrainingEffect:2.5, trainingLoad:41, activeCalories:163, totalCalories:188, estimatedFluidLossMl:221,
}
export async function checkWalking(request, today, database, {sqlChecks = true} = {}) {
  const base = {date:today,type:'Walking',durationSeconds:911,walking:{}}
  const before = await request('/api/dashboard')
  const beforeRange = await request('/api/dashboard?from='+today+'&to='+today)
  const minimal = await request('/api/activities','POST',base,201)
  assert.equal(minimal.walking.totalDurationSeconds,911)
  assert.equal(minimal.walking.distanceKm,null)
  assert.equal(minimal.running,null)
  assert.deepEqual(minimal.exercises,[])
  const metrics = {...walkingExample,movingPaceSecondsPerKm:715,bestPaceSecondsPerKm:650,
    totalAscentMeters:10,totalDescentMeters:12,minElevationMeters:-20,maxElevationMeters:5,anaerobicTrainingEffect:0}
  const source = JSON.stringify({...base,walking:metrics,mood:4,energy:3,rpe:5,subjectiveNotes:'Caminata tranquila',notes:'Prueba completa'}).slice(0,-1)+',"rawPayload":{"unknown":{"id":9007199254740993,"big":1e400,"fraction":1.234567890123456789},"extra":"sin normalizar"}}'
  validateActivityJson(source)
  const complete = await request('/api/activities','POST',formatActivityJson(source),201)
  const detail = await request('/api/activities/'+complete.id)
  for (const [key,value] of Object.entries(metrics)) assert.equal(detail.walking[key],value,key)
  assert.equal(detail.walking.activityId,complete.id)
  assert.equal(detail.subjectiveNotes,'Caminata tranquila')
  assert.match(detail.rawPayloadJson,/9007199254740993/)
  assert.match(detail.rawPayloadJson,/1e400/)
  assert.match(detail.rawPayloadJson,/1\.234567890123456789/)
  assert.equal(detail.rawPayload.extra,'sin normalizar')
  const listed = (await request('/api/activities')).find(x=>x.id===complete.id)
  assert.equal(listed.distanceKm,1.26)
  assert.equal(listed.durationSeconds,911)
  assert.equal(listed.averagePaceSecondsPerKm,724)
  assert.equal(listed.averageHeartRate,148)
  for (const [route,original,countKey,keys] of [
    ['/api/dashboard',before,'activitiesThisWeek',['distanceThisWeekKm','distanceLast30DaysKm','recentPaceSecondsPerKm','recentAverageHeartRate','weeklyDistance','paceHistory']],
    ['/api/dashboard?from='+today+'&to='+today,beforeRange,'sessions',['distanceKm','paceSecondsPerKm','averageHeartRate']]
  ]) {
    const after=await request(route)
    assert.equal(after[countKey],original[countKey]+2)
    for(const key of keys) assert.deepEqual(after[key],original[key],key+' unaffected by Walking')
    assert.equal(after.latestActivity.walking.distanceKm,1.26)
    assert.equal(after.latestActivity.running,null)
  }
  const ranged=await request('/api/dashboard?from='+today+'&to='+today)
  assert.equal(ranged.activities.find(x=>x.id===complete.id).distanceKm,1.26)
  for(let i=0;i<ranged.series.length;i++) {
    assert.equal(ranged.series[i].distanceKm,beforeRange.series[i].distanceKm)
    assert.equal(ranged.series[i].paceSecondsPerKm,beforeRange.series[i].paceSecondsPerKm)
  }
  const nulls=await request('/api/activities','POST',{...base,walking:Object.fromEntries(Object.keys(metrics).map(k=>[k,null])),rawPayload:null},201)
  assert.equal(nulls.walking.totalDurationSeconds,911)
  assert.equal(nulls.walking.steps,null)
  const zero=await request('/api/activities','POST',{...base,walking:{distanceKm:0,movingDurationSeconds:0,steps:0,averageCadence:0,maxCadence:0,trainingLoad:0,activeCalories:0,totalCalories:0,minElevationMeters:-400,maxElevationMeters:-200}},201)
  assert.equal(zero.walking.distanceKm,0)
  for(const invalid of [
    {distanceKm:-1},{steps:-1},{steps:1.5},{totalDurationSeconds:0},{totalDurationSeconds:912},
    {movingDurationSeconds:-1},{movingDurationSeconds:912},{averagePaceSecondsPerKm:0},{movingPaceSecondsPerKm:-1},
    {bestPaceSecondsPerKm:0},{averageHeartRate:0},{recoveryHeartRate:0},{averageHeartRate:162,maxHeartRate:161},
    {averageCadence:116,maxCadence:115},{activeCalories:189,totalCalories:188},
    {minElevationMeters:10,maxElevationMeters:5},{totalAscentMeters:-1},{totalDescentMeters:-1},
    {aerobicTrainingEffect:5.1},{anaerobicTrainingEffect:-1},{trainingLoad:-1},{estimatedFluidLossMl:-1}
  ]) await request('/api/activities','POST',{...base,walking:invalid},400)
  await request('/api/activities','POST',JSON.stringify(base).replace('"walking":{}','"walking":{"distanceKm":1e400}'),400)
  for(const invalid of [
    {...base,walking:undefined},{...base,walking:null},{...base,walking:[]},{...base,running:{}},
    {...base,exercises:[{exerciseName:'Plancha',order:1,sets:[{setNumber:1,reps:1}]}]},
    {...base,type:'Running',running:{}},{...base,type:'Other'},{...base,type:'Cycling'},
    {...base,type:'Hiking'},{...base,type:'Strength',exercises:[{exerciseName:'Plancha',order:1,sets:[{setNumber:1,reps:1}]}]}
  ]) {
    assert.throws(()=>validateActivityJson(JSON.stringify(invalid)))
    await request('/api/activities','POST',invalid,400)
  }
  // Database constraints protect writes that bypass the API.
  if (sqlChecks) for(const assignment of ['[DistanceKm]=-1','[Steps]=-1','[DistanceKm]=\'NaN\'','[AverageHeartRate]=200',
    '[AverageCadence]=120','[ActiveCalories]=200','[MinElevationMeters]=50','[MovingDurationSeconds]=1000','[AerobicTrainingEffect]=6']) {
    assert.throws(()=>sql(database,'UPDATE WalkingDetails SET '+assignment+" WHERE ActivityId='"+complete.id+"'"))
  }
  for(const fixture of [minimal,complete,nulls,zero]) {
    if (sqlChecks) assert.equal(sql(database,"SELECT COUNT(*) FROM WalkingDetails WHERE ActivityId='"+fixture.id+"'"),'1')
    await request('/api/activities/'+fixture.id,'DELETE',undefined,204)
    await request('/api/activities/'+fixture.id,'GET',undefined,404)
    if (sqlChecks) assert.equal(sql(database,"SELECT COUNT(*) FROM WalkingDetails WHERE ActivityId='"+fixture.id+"'"),'0')
  }
  assert.equal((await request('/api/dashboard')).totalActivities,before.totalActivities)
  console.log('PASS Walking: minimal/complete/nulls, source JSON precision, domain'+(sqlChecks?' and SQL constraints':'')+', list/detail, sessions only, running isolation and deletion')
}
