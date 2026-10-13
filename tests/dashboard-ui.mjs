// Optional browser acceptance test. Reuses an installed Playwright via
// PLAYWRIGHT_MODULE (absolute path to its index.mjs); adds no project dependency.
// Runs only local servers and a disposable SQL database, then cleans them up.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js'
import { connection, createDatabase, dropDatabase } from './sql-test-support.mjs'
import { AuthClient, testPassword, testPasswordHash } from './auth-client.mjs'
import { santiagoToday, presetRange } from '../frontend/src/dashboardPeriod.ts'
import { checkWalkingUi } from './walking-ui.mjs'
import { checkStrengthProgressUi } from './strength-progress-ui.mjs'

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('Set PLAYWRIGHT_MODULE to an installed playwright/index.mjs')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const root = fileURLToPath(new URL('../', import.meta.url))
const database = `progress_test_${Date.now()}`
const output = path.join(root,'artifacts/dashboard-iteration')
const apiBase = 'http://127.0.0.1:5145'
let server, vite, browser, created = false
let logs = ''
try {
  createDatabase(database); created = true
  server = spawn('dotnet',[path.join(root,'backend/bin/Debug/net10.0/Progress.Api.dll'),
    '--contentRoot',path.join(root,'backend'),'--environment','Development','--urls',apiBase],{
    cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,
      Auth__PasswordHash:testPasswordHash,ConnectionStrings__Progress:connection(database),Database__SeedDemo:'false',Database__Initialize:'true'}})
  server.stdout.on('data',b=>logs+=b); server.stderr.on('data',b=>logs+=b)
  let ready = false
  for (let i=0;i<120;i++) {
    if (server.exitCode != null) throw new Error(logs)
    try { if ((await fetch(apiBase+'/health/ready')).ok) {ready=true;break} } catch {}
    await new Promise(r=>setTimeout(r,500))
  }
  assert.ok(ready,'Local API started')
  const client = new AuthClient(apiBase)
  await client.session(); assert.equal((await client.login()).status,200)
  const today = santiagoToday()
  const day = (offset) => {const date=new Date(today+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+offset);return date.toISOString().slice(0,10)}
  for (let i=0;i<8;i++) {
    const response = await client.fetch('/api/activities',{method:'POST',body:JSON.stringify({date:day(-i*3),type:'Running',durationSeconds:1800,
      running:{distanceKm:3+i/2,averagePaceSecondsPerKm:480-i*6,averageHeartRate:140+i}})})
    assert.equal(response.status,201,await response.text())
  }
  vite = await createServer({root:path.join(root,'frontend'),configFile:path.join(root,'frontend/vite.config.ts'),
    server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:{'/api':apiBase}}})
  await vite.listen()
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? {channel:process.env.PLAYWRIGHT_CHANNEL} : {})})
  const page = await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Santiago'})
  const errors = [], dashboardUrls = []
  page.on('pageerror',e=>errors.push(e.message))
  page.on('request',r=>{if (r.url().includes('/api/dashboard?')) dashboardUrls.push(r.url())})
  await page.goto('http://127.0.0.1:5180/')
  await page.getByLabel('Contraseña',{exact:true}).fill(testPassword)
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.locator('.stats-grid').waitFor()
  await page.getByRole('link',{name:'Importar',exact:true}).click()
  const source = `{"date":"${today}","type":"Other","activitySubtype":"Football","durationSeconds":3600,"mood":4,"energy":3,"rpe":6,"rawPayload":{"id":9007199254740993,"big":1e400}}`
  await page.getByLabel('JSON de la actividad').fill(source)
  await page.getByRole('button',{name:'Validar',exact:true}).click()
  assert.match(await page.getByRole('region',{name:'Vista previa'}).innerText(),/Football/)
  const countBefore = (await (await client.fetch('/api/activities')).json()).length
  await page.getByRole('button',{name:'Importar actividad',exact:true}).click()
  assert.equal((await (await client.fetch('/api/activities')).json()).length,countBefore)
  await page.getByRole('button',{name:'Confirmar y guardar',exact:true}).click()
  await page.getByRole('heading',{name:'Football',exact:true}).waitFor()
  const detailUrl = page.url()
  await page.getByRole('link',{name:'Actividades',exact:true}).first().click()
  await page.getByRole('link',{name:/Football Sesión/}).waitFor()
  await page.getByRole('link',{name:'Resumen',exact:true}).click()
  await page.locator('.latest-title').filter({hasText:'Football'}).waitFor()
  await page.getByRole('button',{name:'Mes',exact:true}).click()
  await page.locator('.period-label').filter({hasText:'Este mes'}).waitFor()
  assert.ok(dashboardUrls.at(-1).endsWith(`from=${presetRange('month',today).from}&to=${today}`))
  assert.doesNotMatch(await page.locator('main').innerText(),/30 días|12 semanas|esta semana/i)
  await page.getByRole('button',{name:'Personalizado',exact:true}).click()
  await page.getByLabel('Desde',{exact:true}).fill('2020-01-02')
  await page.getByLabel('Hasta',{exact:true}).fill('2020-01-01')
  await page.getByRole('button',{name:'Aplicar período',exact:true}).click()
  await page.getByRole('alert').filter({hasText:'Desde no puede'}).waitFor()
  await page.getByLabel('Desde',{exact:true}).fill('2020-01-01')
  await page.getByLabel('Hasta',{exact:true}).fill('2020-02-15')
  await page.getByRole('button',{name:'Aplicar período',exact:true}).click()
  await page.getByText('Sin actividades en este período.',{exact:true}).first().waitFor()
  assert.match(await page.locator('.latest-title').innerText(),/Football/)
  assert.match(await page.locator('.stat-value').first().innerText(),/^0\s*sesiones$/)
  await page.getByRole('button',{name:'Mes',exact:true}).click()
  await page.locator('.stats-grid').waitFor()
  await page.getByRole('button',{name:'Sesiones',exact:true}).click()
  await page.getByRole('button',{name:'Semana',exact:true}).focus()
  await page.keyboard.press('Tab')
  assert.notEqual(await page.getByRole('button',{name:'Mes',exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none')
  await mkdir(output,{recursive:true})
  const evidence = []
  for (const [name,width,height] of [['wide',1920,1080],['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]]) {
    await page.setViewportSize({width,height})
    await page.evaluate(()=>document.fonts.ready)
    // Allow chart resize and animation to settle before visual evidence.
    await page.waitForTimeout(1800)
    const state = await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      background:getComputedStyle(document.documentElement).backgroundColor,
      card:getComputedStyle(document.querySelector('.stat')).backgroundColor,
      panel:getComputedStyle(document.querySelector('.distance-panel')).backgroundColor,
      charts:[...document.querySelectorAll('.recharts-surface')].map(x=>Math.round(x.getBoundingClientRect().width))}))
    assert.ok(state.scrollWidth<=width,`${name}: no page overflow`)
    assert.equal(state.card,state.panel,`${name}: shared surface token`)
    assert.ok(state.charts.every(w=>w>100),`${name}: visible charts`)
    assert.ok(await page.locator('.activity-name > span:last-child').first().evaluate(el=>el.getBoundingClientRect().width>=140),`${name}: readable activity names`)
    assert.ok(await page.locator('.activity-name .sport-icon').first().evaluate(el=>el.getBoundingClientRect().width<40),`${name}: compact sport icons`)
    if (evidence.length) assert.equal(state.card,evidence[0].card,'Same color at every breakpoint')
    await page.screenshot({path:path.join(output,`${name}.png`),fullPage:true})
    evidence.push({name,...state})
  }
  // Manual creation also exposes subtype only for Other, and uses the same POST.
  await page.getByRole('link',{name:'Registrar actividad',exact:true}).click()
  await page.getByRole('combobox',{name:/^Tipo/}).selectOption('Other')
  await page.getByLabel('Deporte o actividad · opcional',{exact:true}).fill('Padel')
  await page.getByLabel('Duración · minutos',{exact:true}).fill('30')
  await page.getByRole('button',{name:/Guardar actividad/}).click()
  await page.getByRole('heading',{name:'Padel',exact:true}).waitFor()
  await page.getByRole('button',{name:'Eliminar actividad',exact:true}).click()
  await page.getByRole('button',{name:'Sí, eliminar',exact:true}).click()
  await page.getByRole('heading',{name:'Actividades',exact:true}).waitFor()
  await page.goto(detailUrl)
  await page.getByRole('button',{name:'Eliminar actividad',exact:true}).click()
  await page.getByRole('button',{name:'Sí, eliminar',exact:true}).click()
  await page.getByRole('heading',{name:'Actividades',exact:true}).waitFor()
  assert.equal((await (await client.fetch('/api/activities')).json()).length,countBefore)
  await checkWalkingUi(page,client,today,output)
  await checkStrengthProgressUi(page,client,output)
  assert.deepEqual(errors,[])
  await writeFile(path.join(output,'responsive.json'),JSON.stringify({database,checks:'PASS import preview/confirmation/detail/list/dashboard/periods/manual Other/delete; no browser exceptions',viewports:evidence},null,2))
  console.log('PASS UI: Other import + manual creation, preview, confirmation, detail/list/dashboard/delete, calendar labels, custom validation/global latest and four responsive viewports')
} finally {
  await browser?.close()
  await vite?.close()
  if (server && server.exitCode == null) { const stopped = new Promise(r=>server.once('exit',r)); server.kill(); await stopped }
  if (created) dropDatabase(database)
}
