import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(r=>server.stdout.once('data',r));
const b=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173',themes=['vanamo','mustikka','ruska','tunturi','kaamos','revontulet'];
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const c=await b.newContext({viewport,locale:'de-DE',serviceWorkers:'block'});
  await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(origin+'/unterstuetzen.html');
  const cta=p.locator('#support-cta');
  await assertText(cta,'Mit 24 € im Jahr unterstützen');
  assert.equal(await cta.isDisabled(),false,'Knopf führt zu Donorbox');
  assert.match(await p.locator('#support-provider').textContent(),/Donorbox/);
  assert.equal(await p.locator('#support-facts').isVisible(),true,'Hinweis direkt unter dem Knopf');
  assert.match(await p.locator('#support-facts').textContent(),/keine Spende im steuerlichen Sinn/);
  assert.deepEqual(await p.locator('[data-support-mode]').allTextContents(),['Einmalig','Monatlich','Jährlich'],'Reihenfolge wie bei Donorbox');
  assert.equal(await p.locator('[data-support-mode="jahr"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['12 €','24 €','36 €']);
  assert.equal(await p.locator('#support-amounts button').nth(1).getAttribute('aria-pressed'),'true','der mittlere ist vorausgewählt');
  await p.locator('[data-support-amount="36"]').click();
  await assertText(cta,'Mit 36 € im Jahr unterstützen');await assertText(p.locator('#support-hint'),'36 € im Jahr – das ist 3 € im Monat.');
  await p.locator('[data-support-mode="monat"]').click();
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['3 €','5 €','10 €']);
  await assertText(cta,'Mit 5 € im Monat unterstützen');
  await p.locator('[data-support-mode="einmal"]').click();
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['3 €','5 €','10 €']);
  await assertText(cta,'Einmalig 5 € geben');
  await p.locator('[data-support-amount="10"]').click();
  await assertText(cta,'Einmalig 10 € geben');
  const [request]=await Promise.all([c.waitForEvent('request',r=>r.url().startsWith('https://donorbox.org/')),cta.click()]);
  assert.equal(request.url(),'https://donorbox.org/vanamo?amount=10&language=de','Klick öffnet Donorbox mit Betrag');
  for(const page of c.pages())if(page!==p)await page.close();
  assert.equal(await p.locator('[data-support-mode="einmal"]').getAttribute('aria-pressed'),'true');

  const note=p.locator('#support-note'),star=p.locator('#support-star');
  assert.equal(await note.isVisible(),false);
  await star.click();assert.equal(await note.isVisible(),true);assert.equal(await star.getAttribute('aria-expanded'),'true');
  assert.equal((await note.locator('p').textContent()).trim(),'Wir rechnen mit rund einem Cent pro aktivem Lernenden im Monat.');
  await p.keyboard.press('Escape');assert.equal(await note.isVisible(),false);
  await star.click();await p.locator('h1').click();assert.equal(await note.isVisible(),false,'Klick daneben schließt');
  await star.click();await p.locator('#support-note-close').click();assert.equal(await note.isVisible(),false);

  assert.equal(await p.locator('#support-goal-bar').getAttribute('aria-valuenow'),'0');
  assert.equal(await p.locator('.support-ways li').count(),5);
  for(const theme of themes){
   await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert(overflow<=0,`${theme} ${viewport.width}px: Seite läuft nicht seitlich über (${overflow}px)`);
  }
  assert.deepEqual(errors,[]);
  if(viewport.width===1280){
   await p.goto(origin+'/');await p.locator('footer a[href="unterstuetzen.html"]').waitFor({state:'attached'});
   for(const f of ['impressum.html','datenschutz.html']){await p.goto(origin+'/'+f);assert.equal(await p.locator('a[href="mailto:hallo@vanamo.app"]').first().isVisible(),true,f);}
  }
  await c.close();
 }
 console.log('Unterstützen im Browser: Donorbox-Hinweis, Beträge, Sternchen-Fenster, Monatsziel, sechs Paletten, Handybreite, Links.');
}finally{await b.close();server.kill();}
async function assertText(locator,expected){assert.equal((await locator.textContent()).trim(),expected);}
