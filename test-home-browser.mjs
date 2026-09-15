import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {VERBS} from './dist/verbs-data.mjs';
import {PRONOUNS,markAsked,markAnswered} from './dist/verb-practice.mjs';
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
const errors=[];
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const home=()=>page.locator('.app-view:not([hidden]) .back-link[data-view="home"]').click();
 const select=activity=>page.locator('[data-home-activity="'+activity+'"]').click();
 await page.goto(origin);
 await page.locator('#continue-practice:not([disabled])').waitFor();
 assert.ok(await page.locator('#home-direction-control').isVisible());
 await page.locator('[data-home-direction="de-fi"]').click();
 assert.equal(await page.locator('#continue-practice').textContent(),'Deutsch → Finnisch üben');
 assert.equal(await page.locator('[data-home-direction="de-fi"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-home-direction="random"]').click();
 assert.equal(await page.locator('#continue-practice').textContent(),'Beide Lernrichtungen üben');
 await page.locator('[data-home-direction="fi-de"]').click();
 assert.equal(await page.locator('#home-review').isDisabled(),true);
 await select('verbs');
 const now=Date.now()-60000;
 const dueKeys=['olla:0','olla:2','puhua:5'];
 let progress={};
 for(const key of dueKeys)progress=markAnswered(markAsked(progress,key,now),key,false,now+1);
 progress=markAnswered(markAsked(progress,'olla:1',now),'olla:1',true,now+1);
 const state={reviews:{},favorites:[],daily:{},reports:{},writingRatings:{},verbProgress:progress,prefs:{level:1,direction:'fi-de',activity:'verbs',audioOnly:false,speed:1,grammarTopic:'negation'}};
 const sentences=JSON.parse(fs.readFileSync('dist/sentences.json','utf8')).sentences.filter(s=>s.level===1&&s.audios.length).slice(0,6);
 for(const [kind,count] of [['fi-de',1],['de-fi',2],['listen',3],['dictation',4]])for(const s of sentences.slice(0,count))state.reviews[s.id+':'+kind]={due:now,interval:0,repetitions:2,updatedAt:now};
 await page.evaluate(state=>window.suomiLearningState.applyCloud(state),state);
 assert.equal(await page.locator('#home-review').textContent(),'3 Verbformen wiederholen');
 assert.equal(await page.locator('#continue-practice').textContent(),'Üben');
 const colors=await page.evaluate(()=>['.today','#home-review','.home-exercises .selected','#continue-practice'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor));
 assert.equal(colors[0],colors[1]);assert.equal(colors[0],colors[2]);assert.notEqual(colors[0],colors[3]);
 assert.equal(await page.locator('#home-view').getByText('3 Verbformen zur Wiederholung').count(),0);
 if(process.env.HOME_SCREENSHOTS)await page.screenshot({path:process.env.HOME_SCREENSHOTS+'/home-desktop.png',fullPage:true});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const button of await page.locator('.home-exercises button').all())assert.ok(await button.isVisible());
  for(const button of await page.locator('.home-direction-control button').all())assert.ok(await button.isVisible());
  if(width===390&&process.env.HOME_SCREENSHOTS)await page.screenshot({path:process.env.HOME_SCREENSHOTS+'/home-mobile.png',fullPage:true});
 }
 await page.setViewportSize({width:1280,height:1000});
 await page.locator('#home-review').click();
 const asked=[];
 for(let i=0;i<3;i++){
  const [pronoun,id]=(await page.locator('.verb-question').textContent()).split(' · '),person=PRONOUNS.indexOf(pronoun);
  const key=id+':'+person;assert.ok(dueKeys.includes(key));assert.ok(!asked.includes(key));asked.push(key);
  if(i===0){
   await page.locator('#verb-input').fill('Entwurf');await home();await page.locator('#home-review').click();
   assert.equal(await page.locator('#verb-input').inputValue(),'Entwurf');
  }
  await page.locator('#verb-input').fill(pronoun+' '+VERBS.find(v=>v.id===id).forms[person]);
  await page.locator('#verb-input').press('Enter');await page.locator('#verb-next').click();
 }
 assert.equal(await page.locator('.verb-results li').count(),3);
 await home();assert.equal(await page.locator('#home-review').isDisabled(),true);
 await page.locator('#continue-practice').click();assert.ok(await page.locator('[data-verb-count="5"]').isVisible());
 await home();
 for(const [activity,label,count] of [['translate','Übersetzen',1],['listen','Hörübung',3],['dictation','Diktat',4]]){
 await select(activity);assert.equal(await page.locator('#continue-title').textContent(),label);
  assert.equal(await page.locator('#continue-practice').textContent(),activity==='translate'?'Finnisch → Deutsch üben':'Üben');
  assert.equal(await page.locator('.home-exercises [aria-pressed="true"]').count(),1);
  assert.equal(await page.locator('#home-review').textContent(),count+' '+(count===1?'Satz':'Sätze')+' wiederholen');
  await page.locator('#home-review').click();
  assert.equal(await page.locator('[data-mode="review"]').getAttribute('aria-pressed'),'true');
  assert.ok((await page.locator('#session-progress').textContent()).endsWith('/ '+count));
  if(activity==='dictation')assert.ok(await page.locator('#dictation-input').isVisible());
  if(activity==='listen')assert.ok(await page.locator('.listening-title').isVisible());
  await home();await page.locator('#continue-practice').click();
  assert.equal(await page.locator('[data-mode="new"]').getAttribute('aria-pressed'),'true');
  await home();
 }
 await select('translate');await page.locator('#home-choose').click();
 assert.ok(await page.locator('[data-activity="writing"]').isVisible());
 assert.ok(await page.locator('[data-activity="grammar"]').isVisible());
 await page.locator('[data-direction="de-fi"]').click();await home();
 assert.equal(await page.locator('#continue-practice').textContent(),'Deutsch → Finnisch üben');
 assert.equal(await page.locator('#home-review').textContent(),'2 Sätze wiederholen');
 assert.equal(await page.evaluate(()=>localStorage.getItem('suomi-learning-v1')),null);
 assert.deepEqual(errors,[]);
 await context.close();
 console.log('PASS: home selector, scoped review counts and launches, due-only verb round, preserved draft, identical colors, mobile layout, other exercises and guest privacy.');
}finally{await browser?.close();server.kill();}
