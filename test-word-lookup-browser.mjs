import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173';
const shots=process.env.SHOTS||'';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('#start-new-sentences:not([disabled])').click();
  if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
  const sentence=page.locator('#card p.sentence[lang="fi"]');
  await sentence.locator('.fi-word').first().waitFor();
  const text=await sentence.getAttribute('data-words');
  assert.ok(text,'Satz ist antippbar');
  const words=sentence.locator('.fi-word');
  assert.ok(await words.count()>=1);
  // Visible sentence text is unchanged by the enhancement.
  assert.equal((await sentence.locator('.fi-words').textContent()),text);
  await words.first().click();
  const pop=page.locator('.word-popover:not([hidden])');
  await pop.waitFor();
  assert.ok((await pop.locator('.word-popover-form').textContent()).length>3);
  assert.equal(await words.first().getAttribute('aria-expanded'),'true');
  if(shots)await page.screenshot({path:`${shots}/lookup-${viewport.width}.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.word-popover:not([hidden])').count(),0);
  // Space on a word opens it and must not reveal the card.
  await words.last().focus();await page.keyboard.press('Space');
  await pop.waitFor();
  assert.equal(await page.locator('#card.revealed').count(),0);
  await page.mouse.click(5,5);
  if(await page.locator('#word-bank button').count())await page.locator('#word-bank button').first().click();
  await page.locator('#reveal').click();
  await page.locator('#card.revealed').waitFor();
  assert.ok(await page.locator('#card [data-words] .fi-word').count()>=1,'Nach dem Aufdecken weiterhin antippbar');
  if(shots)await page.screenshot({path:`${shots}/revealed-${viewport.width}.png`,fullPage:true});
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Wort antippen: Browserprüfung bestanden.');
}finally{await browser?.close();server.kill();}
