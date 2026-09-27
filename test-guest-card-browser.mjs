// Satzkarte für Besucher ohne Konto: drei Schritte, Wechselanimation, Umschalten beim Anmelden.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const [viewport,reducedMotion] of [[{width:1200,height:900},'reduce'],[{width:390,height:844},'no-preference']]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE',reducedMotion});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('#guest-card:not(.is-loading)').waitFor();
  assert.equal(await page.locator('.home-daily').isHidden(),true,'guests see the sentence card instead of reviews');
  // Schritt 1: Wörter mit Bedeutung und Übersetzung
  const words=await page.locator('.guest-word').count();
  assert.ok(words>=3&&words<=6);
  assert.equal(await page.locator('.guest-gloss').count(),words);
  for(const gloss of await page.locator('.guest-gloss').allTextContents())assert.ok(gloss.trim());
  const translation=(await page.locator('.guest-translation').textContent()).trim();
  assert.ok(translation.length>2);
  const wait=()=>page.waitForFunction(()=>!document.querySelector('.guest-stage').matches('.is-leaving,.is-entering'));
  // Schritt 2: Übersetzung aus Wörtern bauen
  await page.locator('[data-guest="step"]').click();
  if(reducedMotion!=='reduce'){await page.locator('.guest-stage.is-leaving').waitFor();}
  await wait();
  await page.locator('.guest-bank').waitFor();
  assert.equal(await page.locator('[data-guest="check"]').isDisabled(),true);
  const expected=translation.normalize('NFC').split(/\s+/u).map(w=>w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'')).filter(Boolean);
  for(const word of expected)await page.locator('.guest-bank button:not(:disabled)',{hasText:new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).first().click();
  await page.locator('[data-guest="check"]').click();
  assert.equal((await page.locator('.guest-feedback').textContent()).trim(),'Richtig!');
  assert.ok(await page.locator('.guest-answer.is-right').isVisible());
  // Schritt 3: Wort umdrehen
  await page.locator('[data-guest="step"]').click();await wait();
  const card=page.locator('.guest-flip');
  assert.equal(await card.getAttribute('aria-pressed'),'false');
  await card.click();
  assert.equal(await card.getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.guest-flip-note').textContent(),/Grundform/);
  // Nächster Satz beginnt wieder mit Schritt 1
  await page.locator('[data-guest="new"]').click();await wait();
  assert.ok(await page.locator('.guest-words').isVisible());
  assert.equal(await page.locator('.guest-steps li.current').textContent().then(t=>t.replace(/\d/,'').trim()),'Lesen');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  // Angemeldet: wieder „Sätze wiederholen“
  await page.evaluate(()=>{document.body.dataset.account='authenticated';});
  await page.locator('#guest-card').waitFor({state:'hidden'});
  assert.equal(await page.locator('.home-daily').isVisible(),true);
  await page.evaluate(()=>{document.body.dataset.account='guest';});
  await page.locator('#guest-card').waitFor({state:'visible'});
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Gäste-Satzkarte: Lesen mit Wortbedeutungen, Satz bauen, Wort umdrehen, Wechselanimation, An-/Abmelden und mobile Darstellung bestanden.');
}finally{await browser?.close();server.kill();}
