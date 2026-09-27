// Übersetzen ohne Eingabe: die Satzkachel dreht sich zur Übersetzung; Klick dreht zurück.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1100,height:900},serviceWorkers:'block',locale:'de-DE'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 await page.locator('#more-exercises > summary').click();
 await page.locator('[data-home-direction="fi-de"]').click();
 await page.locator('#home-view [data-difficulty="hard"]').click();
 await page.locator('#continue-practice').click();
 const skip=page.getByText('Ohne Konto fortfahren');if(await skip.count())await skip.first().click();
 const text=(await page.locator('#card .sentence').first().textContent()).trim();
 // Antippen der Kachel (nicht eines Wortes) deckt auf wie der Knopf
 await page.locator('#card .sentence').click({position:{x:6,y:6}});
 const flip=page.locator('#card .sentence-flip');
 assert.equal(await flip.getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#card .translation').isHidden(),true,'no separate translation box');
 assert.equal((await page.locator('#card .sentence-front').textContent()).trim(),text);
 assert.ok((await page.locator('#card .sentence-back').textContent()).trim().length>1);
 await flip.click({position:{x:12,y:12}});
 assert.equal(await flip.getAttribute('aria-pressed'),'false');
 await flip.press('Enter');
 assert.equal(await flip.getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#grade-again').isVisible());
 assert.deepEqual(errors,[]);
 console.log('Umdrehen beim Übersetzen: Antippen deckt auf, Kachel dreht zur Übersetzung, Klick und Enter drehen zurück, Bewertung sichtbar.');
}finally{await browser?.close();server.kill();}
