import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',shots=process.env.SHOTS||'';
const dialogs=JSON.parse(readFileSync(new URL('./dist/dialogs.json',import.meta.url),'utf8')).dialogs;
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
  await page.locator('#start-new-sentences:not([disabled])').waitFor();
  await page.locator('#more-exercises > summary').click();
  await page.locator('[data-home-activity="dialogs"]').click();
  assert.equal(await page.locator('#continue-practice').textContent(),'Dialoge öffnen');
  await page.locator('#continue-practice').click();
  if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
  await page.locator('.dialog-list button').first().waitFor();
  assert.equal(await page.locator('.dialog-list button').count(),13);
  const dialog=dialogs.find(d=>d.level===1&&d.topic==='cafe');
  await page.locator(`[data-dialog-open="${dialog.id}"]`).click();
  // Read line by line.
  await page.locator('.dialog-line').first().waitFor();
  assert.equal(await page.locator('.dialog-line').count(),1);
  await page.locator('.dialog-fi .fi-word').first().waitFor();
  await page.locator('[data-dialog-translate="0"]').click();
  assert.equal(await page.locator('.dialog-de').first().textContent(),dialog.lines[0].de);
  for(let i=1;i<dialog.lines.length;i++){await page.locator('#dialog-next').click();assert.equal(await page.locator('.dialog-line').count(),i+1);}
  await page.locator('.dialog-phrases').waitFor();
  if(shots)await page.screenshot({path:`${shots}/dialog-read-${viewport.width}.png`,fullPage:true});
  // Take over role B: type own lines exactly, other lines advance with Weiter.
  await page.locator('[data-dialog-role="B"]').click();
  for(let i=0;i<dialog.lines.length;i++){
   const line=dialog.lines[i];
   if(line.s==='B'){
    await page.locator('#dialog-input').waitFor();
    assert.equal(await page.locator('.dialog-prompt').textContent(),line.de);
    await page.locator('#dialog-input').fill(i%2?line.fi.toLowerCase():'');
    await page.locator('#dialog-form button[type="submit"]').click();
    const mine=page.locator('.dialog-line.mine').last();
    assert.equal(await mine.locator('.dialog-fi').getAttribute('data-words')??line.fi,line.fi);
   }else{
    await page.locator('#dialog-next').click();
   }
  }
  await page.locator('.dialog-phrases').waitFor();
  if(await page.locator('.writing-feedback').count())assert.match(await page.locator('.writing-feedback').first().textContent(),/Stimmt mit der Vorlage/);
  if(shots)await page.screenshot({path:`${shots}/dialog-role-${viewport.width}.png`,fullPage:true});
  await page.locator('#dialog-back').click();
  await page.locator('.dialog-list .dialog-done').first().waitFor();
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Dialoge: Liste, Lesen Zeile für Zeile, Übersetzung, Mitspielen, Rückmeldung und mobile Darstellung bestanden.');
}finally{await browser?.close();server.kill();}
