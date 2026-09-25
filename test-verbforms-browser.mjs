import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {VERBS} from './dist/verbs-data.mjs';
import {PRONOUNS,markAsked,markAnswered} from './dist/verb-practice.mjs';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
const browser=await chromium.launch({headless:true});
const errors=[];
const origin='http://localhost:4173';
const base={reviews:{},favorites:[],daily:{},reports:{},writingRatings:{},verbProgress:{},prefs:{level:1,direction:'fi-de',audioOnly:false,activity:'verbs',speed:1,grammarTopic:'negation'}};
const session={access_token:'test-access',refresh_token:'test-refresh',user:{id:'00000000-0000-4000-8000-000000000001',user_metadata:{username:'verbtest'}}};
let cloud=structuredClone(base),audioRequests=0;
async function context(options={}){
 const c=await browser.newContext({serviceWorkers:'block',...options});
 await c.addInitScript(()=>sessionStorage.setItem('suomi-guest-exercise-accepted','1'));
 await c.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname.endsWith('.supabase.co')){
   if(url.pathname==='/auth/v1/token')return route.fulfill({json:session});
   if(url.pathname==='/rest/v1/learning_state'){
    if(request.method()==='POST'){cloud=request.postDataJSON().state;return route.fulfill({status:201,body:''});}
    return route.fulfill({json:[{state:cloud}]});
   }
   return route.fulfill({json:[]});
  }
  if(request.resourceType()==='media'){const active=await request.frame().evaluate(()=>window.suomiLearningState?.snapshot().prefs.activity).catch(()=>null);if(active==='verbs')audioRequests++;}
  return route.abort();
 });
 return c;
}
async function choose(page,count){
 if(!await page.locator('#home-choose').isVisible())await page.locator('#more-exercises > summary').click();
 await page.locator('#home-choose').click();
 await page.locator('[data-activity="verbs"]').click();
 await page.locator('[data-verb-count="'+count+'"]').click();
 await page.locator('#verb-input').waitFor();
}
async function answer(page,wrong=false){
 const question=(await page.locator('.verb-question').textContent()).split(' · ');
 const p=PRONOUNS.indexOf(question[0]),id=question[1].replace(/\s*\(.*\)\s*$/,''),v=VERBS.find(v=>v.id===id);
 await page.locator('#verb-input').fill(wrong?'falsch':PRONOUNS[p]+' '+v.forms[p]);
 await page.locator('#verb-input').press('Enter');
 await page.locator('#verb-next').waitFor();
 assert.equal(await page.locator('.verb-forms tbody tr').count(),6);
 assert.equal(await page.locator('.verb-target td').textContent(),v.forms[p]);
 assert.equal(await page.locator(wrong?'.verb-wrong':'.verb-correct').count(),1);
 assert.equal(await page.locator('#play-audio').count(),0);
 return v.id+':'+p;
}
try {
 const c=await context({viewport:{width:390,height:844}});
 const page=await c.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);
 await page.waitForFunction(()=>window.suomiLearningState?.snapshot && document.querySelector('#total').textContent.includes('finnische Sätze'));
 await choose(page,5);
 assert.equal(await page.locator('#practice-toolbar').isVisible(),false);
 assert.equal(await page.locator('#settings-level-row').isVisible(),false);
 assert.equal(await page.locator('.verb-forms').count(),0);
 await page.locator('#verb-input').press('Enter');
 assert.equal(await page.locator('.verb-forms').count(),0);
 const wrongKey=await answer(page,true);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 for(let i=1;i<5;i++){await page.locator('#verb-next').click();await answer(page);}
 await page.locator('#verb-next').click();
 assert.equal(await page.locator('.verb-results li').count(),5);
 let snapshot=await page.evaluate(()=>window.suomiLearningState.snapshot());
 assert.equal(Object.values(snapshot.daily).reduce((a,b)=>a+b,0),5);
 assert.equal(snapshot.verbProgress[wrongKey].errors,1);
 assert.equal(await page.evaluate(()=>localStorage.getItem('suomi-learning-v1')),null);
 await page.locator('#verb-again').click();
 await page.locator('[data-verb-count="10"]').click();
 for(let i=0;i<10;i++){await answer(page);await page.locator('#verb-next').click();}
 assert.equal(await page.locator('.verb-results li').count(),10);
 await page.reload();
 await page.waitForFunction(()=>window.suomiLearningState?.snapshot);
 assert.deepEqual(await page.evaluate(()=>window.suomiLearningState.snapshot().verbProgress),{});
 await c.close();

 const logged=await context({viewport:{width:1280,height:900}});
 await logged.addInitScript(({session,base})=>{
  if(!localStorage.getItem('suomi-auth-session-v1')){
   localStorage.setItem('suomi-auth-session-v1',JSON.stringify(session));
   localStorage.setItem('suomi-learning-v1',JSON.stringify(base));
  }
 },{session,base});
 const p=await logged.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin);
 await p.waitForFunction(()=>document.querySelector('[data-verb-count="5"]'));
 assert.ok(await p.locator('#progress-nav').isVisible());assert.equal(await p.locator('#account-button').textContent(),'Konto');
 if(!await p.locator('#continue-practice').isVisible())await p.locator('#more-exercises > summary').click();
 await p.locator('#continue-practice').click();
 await p.locator('[data-verb-count="5"]').click();
 const key=await answer(p);
 const before=await p.locator('.verb-question').textContent();
 await p.locator('#verb-next').click();
 await p.locator('#verb-input').fill('mein Entwurf');
 const current=await p.locator('.verb-question').textContent();
 cloud={...cloud,verbProgress:markAnswered(markAsked(cloud.verbProgress,'olla:2',Date.now()),'olla:2',false,Date.now()+1)};
 await p.locator('#account-button').click();await p.locator('#sync-now').click();
 await p.waitForFunction(()=>window.suomiLearningState.snapshot().verbProgress['olla:2']?.errors===1);
 await p.locator('#close-account').click();
 assert.equal(await p.locator('#verb-input').inputValue(),'mein Entwurf');
 assert.equal(await p.locator('.verb-question').textContent(),current);
 assert.ok((await p.evaluate(()=>window.suomiLearningState.snapshot())).verbProgress[key].attempts>=1);
 const stored=await p.evaluate(()=>JSON.parse(localStorage.getItem('suomi-learning-v1')));
 assert.ok(stored.verbProgress[key].attempts>=1);
 await p.reload();
 await p.waitForFunction(()=>document.querySelector('[data-verb-count="5"]'));
 assert.ok((await p.evaluate(()=>window.suomiLearningState.snapshot())).verbProgress[key].attempts>=1);
 await logged.close();
 assert.equal(audioRequests,0);
 assert.deepEqual(errors,[]);
 console.log('Browser checks passed: mobile and desktop, 5/10 tasks, answer table, guest reset, account persistence, sync preserves draft.');
} finally {await browser.close();server.kill();}
