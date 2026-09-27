// Lernpfad: neue Sätze in drei Schritten (Lesen → Satz bauen → Wort merken), Bewertung erst nach Schritt 3.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const [viewport,reducedMotion] of [[{width:1100,height:950},'reduce'],[{width:390,height:844},'no-preference']]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE',reducedMotion});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
  await page.evaluate(()=>{const t=document.getElementById('path-toggle');if(t&&!t.hidden&&t.getAttribute('aria-expanded')==='false')t.click();});await page.locator('#start-new-sentences').click();
  if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
  const reviews=()=>page.evaluate(()=>Object.keys(window.suomiLearningState.snapshot().reviews).length);
  // Schrittwechsel sind animiert: erst warten, bis die Karte wieder ruht.
  const settle=()=>page.waitForFunction(()=>!document.getElementById('card').matches('.cycle-leaving,.cycle-entering'));
  const step=async()=>{await settle();return page.locator('.cycle-steps li.current').textContent().then(t=>t.replace(/\d/,'').trim());};
  const build=async()=>{const hint=await page.locator('#word-hint').textContent(),extra=Number(hint.match(/(\d) W/)[1]),count=await page.locator('[data-pick-word]').count();for(let i=0;i<count-extra;i++)await page.locator(`[data-pick-word="${i}"]`).click();await page.locator('#reveal').click();};
  const full=async g=>{await settle();await page.locator('#cycle-next').click();await settle();await build();await page.locator('#cycle-next').click();await settle();await page.locator('#cycle-flip').click();await page.locator(`[data-grade="${g}"]`).click();await settle();};
  // Schritt 1
  assert.equal(await step(),'Lesen');
  assert.ok(await page.locator('.cycle-words .guest-gloss').first().isVisible());
  assert.ok((await page.locator('.cycle-card .guest-translation').textContent()).trim().length>1);
  const first=(await page.locator('.cycle-words').textContent()).trim();
  if(reducedMotion==='reduce'){await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('Space');}else await page.locator('#cycle-next').click();
  // Schritt 2: Bewerten erst nach Schritt 3
  assert.equal(await step(),'Satz bauen');
  await build();
  const before=await reviews();
  await page.keyboard.press('1');
  assert.equal(await reviews(),before,'no grade before step 3');
  assert.ok(await page.locator('#cycle-next').isVisible());
  await page.locator('#cycle-next').click();
  // Schritt 3
  assert.equal(await step(),'Wort merken');
  assert.equal(await page.locator('[data-grade]').count(),0,'grades appear after flipping');
  await page.locator('#cycle-flip').click();
  assert.equal(await page.locator('#cycle-flip').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.guest-flip-note').textContent(),/Grundform/);
  if(reducedMotion!=='reduce'){await page.locator('[data-grade="again"]').click();await page.locator('#card.cycle-leaving').waitFor();}else await page.locator('[data-grade="again"]').click();
  await settle();
  assert.equal(await reviews(),before+1);
  // Nächster Satz beginnt wieder mit Lesen; der „Nochmal“-Satz kommt später ohne Dreischritt zurück
  assert.equal(await step(),'Lesen');
  await full('easy');await full('easy');await settle();
  assert.equal(await page.locator('#cycle-next').count(),0,'repeated sentence skips the cycle');
  assert.ok(await page.locator('#word-bank').isVisible());
  assert.ok(first.length>0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  assert.equal(await page.evaluate(()=>localStorage.getItem('suomi-learning-v1')),null,'guests do not store progress');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Lernpfad-Dreischritt: Lesen mit Bedeutungen, Satz bauen, Wort umdrehen, Bewertung erst danach, Wiederholung ohne Dreischritt, Tastatur und Handy bestanden.');
}finally{await browser?.close();server.kill();}
