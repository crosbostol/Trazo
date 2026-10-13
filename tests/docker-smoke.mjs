// Requires docker build -t trazo:phase3 . and SQL Server from docker compose.
import { sql, connection as sqlConnection, createDatabase, dropDatabase, localPassword } from './sql-test-support.mjs'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { AuthClient, testPasswordHash } from './auth-client.mjs'

const stamp = Date.now()
const database = `progress_test_${stamp}`
const name = `trazo-test-${stamp}`
const sqlName = 'fisico-sqlserver-1'
const image = process.env.TRAZO_TEST_IMAGE || 'trazo:phase3'
const run = (command, args, options = {}) => {
  const result = spawnSync(command,args,{encoding:'utf8',windowsHide:true,timeout:120000,...options})
  assert.equal(result.status,0,result.stderr || result.stdout || result.error?.message)
  return result.stdout.trim()
}
const docker = (...args) => run('docker',args)
let connection
let created = false
let container = false
try {
  const network = Object.keys(JSON.parse(docker('inspect',sqlName))[0].NetworkSettings.Networks)[0]
  sql('master', "EXEC sp_configure 'contained database authentication', 1; RECONFIGURE;")
  createDatabase(database); created=true
  sql('master', `ALTER DATABASE [${database}] SET CONTAINMENT = PARTIAL`)
  connection=sqlConnection(database)
  const info = JSON.parse(docker('image','inspect',image))[0]
  assert.ok(info.Config.User && info.Config.User !== '0' && info.Config.User !== 'root','Non-root image')
  run('docker',['run','-d','--name',name,'--network',network,'-p','127.0.0.1::8080',
    '-e','Auth__PasswordHash','-e',`ConnectionStrings__Progress=${sqlConnection(database,sqlName)}`,
    '-e','Database__Initialize=true','-e','Database__SeedDemo=true',image],{env:{...process.env,Auth__PasswordHash:testPasswordHash}})
  container=true
  const port=JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort
  let base=`http://127.0.0.1:${port}`
  function refreshPort() { base=`http://127.0.0.1:${JSON.parse(docker('inspect',name))[0].NetworkSettings.Ports['8080/tcp'][0].HostPort}` }
  async function waitLive() {
    for(let i=0;i<60;i++) {
      try { if((await fetch(base+'/health/live')).ok) return } catch {}
      await new Promise(resolve=>setTimeout(resolve,500))
    }
    throw new Error('Container did not become live')
  }
  await waitLive()
  assert.equal((await fetch(base+'/health/ready')).status,200)
  assert.equal(sql(database,"SELECT count(*) FROM sys.tables"),'0')
  for (const route of ['/','/login','/import','/activities','/body']) {
    const response=await fetch(base+route)
    assert.equal(response.status,200,route)
    assert.match(response.headers.get('content-type'),/text\/html/)
    assert.match(await response.text(),/id="root"/)
  }
  assert.equal((await fetch(base+'/api/dashboard')).status,401)
  assert.equal((await fetch(base+'/appsettings.json')).status,404)
  assert.equal((await fetch(base+'/openapi/v1.json')).status,404)
  docker('stop',name)
  run('dotnet',['ef','database','update','--no-build','--project','backend'],{env:{...process.env,ConnectionStrings__Progress:connection,ASPNETCORE_ENVIRONMENT:'Production'}})
  const check=JSON.parse(run('dotnet',['backend/bin/Debug/net10.0/Progress.Api.dll','--check-database','--require-empty'],{env:{...process.env,ConnectionStrings__Progress:connection}}))
  assert.equal(check.Activities,0);assert.equal(check.BodyMeasurements,0)
  const appPassword = `app-password-${stamp}-'quoted;value`
  run('dotnet',['backend/bin/Debug/net10.0/Progress.Api.dll','--configure-app-role'],{input:appPassword+'\n',env:{...process.env,ConnectionStrings__Progress:connection}})
  const denied=spawnSync('docker',['exec','-e','SQLCMDPASSWORD',sqlName,'/opt/mssql-tools18/bin/sqlcmd','-S','localhost','-U','trazo_app','-C','-b','-d',database,'-Q','CREATE TABLE forbidden (id int)'],{encoding:'utf8',windowsHide:true,env:{...process.env,SQLCMDPASSWORD:appPassword}})
  assert.notEqual(denied.status,0,'Runtime role must not create schema objects')
  docker('rm',name); container=false
  run('docker',['run','-d','--name',name,'--network',network,'-p','127.0.0.1::8080','-e','Auth__PasswordHash',
    '-e',`ConnectionStrings__Progress=Server=${sqlName};Database=${database};User ID=trazo_app;Password="${appPassword}";Encrypt=True;TrustServerCertificate=True;Pooling=False`,image],{env:{...process.env,Auth__PasswordHash:testPasswordHash}})
  container=true
  refreshPort(); await waitLive()
  assert.equal((await fetch(base+'/health/ready')).status,200)
  // The loopback-only test simulates ACA's HTTPS-terminating proxy. Node sends
  // cookies explicitly; never weaken Production Secure cookies for local HTTP.
  const client=new AuthClient(base,{'X-Forwarded-Proto':'https'})
  await client.session()
  const response=await client.login()
  assert.equal(response.status,200)
  const cookie=response.headers.getSetCookie().find(c=>c.startsWith('__Host-trazo-session='))
  for(const flag of [/httponly/i,/secure/i,/samesite=strict/i,/path=\//i,/expires=/i]) assert.match(cookie,flag)
  assert.ok(!/domain=/i.test(cookie))
  assert.equal((await client.session()).authenticated,true)
  const forged = new AuthClient(base,{'X-Forwarded-Proto':'https'})
  forged.cookies = new Map(client.cookies)
  const savedCookie=forged.cookies.get('__Host-trazo-session')
  forged.cookies.set('__Host-trazo-session',savedCookie.slice(0,20)+(savedCookie[20]==='A'?'B':'A')+savedCookie.slice(21))
  assert.equal((await forged.fetch('/api/dashboard')).status,401,'Modified cookies must be rejected')
  docker('restart',name); refreshPort(); client.base=base; await waitLive()
  assert.equal((await client.session()).authenticated,true,'Session survives container restart and key ring reload')
  assert.equal((await client.fetch('/api/dashboard')).status,200)
  const create=await client.fetch('/api/activities',{method:'POST',body:JSON.stringify({date:'2026-09-24',type:'Running',durationSeconds:60,running:{distanceKm:0.1}})})
  assert.equal(create.status,201,'Runtime role can write data')
  const activity=await create.json()
  assert.equal((await client.fetch(`/api/activities/${activity.id}`,{method:'DELETE'})).status,204)
  assert.equal((await client.fetch('/api/not-a-route')).status,404,'No SPA HTML for API URLs')
  assert.equal((await client.fetch('/api/auth/logout',{method:'POST'},false)).status,400)
  assert.equal((await client.fetch('/api/auth/logout',{method:'POST'})).status,204)
  assert.equal((await client.fetch('/api/dashboard')).status,401)
  assert.equal((await client.session()).authenticated,false)
  assert.equal((await client.login()).status,200)
  const rotatedPassword=`rotated-test-password-${stamp}`
  const rotatedHash=run('dotnet',['backend/bin/Debug/net10.0/Progress.Api.dll','--hash-password'],{input:rotatedPassword+'\n'})
  docker('rm','-f',name); container=false
  run('docker',['run','-d','--name',name,'--network',network,'-p','127.0.0.1::8080','-e','Auth__PasswordHash',
    '-e',`ConnectionStrings__Progress=Server=${sqlName};Database=${database};User ID=trazo_app;Password="${appPassword}";Encrypt=True;TrustServerCertificate=True;Pooling=False`,image],{env:{...process.env,Auth__PasswordHash:rotatedHash}})
  container=true; refreshPort(); client.base=base; await waitLive()
  assert.equal((await client.fetch('/api/dashboard')).status,401,'Hash rotation invalidates previous sessions without an image rebuild')
  await client.session()
  assert.equal((await client.login(rotatedPassword)).status,200)
  const logs=docker('logs',name)
  assert.ok(!logs.includes(testPasswordHash),'Do not log auth hash')
  console.log(`PASS Docker Production: non-root (${info.Config.User}), ${(info.Size/1024/1024).toFixed(1)} MiB; SPA/API, explicit migrations, zero data, restricted DB role, Secure/HttpOnly/Strict cookies, CSRF, tamper rejection, restart persistence, logout and password rotation`)
} finally {
  if(container) docker('rm','-f',name)
  if(created) dropDatabase(database)
}
