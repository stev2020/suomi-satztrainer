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
 // Looking words up in an exercise must not create difficult words.
 await page.locator('#start-new-sentences').click();
 if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
 await page.locator('#card .fi-word').first().click();
 await page.locator('.word-popover:not([hidden])').waitFor();
 assert.equal((await page.evaluate(()=>window.suomiDifficultDeck())).entries.length,0,'Nachschlagen zählt nicht');
 await page.locator('#games-nav').click();
 assert.equal(await page.locator('[data-hyppy-deck]').count(),2,'keine eigene dritte Liste mehr');
 await page.waitForFunction(()=>document.getElementById('hyppy-grund-info').textContent==='669 Wörter und Wendungen');
 // Twelve sentences graded "Nochmal": their words are mixed into the basic list.
 await page.evaluate(ids=>{const state=window.suomiLearningState.snapshot();ids.forEach((id,i)=>{state.reviews[`${id}:fi-de`]={due:Date.now(),interval:i<12?1:30,repetitions:2,updatedAt:Date.now()-i};});window.suomiLearningState.applyCloud(state);},level3.map(s=>s.id));
 await page.locator('[data-hyppy-deck="verben"]').click();
 await page.locator('[data-hyppy-deck="grund"]').click();
 await page.waitForFunction(()=>/^669 Wörter · \d+ schwierige aus deinen Übungen kommen öfter dran$/.test(document.getElementById('hyppy-grund-info').textContent));
 if(shots)await page.screenshot({path:`${shots}/hyppy-grund-mix.png`,fullPage:true});
 await page.locator('#hyppy-start').click();
 await page.locator('#game-stage canvas').waitFor({timeout:20000});
 assert.equal(await page.locator('#game-overlay').isHidden(),false);
 await page.goBack();
 await page.locator('#game-overlay').waitFor({state:'hidden'});
 assert.deepEqual(errors,[]);
 console.log('Hyppy: schwierige Wörter im Grundwortschatz, Nachschlagen zählt nicht, Spielstart bestanden.');
}finally{await browser?.close();server.kill();}
