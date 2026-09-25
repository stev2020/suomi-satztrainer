import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',shots=process.env.SHOTS||'';
const level3=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8')).sentences.filter(s=>s.level===3).slice(0,20);
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await page.locator('#start-new-sentences:not([disabled])').waitFor();
 await page.locator('#games-nav').click();
 await page.locator('[data-hyppy-deck="schwer"]').click();
 await page.waitForFunction(()=>/Noch 0 von 10/.test(document.getElementById('hyppy-difficult-count').textContent));
 assert.equal(await page.locator('#hyppy-start').isDisabled(),true,'zu wenige Wörter: Start gesperrt');
 // Grade twelve sentences with "Nochmal" (as cloud state) and tap-lookups count too.
 await page.evaluate(ids=>{const state=window.suomiLearningState.snapshot();ids.forEach((id,i)=>{state.reviews[`${id}:fi-de`]={due:Date.now(),interval:i<12?1:30,repetitions:2,updatedAt:Date.now()-i};});window.suomiLearningState.applyCloud(state);},level3.map(s=>s.id));
 await page.locator('[data-hyppy-deck="grund"]').click();
 await page.locator('[data-hyppy-deck="schwer"]').click();
 await page.waitForFunction(()=>/^\d+ Wörter aus deinen Fehlern/.test(document.getElementById('hyppy-difficult-count').textContent));
 assert.equal(await page.locator('#hyppy-start').isDisabled(),false);
 if(shots)await page.screenshot({path:`${shots}/hyppy-schwer.png`,fullPage:true});
 await page.locator('#hyppy-start').click();
 await page.locator('#game-stage canvas').waitFor({timeout:20000});
 assert.equal(await page.locator('#game-overlay').isHidden(),false);
 // Switching back to another deck re-enables start.
 await page.goBack();
 await page.locator('#game-overlay').waitFor({state:'hidden'});
 await page.locator('[data-hyppy-deck="verben"]').click();
 assert.equal(await page.locator('#hyppy-start').isDisabled(),false);
 assert.deepEqual(errors,[]);
 console.log('Hyppy „Meine schwierigen Wörter“: Sperre, Befüllung aus Bewertungen, Spielstart und Deckwechsel bestanden.');
}finally{await browser?.close();server.kill();}
