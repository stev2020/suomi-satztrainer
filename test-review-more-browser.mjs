import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {everydayPathState} from './dist/learning-path.mjs';
// Nach der Wiederholungsrunde bietet Vanamo Angemeldeten ein paar neue Sätze aus dem Lernpfad an („Noch Lust?“).
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block',locale:'de-DE'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.addInitScript(()=>sessionStorage.setItem('vanamo-guest-sentences',JSON.stringify(['a','b','c','d','e'])));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 const payload=JSON.parse(fs.readFileSync(new URL('./dist/sentences.json',import.meta.url)));
 const all=[...payload.sentences,...payload.archived_sentences];
 const now=Date.now()-60000,reviews={};
 // Drei fällige Sätze, die nicht in der ersten Etappe des Lernpfads stehen.
 const firstLesson=new Set(everydayPathState(all,{},1).lesson.ids);
 for(const s of payload.sentences.filter(s=>s.level===1&&s.translations?.length&&!firstLesson.has(s.id)).slice(0,3))reviews[s.id+':fi-de']={due:now,interval:0,repetitions:1,updatedAt:now};
 const path=everydayPathState(all,reviews,1),count=path.lesson.remaining.length;
 await page.evaluate(reviews=>window.suomiLearningState.applyCloud({reviews,favorites:[],daily:{},reports:{},writingRatings:{},verbProgress:{},prefs:{level:1,direction:'fi-de',activity:'translate',audioOnly:false,speed:1}}),reviews);
 await page.locator('#start-daily-session').evaluate(button=>button.click());
 await page.locator('#guest-continue').click();
 // Die Runde ist geplant; ab jetzt gilt man als angemeldet (das Angebot gibt es nur mit Konto).
 await page.evaluate(()=>{document.body.dataset.account='authenticated';});
 for(let i=0;i<10&&!(await page.locator('.daily-more, #finish-daily-session').count());i++){
  if(await page.locator('[data-pick-word]').first().isVisible().catch(()=>false))await page.locator('[data-pick-word]').first().click();
  await page.locator('#reveal').click();
  await page.locator('[data-grade="easy"]').click();
 }
 await page.locator('.daily-more').waitFor();
 assert.equal(await page.locator('.daily-more-eyebrow').textContent(),'Noch Lust?');
 assert.equal(await page.locator('.daily-more-title').textContent(),`${count===1?'1 neuer Satz':count+' neue Sätze'} · ${path.topic.title}`);
 assert.equal(await page.locator('#actions').innerHTML(),'','keine zweite Knopfreihe unter der Karte');
 assert.equal(await page.evaluate(()=>document.activeElement?.id),'daily-more-start','der Hauptknopf hat den Fokus');
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:1280,height:1000});
 await page.locator('#daily-more-start').click();
 assert.ok(await page.locator('#practice-view').isVisible());
 assert.equal(await page.locator('#session-progress').textContent(),`0 / ${count}`,'die nächste Etappe des Lernpfads startet');
 assert.deepEqual(errors,[]);
 console.log('Noch Lust?: Angebot nach der Wiederholungsrunde, Fokus, Handy-Breite und Start der nächsten Lernpfad-Etappe geprüft.');
}finally{await browser?.close();server.kill();}
