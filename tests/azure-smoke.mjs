import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { AuthClient } from './auth-client.mjs'
import { checkImport } from './import-checks.mjs'
import { writeFileSync } from 'node:fs'

// Read the real password through stdin, never argv, output, or repository files.
let input = ''
for await (const chunk of process.stdin) input += chunk
const password = input.trim()
input = ''
const base = process.env.TRAZO_URL
assert.ok(base?.startsWith('https://'), 'TRAZO_URL must use HTTPS')
assert.ok(password, 'Password required on stdin')
const client = new AuthClient(base, {}, 180000)
for (const route of ['/health/live','/health/ready','/','/import'])
  assert.equal((await client.fetch(route)).status, 200, route)
for (const route of ['/api/dashboard','/api/activities','/api/body-measurements','/api/database-info'])
  assert.equal((await client.fetch(route)).status, 401, route)
assert.equal((await client.session()).authenticated, false)
assert.equal((await client.login('deliberately-incorrect-password')).status, 401)
const login = await client.login(password)
assert.equal(login.status, 200)
const cookie = login.headers.getSetCookie().find(value => value.startsWith('__Host-trazo-session='))
for (const flag of [/httponly/i,/secure/i,/samesite=strict/i,/path=\//i]) assert.match(cookie, flag)
assert.equal((await client.session()).authenticated, true)
const reloaded = new AuthClient(base, {}, 180000)
reloaded.cookies = new Map(client.cookies)
assert.equal((await reloaded.session()).authenticated, true)
assert.equal((await reloaded.fetch('/api/dashboard')).status, 200)
const databaseInfo = await (await reloaded.fetch('/api/database-info')).json()
assert.equal(databaseInfo.isDemo, false)
assert.equal(databaseInfo.hasLegacySeedHistory, false)
for (const route of ['/api/activities','/api/body-measurements']) {
  const response = await reloaded.fetch(route)
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data, [], 'Initial Azure data must be empty')
}
const evidence = {url:base, initialActivities:0, initialBodyMeasurements:0, verifiedAt:new Date().toISOString()}
const createdIds = new Set()
const request = async (route, method='GET', body, expected=200) => {
  const response = await reloaded.fetch(route,{method,body:body===undefined?undefined:typeof body==='string'?body:JSON.stringify(body)})
  assert.equal(response.status,expected,`${method} ${route}: unexpected HTTP status`)
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (method==='POST' && route==='/api/activities' && data?.id) createdIds.add(data.id)
  if (method==='DELETE' && response.ok) createdIds.delete(route.split('/').at(-1))
  return data
}
try {
  const today=(await request('/api/dashboard')).asOf
  await checkImport(request,today)
  const fixture=await request('/api/activities','POST',`{"date":"${today}","type":"Running","durationSeconds":600,"running":{"distanceKm":1,"averagePaceSecondsPerKm":600,"laps":[{"lapNumber":1,"distanceKm":1,"durationSeconds":600}]},"rawPayload":{"id":9007199254740993,"big":1e400,"marker":"TRAZO_PRIVATE_PRODUCTION_FIXTURE"}}`,201)
  const detail=await request(`/api/activities/${fixture.id}`)
  assert.equal(detail.running.laps.length,1)
  assert.match(detail.rawPayloadJson,/9007199254740993/)
  assert.match(detail.rawPayloadJson,/1e400/)
} finally {
  for(const id of createdIds) assert.equal((await reloaded.fetch(`/api/activities/${id}`,{method:'DELETE'})).status,204,'Cleanup only fixtures created by this run')
}
assert.deepEqual(await request('/api/activities'),[])
console.log('PASS Production import, Running/laps, Strength/sets, precise raw JSON, dashboard/chart data, create/read/delete; zero remaining fixtures.')
if (process.argv.includes('--cold-start')) {
  const names = ['TRAZO_SUBSCRIPTION','TRAZO_GROUP','TRAZO_APP','TRAZO_REVISION','TRAZO_SQL_SERVER','TRAZO_SQL_DATABASE']
  const values = names.map(name => process.env[name])
  for (const value of values) assert.match(value ?? '', /^[a-zA-Z0-9-]+$/)
  const [subscription, group, app, revision, sqlServer, sqlDatabase] = values
  function az(command) {
    const result=spawnSync('powershell.exe',['-NoProfile','-Command',`az ${command} --subscription ${subscription} --only-show-errors -o json`],{encoding:'utf8',windowsHide:true,timeout:120000})
    assert.equal(result.status,0,'Azure management command failed: '+command.split(' ').slice(0,3).join(' '))
    return result.stdout.trim() ? JSON.parse(result.stdout) : null
  }
  const replicaCount=()=>az(`containerapp replica list -g ${group} -n ${app} --revision ${revision}`).length
  const databaseStatus=()=>az(`sql db show -g ${group} -s ${sqlServer} -n ${sqlDatabase} --query status`)
  const logCheck=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','scripts/azure/check-logs.ps1','-ConfigPath',process.cwd()+'/scripts/azure/config.local.ps1'],{encoding:'utf8',windowsHide:true,timeout:120000})
  assert.equal(logCheck.status,0,'Cloud log privacy check failed')
  console.log(logCheck.stdout.trim())
  const instances=()=>az(`containerapp replica list -g ${group} -n ${app} --revision ${revision}`).flatMap(r=>r.properties.containers.map(c=>c.containerId))
  const previousReplicas=instances()
  console.log('Requesting revision restart; waiting for a different container instance.')
  az(`containerapp revision restart -g ${group} -n ${app} --revision ${revision}`)
  let restarted=false
  for(let i=0;i<30;i++) {
    await new Promise(resolve=>setTimeout(resolve,10000))
    const currentReplicas=instances()
    if(!currentReplicas.length || currentReplicas.some(name=>previousReplicas.includes(name))) { if(i%3===0) console.log("Waiting for replacement container after restart."); continue }
    try { if((await reloaded.session()).authenticated && (await reloaded.fetch('/api/dashboard')).status===200) {restarted=true;break} } catch {}
  }
  assert.ok(restarted,'Persisted session works after revision restart')
  evidence.restartSession=true
  writeFileSync('artifacts/azure-production-verification.json',JSON.stringify(evidence,null,2))
  console.log('PASS session and dashboard after Azure revision restart. Waiting without HTTP for SQL auto-pause (60 minutes plus platform delay).')
  const idleStarted=Date.now()
  let paused=false,zero=false
  for(let attempt=0;attempt<100;attempt++) {
    await new Promise(resolve=>setTimeout(resolve,45000))
    const count=replicaCount()
    const status=databaseStatus()
    zero=count===0
    paused=status==='Paused'
    console.log(`Idle verification: ${((Date.now()-idleStarted)/60000).toFixed(1)} min; ACA replicas=${count}; SQL=${status}. Management reads only.`)
    if(paused && zero) break
  }
  assert.ok(zero && paused,'Must observe both SQL Paused and ACA zero replicas')
  evidence.idleMinutesUntilPaused=(Date.now()-idleStarted)/60000
  evidence.sqlPausedObserved=true; evidence.acaScaleToZeroObserved=true
  writeFileSync('artifacts/azure-production-verification.json',JSON.stringify(evidence,null,2))
  const coldStarted=Date.now()
  assert.equal((await fetch(base+'/health/ready',{signal:AbortSignal.timeout(180000)})).status,200)
  evidence.containerColdStartSeconds=(Date.now()-coldStarted)/1000
  // ASP.NET preloads the SQL-backed DataProtection key ring once at process
  // startup. That can resume SQL before readiness; it is not a periodic probe query.
  evidence.sqlStatusAfterColdStart=databaseStatus()
  evidence.sqlResumeIncludedInColdStart=evidence.sqlStatusAfterColdStart==='Online'
  writeFileSync('artifacts/azure-production-verification.json',JSON.stringify(evidence,null,2))
  console.log(`Observed cold start ${evidence.containerColdStartSeconds.toFixed(1)}s; SQL after startup=${evidence.sqlStatusAfterColdStart}.`)
  const resumeStarted=Date.now()
  assert.equal((await reloaded.session()).authenticated,true,'Session survives SQL pause and ACA scale-to-zero')
  assert.equal((await reloaded.fetch('/api/dashboard')).status,200)
  evidence.postStartupSessionAndDashboardSeconds=(Date.now()-resumeStarted)/1000
  assert.equal(databaseStatus(),'Online')
  evidence.sqlResumedObserved=true
  console.log(`PASS cold start ${evidence.containerColdStartSeconds.toFixed(1)}s; authenticated session/dashboard after startup ${evidence.postStartupSessionAndDashboardSeconds.toFixed(1)}s.`)
}
assert.equal((await reloaded.fetch('/api/auth/logout',{method:'POST'},false)).status,400)
assert.equal((await reloaded.fetch('/api/auth/logout',{method:'POST'})).status,204)
assert.equal((await reloaded.fetch('/api/dashboard')).status,401)
evidence.completedAt=new Date().toISOString()
writeFileSync('artifacts/azure-production-verification.json',JSON.stringify(evidence,null,2))
console.log('PASS Azure HTTPS, /import, auth/session/refresh, dashboard/body measurements, initial empty DB, import precision, CSRF and logout. All test activities removed.')
