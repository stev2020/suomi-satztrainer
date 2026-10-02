// „Satz des Tages“ für Angemeldete: Die Karte von heute liegt auf dem Gerät und steht beim
// nächsten Öffnen sofort da – ohne auf Sätze und Wortanalyse zu warten. Die Karte von morgen
// wird mit vorbereitet; ein Satz, den es nicht mehr gibt, wird ersetzt.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',id='11111111-1111-4111-a111-111111111111',key='vanamo-daily-sentence:'+id;
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'de-DE'});
 let hold=false;const requested=[];
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.route('**/auth/v1/**',route=>route.fulfill(json({access_token:'t',refresh_token:'t',user:{id,user_metadata:{username:'stefan'}}})));
 await context.route('**/rest/v1/**',route=>route.fulfill(json([])));
 // Die beiden großen Dateien lassen sich anhalten: so zeigt sich, was ohne sie schon da ist.
 await context.route(/\/(sentences|lexicon)\.json/,async route=>{requested.push(route.request().url().split('/').pop().split('?')[0]);if(hold)await new Promise(resolve=>setTimeout(resolve,4000));await route.continue();});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await page.evaluate(id=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'t',refresh_token:'t',user:{id,user_metadata:{username:'stefan'}}})),id);
 const words=()=>page.locator('#daily-sentence .guest-fi').allTextContents();
 const stored=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)||'null'),key);
 const today=await page.evaluate(()=>new Date().toLocaleDateString('sv-SE'));

 // Erster Besuch des Tages: Karte erscheint, heute und morgen liegen danach auf dem Gerät.
 await page.reload();await page.locator('#daily-sentence .daily-words').waitFor();
 const first=await words(),saved=await stored();
 assert.equal(saved.day,today);assert.equal(saved.card.sentence.id,saved.id);assert.deepEqual(saved.card.cols.map(c=>c.fi),first);
 assert.ok(saved.next&&saved.next.day>today&&saved.next.card.cols.length>0,'die Karte von morgen ist vorbereitet');
 assert.ok(requested.includes('lexicon.json'));

 // Zweiter Besuch: Karte ist da, bevor Sätze und Wortanalyse geladen sind.
 hold=true;requested.length=0;
 await page.reload();await page.locator('#daily-sentence .daily-words').waitFor({timeout:3000});
 assert.deepEqual(await words(),first,'derselbe Satz');
 assert.ok(!requested.includes('lexicon.json'),'die Wortanalyse wird dafür nicht geladen');
 await page.locator('#daily-sentence .cycle-word').first().click();
 assert.equal(await page.locator('#daily-sentence .cycle-word.show').count(),1,'Wörter lassen sich antippen');
 // Übersetzen dreht alle Kacheln um und zeigt den Satz; der Knopf bleibt und schaltet wieder zurück.
 const tiles=await page.locator('#daily-sentence .daily-tile').count(),translate=page.locator('#daily-sentence .daily-translate');
 assert.equal(tiles,first.length,'jedes Wort ist eine Kachel');
 assert.equal(await page.locator('#daily-sentence .daily-tail .sentence-source-icon').count(),1,'das Quellen-Symbol hängt am Satz');
 await translate.click();
 assert.equal(await page.locator('#daily-sentence .cycle-word.show').count(),tiles,'alle Kacheln umgedreht');
 assert.equal(await translate.getAttribute('aria-pressed'),'true');
 assert.ok(await page.locator('#daily-translation.shown').count(),'Übersetzung sichtbar');
 await translate.click();
 assert.equal(await page.locator('#daily-sentence .cycle-word.show').count(),0,'zurückgedreht');
 assert.equal(await page.locator('#daily-translation.shown').count(),0,'Übersetzung wieder verdeckt');

 // Nächster Tag: die vorbereitete Karte steht sofort da; danach wird übermorgen vorbereitet.
 const tomorrowWords=saved.next.card.cols.map(c=>c.fi);
 await page.evaluate(([key,today])=>{const v=JSON.parse(localStorage.getItem(key));v.day='2000-01-01';v.next.day=today;localStorage.setItem(key,JSON.stringify(v));},[key,today]);
 requested.length=0;
 await page.reload();await page.locator('#daily-sentence .daily-words').waitFor({timeout:3000});
 assert.deepEqual(await words(),tomorrowWords,'die vorbereitete Karte wird gezeigt');
 hold=false;
 await page.waitForFunction(([key,today])=>{const v=JSON.parse(localStorage.getItem(key)||'null');return v?.day===today&&v.next?.day>today;},[key,today],{timeout:20000});
 assert.deepEqual(await words(),tomorrowWords,'die Karte bleibt stehen, während für morgen vorbereitet wird');

 // Ein Satz, den es nicht mehr gibt, bleibt nicht stehen: sobald die Sätze da sind, wird neu gewählt.
 await page.evaluate(key=>{const v=JSON.parse(localStorage.getItem(key));v.id=v.card.sentence.id=987654321;v.card.cols=[{fi:'Vanha',gloss:'alt'}];localStorage.setItem(key,JSON.stringify(v));},key);
 await page.reload();await page.waitForFunction(()=>{const w=[...document.querySelectorAll('#daily-sentence .guest-fi')].map(e=>e.textContent);return w.length>1&&!w.includes('Vanha');},null,{timeout:20000});
 assert.notEqual((await stored()).id,987654321);

 // Abgemeldet: keine Karte.
 await page.evaluate(()=>localStorage.removeItem('suomi-auth-session-v1'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#daily-sentence')?.hidden);
 assert.deepEqual(errors,[]);
 console.log('PASS: Satz des Tages – sofort aus dem Gerätespeicher, Karte von morgen vorbereitet, veralteter Satz ersetzt, Gäste ohne Karte');
}finally{await browser?.close();server.kill();}
