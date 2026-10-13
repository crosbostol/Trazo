import assert from 'node:assert/strict'
import path from 'node:path'
import { strengthFixtures } from './strength-progress-checks.mjs'

export async function checkStrengthProgressUi(page,client,output) {
  const request = async (route,method='GET',body,expected=200) => {
    const response = await client.fetch(route,{method,body:body===undefined?undefined:JSON.stringify(body)})
    const text = await response.text()
    assert.equal(response.status,expected,text)
    return text ? JSON.parse(text) : null
  }
  await page.getByRole('link',{name:'Progreso',exact:true}).click()
  await page.getByText(/Aún no hay ejercicios de fuerza/).waitFor()
  const ids = await strengthFixtures(request)
  try {
    await page.reload()
    await page.getByLabel('Ejercicio',{exact:true}).selectOption('Bench Press')
    await page.getByRole('heading',{name:'Historial · Bench Press',exact:true}).waitFor()
    const cards = page.getByRole('region',{name:'Récords personales'})
    assert.match(await cards.innerText(),/Mayor peso[\s\S]*50/)
    assert.match(await cards.innerText(),/Más repeticiones[\s\S]*20/)
    assert.match(await cards.innerText(),/Mayor volumen de un set[\s\S]*240/)
    assert.match(await cards.innerText(),/Mayor volumen de sesión[\s\S]*480/)
    assert.equal(await page.locator('.progress-session').count(),3)
    assert.match(await page.locator('.progress-session').first().innerText(),/3 sets · 18 reps[\s\S]*440/)
    assert.match(await page.locator('.progress-session').first().innerText(),/Izquierdo[\s\S]*Derecho[\s\S]*Ambos/)
    await page.locator('.progress-chart .recharts-surface').waitFor()
    for(const [name,width,height] of [['wide',1920,1080],['mobile',390,844]]) {
      await page.setViewportSize({width,height})
      await page.waitForTimeout(1800)
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: no page overflow`)
      assert.equal(await page.locator('.progress-chart .recharts-line-dot').count(),3,'One point per Activity, including same day')
      await page.screenshot({path:path.join(output,`strength-progress-${name}.png`),fullPage:true})
    }
    await page.locator('.progress-session').first().getByRole('link',{name:/Ver actividad/}).click()
    await page.waitForURL(`**/activities/${ids[0]}`)
    await page.getByRole('heading',{name:'Fuerza',exact:true}).waitFor()
    const detailLink=page.getByRole('link',{name:'Ver progreso de Bench Press',exact:true})
    assert.equal(await detailLink.count(),1)
    let keyboardReached=false
    for(let attempt=0;attempt<20;attempt++) {
      await page.keyboard.press('Tab')
      if(await detailLink.evaluate(el=>document.activeElement===el)) {keyboardReached=true;break}
    }
    assert.ok(keyboardReached,'Exercise link is reachable by keyboard')
    assert.notEqual(await detailLink.evaluate(el=>getComputedStyle(el).outlineStyle),'none','Keyboard focus is visible')
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/progress\?exercise=/)
    assert.equal(new URL(page.url()).searchParams.get('exercise'),'Bench Press')
    await page.getByRole('heading',{name:'Historial · Bench Press',exact:true}).waitFor()
    assert.match(await cards.innerText(),/Mayor peso[\s\S]*50/)
    assert.equal(await page.getByLabel('Ejercicio',{exact:true}).inputValue(),'Bench Press')
    await page.goto(`http://127.0.0.1:5180/progress?${new URLSearchParams({exercise:'  bEnCh PrEsS  '})}`)
    await page.getByRole('heading',{name:'Historial · Bench Press',exact:true}).waitFor()
    assert.equal(await page.getByLabel('Ejercicio',{exact:true}).inputValue(),'Bench Press','The API resolves trim and case')
    await page.goto(`http://127.0.0.1:5180/activities/${ids[0]}`)
    await page.getByRole('heading',{name:'Fuerza',exact:true}).waitFor()
    for(const [name,exerciseName,history,pr] of [
      ['special','Pull / up & hold?','Historial · Pull / up & hold?',/Más repeticiones[\s\S]*15/],
      ['unicode','Bénch Press','Historial · Bénch Press',/Mayor peso[\s\S]*100/],
    ]) {
      const link=page.getByRole('link',{name:`Ver progreso de ${exerciseName}`,exact:true})
      await link.click()
      assert.equal(new URL(page.url()).searchParams.get('exercise'),exerciseName,`${name}: exact original name survives URL`)
      await page.getByRole('heading',{name:history,exact:true}).waitFor()
      assert.equal(await page.getByLabel('Ejercicio',{exact:true}).inputValue(),exerciseName)
      assert.match(await cards.innerText(),pr)
      assert.equal(await page.locator('.progress-session').count(),1)
      await page.goto(`http://127.0.0.1:5180/activities/${ids[0]}`)
      await page.getByRole('heading',{name:'Fuerza',exact:true}).waitFor()
    }
    for(const [name,width,height] of [['desktop',1920,1080],['mobile',390,844]]) {
      await page.setViewportSize({width,height})
      await page.getByRole('link',{name:'Ver progreso de Bench Press',exact:true}).click()
      await page.getByRole('heading',{name:'Historial · Bench Press',exact:true}).waitFor()
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${name}: no page overflow after detail link`)
      await page.screenshot({path:path.join(output,`strength-progress-linked-${name}.png`),fullPage:true})
      await page.goto(`http://127.0.0.1:5180/activities/${ids[0]}`)
      await page.getByRole('heading',{name:'Fuerza',exact:true}).waitFor()
    }
    await page.getByRole('link',{name:'Progreso',exact:true}).click()
    assert.equal(new URL(page.url()).searchParams.has('exercise'),false,'Navigation without a query keeps the default behavior')
    await page.getByLabel('Ejercicio',{exact:true}).selectOption('Pull / up & hold?')
    assert.equal(new URL(page.url()).searchParams.get('exercise'),'Pull / up & hold?','Selector updates the URL')
    await page.getByText('Este ejercicio aún no tiene pesos registrados.',{exact:true}).waitFor()
    assert.equal(await page.locator('.progress-session').count(),1)
    assert.equal(await page.locator('.progress-chart .recharts-surface').count(),0)
    assert.equal(await cards.getByText('Sin datos suficientes',{exact:true}).count(),3)
    assert.match(await page.locator('.progress-session').innerText(),/— reps con peso conocido · — kg/)
    await page.screenshot({path:path.join(output,'strength-progress-no-weight-mobile.png'),fullPage:true})
    await page.goto(`http://127.0.0.1:5180/progress?${new URLSearchParams({exercise:'Missing / & ? 💪'})}`)
    await page.getByText('Este ejercicio no está en tu historial de fuerza. Puedes elegir uno del selector.',{exact:true}).waitFor()
    assert.equal(await page.getByLabel('Ejercicio',{exact:true}).inputValue(),'')
    await page.getByLabel('Ejercicio',{exact:true}).selectOption('Zero')
    assert.equal(new URL(page.url()).searchParams.get('exercise'),'Zero')
    await page.getByRole('heading',{name:'Historial · Zero',exact:true}).waitFor()
    await page.locator('.progress-chart .recharts-surface').waitFor()
    await page.waitForTimeout(1800)
    assert.equal(await page.locator('.progress-chart .recharts-line-dot').count(),1)
  } finally {
    for(const id of ids) await request(`/api/activities/${id}`,'DELETE',undefined,204)
  }
  await page.reload()
  await page.getByText(/Aún no hay ejercicios de fuerza/).waitFor()
  console.log('PASS UI strength progress: detail links, encoded names/Unicode, direct URL, unknown exercise, URL sync, keyboard focus, empty/selection, 4 PRs, chart, null weights and desktop/mobile')
}
