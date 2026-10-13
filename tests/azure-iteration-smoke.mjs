import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { AuthClient } from './auth-client.mjs'
import { walkingExample } from './walking-checks.mjs'

let input=''; for await (const chunk of process.stdin) input+=chunk
const password=input.trim(); input=''
const base=process.env.TRAZO_URL
assert.ok(base?.startsWith('https://')); assert.ok(password)
const client=new AuthClient(base,{},180000)
for(const route of ['/health/live','/health/ready','/','/import']) assert.equal((await client.fetch(route)).status,200,route)
for(const route of ['/api/dashboard','/api/activities','/api/database-info']) assert.equal((await client.fetch(route)).status,401,route)
assert.equal((await client.session()).authenticated,false)
assert.equal((await client.login(password)).status,200)
assert.equal((await client.session()).authenticated,true)
const request=async(route,method='GET',body,expected=200)=>{
  const response=await client.fetch(route,{method,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)})
  const text=await response.text(); assert.equal(response.status,expected,`${method} ${route}: ${text}`)
  return text?JSON.parse(text):null
}
const info=await request('/api/database-info')
assert.equal(info.isDemo,false); assert.equal(info.hasLegacySeedHistory,false)
const initial=await request('/api/activities')
const initialIds=initial.map(x=>x.id).sort()
assert.ok(initial.some(x=>x.type==='Running'),'Existing Running required')
assert.ok(initial.some(x=>x.type==='Strength'),'Existing Strength required')
const existingRun=initial.find(x=>x.type==='Running')
const existingStrength=initial.find(x=>x.type==='Strength')
assert.ok((await request('/api/activities/'+existingRun.id)).running)
assert.ok((await request('/api/activities/'+existingStrength.id)).exercises.length>0)
const strengthExercises=await request('/api/strength/exercises')
assert.ok(strengthExercises.length>0,'Existing Strength must expose at least one exercise for Progreso')
const strengthProgress=await request('/api/strength/progress?'+new URLSearchParams({exercise:strengthExercises[0].name}))
assert.ok(strengthProgress.sessions.length>0)
assert.ok(Array.isArray(strengthProgress.series))
assert.doesNotMatch(JSON.stringify(strengthProgress),/rawPayload/i)
const legacy=await request('/api/dashboard')
const today=legacy.asOf
const date=new Date(today+'T12:00:00Z')
date.setUTCDate(date.getUTCDate()-((date.getUTCDay()+6)%7))
const weekFrom=date.toISOString().slice(0,10)
const monthFrom=today.slice(0,8)+'01'
const weekBefore=await request(`/api/dashboard?from=${weekFrom}&to=${today}`)
const monthBefore=await request(`/api/dashboard?from=${monthFrom}&to=${today}`)
const todayBefore=await request(`/api/dashboard?from=${today}&to=${today}`)
assert.equal(weekBefore.from,weekFrom); assert.equal(weekBefore.to,today)
assert.equal(monthBefore.from,monthFrom); assert.equal(monthBefore.to,today)
assert.equal((await client.fetch(`/api/dashboard?from=${today}&to=${weekFrom}`)).status,400)
const created=[]
const evidence={url:base,revision:process.env.TRAZO_REVISION,verifiedAt:new Date().toISOString(),initialActivities:initial.length,
  initialBodyMeasurements:(await request('/api/body-measurements')).length,weekFrom,monthFrom}
evidence.strengthProgress=true
try {
  const other=await request('/api/activities','POST',{date:today,type:'Other',activitySubtype:'Football',durationSeconds:3600,
    mood:4,energy:3,rpe:6,subjectiveNotes:'TRAZO_DEPLOYMENT_TEST_OTHER',rawPayload:{marker:'TRAZO_DEPLOYMENT_TEST',id:9007199254740993}},201)
  created.push(other.id)
  const walkSource=`{"date":"${today}","type":"Walking","durationSeconds":911,"subjectiveNotes":"TRAZO_DEPLOYMENT_TEST_WALKING","walking":${JSON.stringify(walkingExample)},"rawPayload":{"marker":"TRAZO_DEPLOYMENT_TEST","id":9007199254740993,"big":1e400}}`
  const walking=await request('/api/activities','POST',walkSource,201); created.push(walking.id)
  const otherDetail=await request('/api/activities/'+other.id)
  assert.equal(otherDetail.activitySubtype,'Football'); assert.equal(otherDetail.running,null); assert.equal(otherDetail.walking,null)
  const walkingDetail=await request('/api/activities/'+walking.id)
  for(const [key,value] of Object.entries(walkingExample)) assert.equal(walkingDetail.walking[key],value,key)
  assert.equal(walkingDetail.running,null); assert.match(walkingDetail.rawPayloadJson,/9007199254740993/); assert.match(walkingDetail.rawPayloadJson,/1e400/)
  const list=await request('/api/activities')
  const listedWalk=list.find(x=>x.id===walking.id); assert.equal(listedWalk.distanceKm,1.26); assert.equal(listedWalk.averagePaceSecondsPerKm,724); assert.equal(listedWalk.averageHeartRate,148)
  assert.equal(list.find(x=>x.id===other.id).activitySubtype,'Football')
  for(const [from,before] of [[weekFrom,weekBefore],[monthFrom,monthBefore],[today,todayBefore]]) {
    const after=await request(`/api/dashboard?from=${from}&to=${today}`)
    assert.equal(after.sessions,before.sessions+2)
    for(const key of ['distanceKm','paceSecondsPerKm','averageHeartRate']) assert.equal(after[key],before[key],`${key} stays Running-only`)
    assert.equal(after.latestActivity.id,walking.id); assert.equal(after.latestActivity.walking.distanceKm,1.26)
  }
  const legacyAfter=await request('/api/dashboard')
  for(const key of ['distanceThisWeekKm','distanceLast30DaysKm','recentPaceSecondsPerKm','recentAverageHeartRate']) assert.equal(legacyAfter[key],legacy[key],`${key} legacy unchanged`)
  assert.equal(legacyAfter.activitiesThisWeek,legacy.activitiesThisWeek+2)
  evidence.other=true; evidence.walking=true; evidence.dashboardWeek=true; evidence.dashboardMonth=true; evidence.dashboardCustom=true
} finally {
  for(const id of created.reverse()) {
    const response=await client.fetch('/api/activities/'+id,{method:'DELETE'})
    assert.equal(response.status,204,'Cleanup only deployment fixtures')
  }
}
assert.deepEqual((await request('/api/activities')).map(x=>x.id).sort(),initialIds,'Existing activities preserved exactly')
assert.equal((await request('/api/body-measurements')).length,evidence.initialBodyMeasurements)
assert.equal((await client.fetch('/api/auth/logout',{method:'POST'})).status,204)
assert.equal((await client.fetch('/api/dashboard')).status,401)
evidence.finalActivities=initialIds.length; evidence.completedAt=new Date().toISOString()
mkdirSync('artifacts',{recursive:true}); writeFileSync('artifacts/azure-iteration-verification.json',JSON.stringify(evidence,null,2))
console.log(`PASS Production: session, ${initial.length} existing records, Progreso Strength, Running/Strength, week/month/custom, Other/Football, Walking details/list, Running isolation, /import, create/read/delete and cleanup.`)
