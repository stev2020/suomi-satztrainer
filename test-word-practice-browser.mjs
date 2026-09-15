import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://localhost:4173'?route.continue():route.abort());
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:4173');await page.locator('#continue-practice:not([disabled])').waitFor();
 await page.locator('#home-view [data-difficulty="easy"]').click();
 await page.locator('#continue-practice').click();
 for(const direction of ['fi-de','de-fi','random']){
  await page.locator('#practice-settings').evaluate(el=>el.open=true);
  await page.locator(`[data-direction="${direction}"]`).click();
  await page.locator('#practice-settings').evaluate(el=>el.open=false);
  assert.equal(await page.locator('#translation-input').count(),0);
  await page.locator('#reveal').click();assert.match(await page.locator('#notice').textContent(),/Wähle/);
  const hint=await page.locator('#word-hint').textContent(),extra=Number(hint.match(/(\d) W/)[1]);
  const count=await page.locator('[data-pick-word]').count(),length=count-extra;
  await page.locator('[data-pick-word="0"]').click();
  assert.ok(await page.locator('[data-pick-word="0"]').isDisabled());
  await page.locator('[data-return-word="0"]').click();assert.ok(await page.locator('[data-pick-word="0"]').isEnabled());
  for(let i=0;i<length;i++)await page.locator(`[data-pick-word="${i}"]`).click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#reveal').click();assert.ok(await page.locator('.word-result.correct').isVisible());
  await page.locator('#grade-again').click();assert.equal(await page.locator('[data-return-word]').count(),0);
  const remaining=await page.locator('[data-pick-word]').count();await page.locator(`[data-pick-word="${remaining-1}"]`).click();await page.locator('#reveal').click();
  assert.ok(await page.locator('.word-result.incorrect').isVisible());
  await page.locator('#grade-again').click();
 }
 await page.locator('#practice-settings').evaluate(el=>el.open=true);await page.locator('[data-direction="de-fi"]').click();
 await page.locator('#practice-view [data-difficulty="hard"]').click();assert.ok(await page.locator('#translation-input').isVisible());
 await page.locator('[data-direction="fi-de"]').click();assert.equal(await page.locator('#translation-input').count(),0);
 await page.locator('#practice-view [data-difficulty="easy"]').click();
 await page.locator('[data-activity="listen"]').click();assert.equal(await page.locator('#word-bank').count(),0);
 assert.deepEqual(errors,[]);console.log('Browser: both directions, random, removal, correct/wrong, next card, hard mode, listening and mobile passed');
}finally{await browser?.close();server.kill();}
