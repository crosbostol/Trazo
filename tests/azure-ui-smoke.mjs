import assert from 'node:assert/strict'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
let input=''; for await(const chunk of process.stdin) input+=chunk
const password=input.trim(); input=''
const base=process.env.TRAZO_URL
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})})
const output=path.resolve('artifacts/azure-production-ui'); await mkdir(output,{recursive:true})
const page=await browser.newPage({viewport:{width:1920,height:1080},timezoneId:'America/Santiago'})
const errors=[]; page.on('pageerror',e=>errors.push(e.message))
try {
  await page.goto(base)
  await page.getByLabel('Contraseña',{exact:true}).fill(password)
  await page.getByRole('button',{name:'Entrar',exact:true}).click()
  await page.locator('.stats-grid').waitFor({timeout:180000})
  for(const name of ['Semana','Mes','Personalizado']) assert.equal(await page.getByRole('button',{name,exact:true}).count(),1)
  const evidence=[]
  for(const [name,width,height] of [['wide',1920,1080],['mobile',390,844]]) {
    await page.setViewportSize({width,height}); await page.waitForTimeout(1200)
    const state=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
      background:getComputedStyle(document.documentElement).backgroundColor,
      card:getComputedStyle(document.querySelector('.stat')).backgroundColor,
      panel:getComputedStyle(document.querySelector('.distance-panel')).backgroundColor,
      chartWidths:[...document.querySelectorAll('.recharts-surface')].map(x=>Math.round(x.getBoundingClientRect().width))}))
    assert.equal(state.scrollWidth,width); assert.equal(state.card,state.panel); assert.ok(state.chartWidths.every(x=>x>100))
    await page.screenshot({path:path.join(output,name+'.png'),fullPage:true}); evidence.push({name,...state})
  }
  assert.equal(evidence[0].card,evidence[1].card)
  await page.getByRole('link',{name:'Importar',exact:true}).click()
  await page.getByLabel('JSON de la actividad').waitFor()
  await page.screenshot({path:path.join(output,'import-mobile.png'),fullPage:true})
  await page.getByRole('link',{name:'Progreso',exact:true}).click()
  await page.getByLabel('Ejercicio',{exact:true}).waitFor()
  await page.getByRole('heading',{name:/Historial/}).waitFor()
  assert.ok(await page.locator('.progress-session').count()>0)
  await page.screenshot({path:path.join(output,'progress-mobile.png'),fullPage:true})
  const strengthId=await page.evaluate(async()=>{
    const activities=await fetch('/api/activities').then(response=>response.json())
    return activities.find(activity=>activity.type==='Strength')?.id
  })
  assert.ok(strengthId,'Production has an existing Strength activity')
  await page.goto(`${base}/activities/${strengthId}`)
  const exerciseLink=page.locator('.exercise-progress-link').first()
  await exerciseLink.waitFor()
  const originalName=(await exerciseLink.innerText()).trim()
  await exerciseLink.click()
  assert.equal(new URL(page.url()).searchParams.get('exercise'),originalName)
  await page.getByRole('heading',{name:/Historial/}).waitFor()
  assert.ok(await page.locator('.progress-session').count()>0)
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await page.screenshot({path:path.join(output,'progress-from-strength-mobile.png'),fullPage:true})
  assert.deepEqual(errors,[])
  await writeFile(path.join(output,'evidence.json'),JSON.stringify({url:base,revision:process.env.TRAZO_REVISION,viewports:evidence,importPage:true,progressPage:true,progressFromStrength:true,browserErrors:errors},null,2))
  console.log('PASS Production UI: wide/mobile color tokens, responsive charts, no page overflow, /import, /progress, detail-to-progress and no browser exceptions.')
} finally { await browser.close() }
