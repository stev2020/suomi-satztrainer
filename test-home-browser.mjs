import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {VERBS} from './dist/verbs-data.mjs';
import {EVERYDAY_PATH,LEVEL_PATHS} from './dist/learning-path.mjs';
import {PRONOUNS,markAsked,markAnswered} from './dist/verb-practice.mjs';
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:1280,height:1000},serviceWorkers:'block',locale:'de-DE'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 // Die fünf Probesätze gelten hier als erledigt, damit „Neue Sätze lernen“ auch für Gäste da ist.
 await context.addInitScript(()=>sessionStorage.setItem('vanamo-guest-sentences',JSON.stringify(['a','b','c','d','e'])));
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const home=()=>page.locator('.app-view:not([hidden]) .back-link[data-view="home"]').click();
 // Angemeldete haben die Startseite in drei Reitern (Willkommen · Üben · Neue Sätze); Gäste sehen alles auf einer Seite.
 const tab=name=>page.locator('[data-home-tab-button="'+name+'"]').click();
 const select=activity=>page.locator('[data-home-activity="'+activity+'"]').evaluate(el=>el.click()); // Verbformen-Kachel ist ausgeblendet (eigene Karte), bleibt aber im DOM
 await page.goto(origin);
 await page.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 // Nach den fünf Probesätzen erscheint „Neue Sätze lernen“ für Gäste aufgeklappt; einklappbar bleibt es.
 await page.locator('.guest-finale').waitFor();
 assert.ok(await page.locator('#path-title').isVisible());
 assert.ok(await page.locator('#start-new-sentences').isVisible(),'guest path is open after the five sentences');
 assert.equal(await page.locator('#path-toggle').getAttribute('aria-expanded'),'true');
 await page.locator('#path-toggle').click();
 assert.ok(await page.locator('#start-new-sentences').isHidden(),'the chevron collapses it');
 await page.locator('#path-title').click();
 assert.ok(await page.locator('#start-new-sentences').isVisible(),'clicking the heading expands it again');
 await page.locator('#path-toggle').click();
 await page.evaluate(()=>{document.body.dataset.account='authenticated';});
 // Erstes Öffnen am Tag: „Willkommen“ mit den zwei Knöpfen; die anderen Bereiche liegen hinter ihren Reitern.
 assert.ok(await page.locator('#home-tabs').isVisible());
 assert.equal(await page.locator('[data-home-tab-button="welcome"]').getAttribute('aria-selected'),'true');
 assert.ok(await page.locator('#welcome-review').isVisible()&&await page.locator('#welcome-new').isVisible());
 assert.ok(await page.locator('.home-daily').isHidden()&&await page.locator('.home-new').isHidden()&&await page.locator('#more-exercises').isHidden());
 await tab('new');
 assert.ok(await page.locator('#start-new-sentences').isVisible(),'signed-in users always see the path');
 assert.ok(await page.locator('#path-overview .path-stop').first().isVisible(),'die Route steht offen da');
 assert.ok(await page.locator('#welcome-review').isHidden()&&await page.locator('.home-daily').isHidden());
 assert.ok(await page.locator('#path-toggle').isHidden());
 await page.evaluate(()=>{document.body.dataset.account='guest';});
 assert.equal(await page.locator('#account-dialog').count(),1);
 assert.equal(await page.locator('#progress-nav').count(),0);
 // Im Header gibt es kein „Üben“ mehr – dafür ist der Reiter auf der Startseite da.
 assert.equal(await page.locator('#header-practice').count(),0);
 assert.equal(await page.locator('#account-button').textContent(),'Anmelden / Registrieren');
 assert.ok(await page.locator('#storage-account-link').isVisible());
 await page.locator('#storage-account-link').click();assert.ok(await page.locator('#login-form').isVisible());await page.locator('#close-account').click();
 assert.equal(await page.evaluate(()=>window.suomiLearningState.applyCloud(window.suomiLearningState.snapshot())),true);
 assert.equal(await page.locator('#home-direction-control').isVisible(),false);
 assert.equal(await page.locator('#start-daily-session').isDisabled(),true);
 assert.equal(await page.locator('#quick-verb-review').isVisible(),false);
 await page.locator('#more-exercises > summary').click();
 assert.ok(await page.locator('#home-direction-control').isVisible());
 await page.locator('[data-home-direction="de-fi"]').click();
 assert.equal(await page.locator('#continue-practice').textContent(),'Deutsch → Finnisch üben');
 assert.equal(await page.locator('[data-home-direction="de-fi"]').getAttribute('aria-pressed'),'true');
 await page.locator('[data-home-direction="random"]').click();
 assert.equal(await page.locator('#continue-practice').textContent(),'Beide Lernrichtungen üben');
 await page.locator('[data-home-direction="fi-de"]').click();
 assert.equal(await page.locator('#home-review').isDisabled(),true);
 // Ohne Konto: nur Übersetzen, andere Übungen ausgegraut und führen zur Registrierung
 for(const other of ['listen','dictation','verbs','suchsel','endings','dialogs'])assert.equal(await page.locator(`[data-home-activity="${other}"]`).getAttribute('aria-disabled'),'true');
 assert.equal(await page.locator('[data-home-activity="translate"]').getAttribute('aria-disabled'),null);
 await page.locator('[data-home-activity="listen"]').click({force:true});
 assert.ok(await page.locator('#account-dialog').evaluate(d=>d.open),'locked exercise opens the account dialog');
 assert.equal(await page.locator('[data-home-activity="translate"]').getAttribute('aria-pressed'),'true');
 await page.locator('#close-account').click();
 await page.evaluate(()=>{document.body.dataset.account='authenticated';});
 assert.equal(await page.locator('[data-home-activity="verbs"]').getAttribute('aria-disabled'),null);
 await select('verbs');
 const now=Date.now()-60000;
 const dueKeys=['olla:0','olla:2','puhua:5'];
 let progress={};
 for(const key of dueKeys)progress=markAnswered(markAsked(progress,key,now),key,false,now+1);
 progress=markAnswered(markAsked(progress,'olla:1',now),'olla:1',true,now+1);
 const state={reviews:{},favorites:[],daily:{},reports:{},writingRatings:{},verbProgress:progress,prefs:{level:1,direction:'fi-de',activity:'verbs',audioOnly:false,speed:1,grammarTopic:'negation'}};
 const sentencePayload=JSON.parse(fs.readFileSync('dist/sentences.json','utf8'));
 const sentences=sentencePayload.sentences.filter(s=>s.level===1&&s.audios.length).slice(0,6);
 for(const [kind,count] of [['fi-de',1],['de-fi',2],['listen',3],['dictation',4]])for(const s of sentences.slice(0,count))state.reviews[s.id+':'+kind]={due:now,interval:0,repetitions:2,updatedAt:now};
 await page.evaluate(state=>window.suomiLearningState.applyCloud(state),state);
 await tab('practice');
 assert.ok(await page.locator('.home-daily').isVisible());
 assert.equal(await page.locator('#home-tab-count').textContent(),await page.locator('#daily-plan-title').textContent().then(t=>t.match(/\d+/)[0]),'Zähler am Reiter „Üben“');
 assert.equal(await page.locator('#start-daily-session').isDisabled(),false);
 assert.ok(Number(await page.locator('#daily-due').textContent())>0);
 // Tageswiederholung als Gast: Hinweis, dass ohne Konto nichts gespeichert wird
 await page.evaluate(()=>{document.body.dataset.account='guest';});
 // Gäste sehen die „Wiederholen“-Box nicht mehr; die Runde selbst wird hier weiter über den (verborgenen) Knopf geprüft.
 await page.waitForFunction(()=>document.querySelector('.home-daily').hidden);
 await page.locator('#start-daily-session').evaluate(button=>button.click());
 assert.ok(await page.locator('#guest-start-dialog').isVisible());
 assert.match(await page.locator('#guest-start-dialog').textContent(),/Ohne Konto wird dein Fortschritt nicht gespeichert/);
 assert.equal(await page.locator('[data-guest-account]').count(),2);
 await page.locator('[data-guest-account="register"]').click();assert.ok(await page.locator('#register-form').isVisible());await page.locator('#close-account').click();
 await page.locator('#start-daily-session').evaluate(button=>button.click());await page.locator('#guest-continue').click();
 assert.ok((await page.locator('#session-progress').textContent()).endsWith('/ 4'));
 await page.evaluate(()=>{document.body.dataset.account='authenticated';});
 await home();
 assert.equal(await page.locator('#start-daily-session').textContent(),'Wiederholung fortsetzen');
 await page.locator('#start-daily-session').click();
 assert.ok(await page.locator('#practice-view').isVisible());
 assert.equal(await page.locator('#practice-settings').isVisible(),false);
 await home();
 await select('verbs');
 assert.equal(await page.locator('#home-review').textContent(),'3 Verbformen wiederholen');
 assert.equal(await page.locator('#continue-practice').textContent(),'Üben');
 const colors=await page.evaluate(()=>['.today','#home-review','.home-exercises .selected','#continue-practice'].map(selector=>getComputedStyle(document.querySelector(selector)).backgroundColor));
 // Die gewählte Kachel ist getönt (dazu dunkler Rand mit orangem Schatten).
 assert.notEqual(colors[1],colors[2]);assert.notEqual(colors[1],colors[3]);
 // Reduzierter Stil: „Verbformen“ ist eine ruhige Karte wie „Neue Sätze lernen“, nur „heute geübt“ bleibt farbig.
 // Mit Reitern sind die Verbformen eine Kachel wie die anderen Übungen; die eigene Karte gibt es nur noch für Gäste.
 assert.ok(await page.locator('[data-home-activity="verbs"]').isVisible()&&await page.locator('.home-verbs').isHidden());
 assert.equal(await page.locator('#home-view').getByText('3 Verbformen zur Wiederholung').count(),0);
 if(process.env.HOME_SCREENSHOTS)await page.screenshot({path:process.env.HOME_SCREENSHOTS+'/home-desktop.png',fullPage:true});
 for(const width of [390,320]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  for(const button of await page.locator('.home-exercises button:not([hidden])').all())assert.ok(await button.isVisible());
  assert.equal(await page.locator('#home-direction-control').isVisible(),false);
  if(width===390&&process.env.HOME_SCREENSHOTS)await page.screenshot({path:process.env.HOME_SCREENSHOTS+'/home-mobile.png',fullPage:true});
 }
 await page.setViewportSize({width:1280,height:1000});
 await page.locator('#home-review').click();
 const asked=[];
 for(let i=0;i<3;i++){
  const question=page.locator('.verb-question'),pronoun=(await question.textContent()).split(' · ')[0],id=await question.evaluate(el=>{const copy=el.cloneNode(true);copy.querySelector('.verb-meaning-inline')?.remove();return copy.textContent.split(' · ')[1].trim();}),person=PRONOUNS.indexOf(pronoun);
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
 assert.deepEqual(errors,[]);
 // Fresh learner: no automatic reviews; all specialist controls start collapsed.
 const focused=await context.newPage();focused.on('pageerror',e=>errors.push(e.message));
 await focused.goto(origin);await focused.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 assert.equal(await focused.locator('#more-exercises').getAttribute('open'),null);
 assert.equal(await focused.locator('#start-daily-session').isDisabled(),true);
 for(const width of [1280,390,320]){
  await focused.setViewportSize({width,height:844});
  assert.ok(await focused.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.equal(await focused.locator('[data-home-activity="translate"]').isVisible(),false);
 }
 const focusedState={...state,reviews:{},verbProgress:{}};
 const reviewSentences=sentences.slice(0,3).sort((a,b)=>a.id-b.id);
 for(const s of reviewSentences)focusedState.reviews[s.id+':fi-de']={due:now,interval:0,repetitions:1,updatedAt:now};
 await focused.evaluate(state=>window.suomiLearningState.applyCloud(state),focusedState);
 assert.equal(await focused.locator('#daily-due').textContent(),'3');
 // Die große Zeile nennt die Größe der Runde, der Knopf startet sie; „Wiederholen“ steht vor dem Satz des Tages.
 assert.equal(await focused.locator('#daily-plan-title').textContent(),'3 Sätze zum Wiederholen');
 assert.equal(await focused.locator('#start-daily-session').textContent(),'Jetzt starten →');
 assert.ok(await focused.evaluate(()=>!!(document.querySelector('.home-daily').compareDocumentPosition(document.getElementById('daily-sentence'))&Node.DOCUMENT_POSITION_FOLLOWING)),'reviews come before the sentence of the day');
 await focused.locator('#start-daily-session').evaluate(button=>button.click());assert.ok(await focused.locator('#guest-start-dialog').isVisible());await focused.locator('#guest-continue').click();
 // Explicit retry keeps its difficulty and comes after two other sentences.
 const expected=[reviewSentences[0],reviewSentences[1],reviewSentences[2],reviewSentences[0]];
 const difficulties=['easy','easy','hard','easy'];
 // Die Richtung wechselt je Satz (review-plan.mjs: shownDirection) – gespeichert wird weiter unter fi-de.
 const shownText=s=>(1+s.id)%2===1?s.translations[0].text:s.text;
 for(let i=0;i<expected.length;i++){
  assert.equal(await focused.locator('.sentence').evaluate(el=>{const copy=el.cloneNode(true);copy.querySelectorAll('.sentence-source-icon').forEach(b=>b.remove());return copy.textContent;}),shownText(expected[i]));
  assert.equal(await focused.locator('#word-bank').isVisible(),difficulties[i]==='easy');
  if(i===0){
   await focused.locator('#practice-view [data-view="home"]').click();
   assert.equal(await focused.locator('#start-daily-session').textContent(),'Wiederholung fortsetzen');
   await focused.locator('#start-daily-session').evaluate(button=>button.click());
  }
  if(difficulties[i]==='easy')await focused.locator('[data-pick-word]').first().click();
  await focused.locator('#reveal').click();
  if(i===0){
   const before=await focused.evaluate(()=>window.suomiLearningState.snapshot().reviews);
   await focused.locator('#practice-view [data-view="home"]').click();
   await focused.keyboard.press('1');
   assert.deepEqual(await focused.evaluate(()=>window.suomiLearningState.snapshot().reviews),before);
   await focused.locator('#start-daily-session').evaluate(button=>button.click());
  }
  await focused.locator(i===0?'#grade-again':'[data-grade="hard"]').click();
 }
 await focused.locator('#finish-daily-session').click();
 assert.equal(await focused.locator('#daily-due').textContent(),'0');
 assert.equal(await focused.locator('#start-daily-session').isDisabled(),true);
 const afterReview=await focused.evaluate(()=>window.suomiLearningState.snapshot());
 assert.equal(Object.keys(afterReview.reviews).length,3);
 for(const s of reviewSentences)assert.ok(afterReview.reviews[s.id+':fi-de'].due>Date.now());
 // Each new sentence: 1 read (glosses + translation), 2 build, 3 flip one word, then grade.
 const settle=()=>focused.waitForFunction(()=>!document.getElementById('card').matches('.cycle-leaving,.cycle-entering'));
 const cycleNext=async()=>{await settle();if(await focused.locator('#cycle-next').isVisible()){await focused.locator('#cycle-next').click();await settle();}};
 const finishCycle=async gradeName=>{await focused.locator('#reveal').click();await focused.locator('#cycle-next').click();await settle();await focused.locator('#cycle-flip').click();await focused.locator(`[data-grade="${gradeName}"]`).click();await settle();};
 await focused.evaluate(()=>{const t=document.getElementById('path-toggle');if(t&&!t.hidden&&t.getAttribute('aria-expanded')==='false')t.click();});await focused.locator('#start-new-sentences').click();
 assert.ok((await focused.locator('#session-progress').textContent()).endsWith('/ 5'));
 assert.match(await focused.locator('#session-title').textContent(),/Begrüßung und Grundlagen/);
 assert.equal(await focused.locator('#practice-settings').isVisible(),false);
 assert.ok(await focused.locator('.cycle-words .guest-gloss').first().isVisible(),'step 1 shows word meanings');
 await cycleNext();
 await focused.locator('[data-pick-word]').first().click();
 await focused.locator('#practice-view [data-view="home"]').click();
 assert.equal(await focused.locator('#start-new-sentences').textContent(),'Etappe fortsetzen');
 await focused.evaluate(()=>{const t=document.getElementById('path-toggle');if(t&&!t.hidden&&t.getAttribute('aria-expanded')==='false')t.click();});await focused.locator('#start-new-sentences').click();
 assert.equal(await focused.locator('[data-return-word]').count(),1);
 await focused.locator('[data-return-word]').first().click();
 for(let i=0;i<5;i++){
  await cycleNext();
  assert.ok(await focused.locator('#word-bank').isVisible());
  await focused.locator('[data-pick-word]').first().click();
  await finishCycle('easy');
 }
 assert.equal(Object.keys((await focused.evaluate(()=>window.suomiLearningState.snapshot())).reviews).length,8);
 await focused.locator('#next-session').click();
 assert.ok((await focused.locator('#session-progress').textContent()).endsWith('/ 5'));
 assert.match(await focused.locator('#session-title').textContent(),/Begrüßung und Grundlagen · Teil 2/);
 for(let i=0;i<5;i++){
  await cycleNext();await focused.locator('[data-pick-word]').first().click();await finishCycle('easy');
 }
 assert.match(await focused.locator('#card h2').textContent(),/Begrüßung und Grundlagen geschafft/);
 await focused.locator('#next-session').click();
 assert.match(await focused.locator('#session-title').textContent(),/Zahlen und Zeit/);
 await focused.locator('#practice-view [data-view="home"]').click();
 await focused.locator('.path-details > summary').click();
 assert.equal(await focused.locator('.path-stop').count(),14);
 assert.equal(await focused.locator('.path-stop[aria-current="step"]').count(),1);
 for(const width of [800,390,320]){await focused.setViewportSize({width,height:844});assert.ok(await focused.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`kein seitliches Scrollen bei ${width}px`);}
 // Imported progress advances the same path without a new persistence schema.
 const finished=await focused.evaluate(()=>window.suomiLearningState.snapshot());
 const levelOneIds=[...new Set([...sentencePayload.sentences,...sentencePayload.archived_sentences].filter(s=>s.level===1&&s.translations?.length).map(s=>s.id))];
 for(const id of levelOneIds)finished.reviews[id+':fi-de']={due:Date.now()+86400000,repetitions:1,interval:1,updatedAt:Date.now()};
 await focused.evaluate(state=>window.suomiLearningState.applyCloud(state),finished);
 // Leaving a live lesson and returning recomputes the next position from reviews.
 await focused.locator('#more-exercises > summary').click();
 await focused.locator('#continue-practice').click();await focused.locator('#practice-view [data-view="home"]').click();
 assert.equal(await focused.locator('#start-new-sentences').isDisabled(),true);
 assert.equal(await focused.locator('#path-progress-text').textContent(),`Level 1 · ${levelOneIds.length} von ${levelOneIds.length} Sätzen kennengelernt`);
 assert.equal(await focused.locator('.path-stop.complete').count(),EVERYDAY_PATH.filter(t=>t.lessons.length).length+1);
 assert.ok(await focused.locator('#path-next-level').isVisible());
 // Guests can only try Level 1: higher levels are disabled and lead to registration.
 assert.ok(await focused.locator('#path-level-hint').isVisible());
 assert.equal(await focused.locator('#path-level option[value="2"]').isDisabled(),true);
 assert.equal(await focused.locator('#path-level option[value="1"]').isDisabled(),false);
 await focused.locator('#path-next-level').click();
 assert.equal(await focused.locator('#path-level').inputValue(),'1');
 assert.ok(await focused.locator('#account-dialog').isVisible());
 await focused.keyboard.press('Escape');
 // Signed in, all levels are open.
 await focused.evaluate(()=>{document.body.dataset.account='authenticated';});
 await focused.locator('#path-level-hint').waitFor({state:'hidden'});
 await focused.locator('[data-home-tab-button="new"]').click();
 assert.equal(await focused.locator('#path-level option[value="2"]').isDisabled(),false);
 await focused.locator('#path-next-level').click();
 assert.equal(await focused.locator('#path-level').inputValue(),'2');
 assert.match(await focused.locator('#path-progress-text').textContent(),/Level 2 · 0 von/);
 // Reviews cover every level: due Level-1 sentences stay on the home card while Level 2 is selected.
 const mixed=await focused.evaluate(()=>window.suomiLearningState.snapshot());
 for(const id of levelOneIds.slice(0,2))mixed.reviews[id+':fi-de']={due:Date.now()-1000,repetitions:1,interval:1,updatedAt:Date.now()+1000};
 await focused.evaluate(state=>window.suomiLearningState.applyCloud(state),mixed);
 assert.equal(await focused.locator('#path-level').inputValue(),'2');
 assert.equal(await focused.locator('#daily-due').textContent(),'2');
 assert.equal(await focused.locator('#start-daily-session').isDisabled(),false);
 await focused.locator('#path-level').selectOption('6');
 assert.equal(await focused.locator('.path-stop').count(),14);
 // Level 6 was topped up (level fill 2026-09-25); Level 1 still has empty topics (slang, emergency).
 await focused.locator('#path-level').selectOption('1');
 assert.ok(await focused.locator('.path-stop').getByText('Noch keine passenden Sätze in diesem Level',{exact:true}).count()>0);
 await focused.locator('#path-level').selectOption('6');
 await focused.evaluate(()=>{const t=document.getElementById('path-toggle');if(t&&!t.hidden&&t.getAttribute('aria-expanded')==='false')t.click();});await focused.locator('#start-new-sentences').click();
 assert.match(await focused.locator('.card-top .card-label').textContent(),/Level 6/);
 await focused.locator('#practice-view [data-view="home"]').click();
 await focused.locator('#path-level').selectOption('2');
 await focused.evaluate(()=>{const t=document.getElementById('path-toggle');if(t&&!t.hidden&&t.getAttribute('aria-expanded')==='false')t.click();});await focused.locator('#start-new-sentences').click();
 assert.match(await focused.locator('.card-top .card-label').textContent(),/Level 2/);
 await focused.locator('#practice-view [data-view="home"]').click();
 await focused.locator('#path-level').selectOption('1');
 assert.equal(await focused.locator('#start-new-sentences').isDisabled(),true);
 // Reiter der Startseite am Handy: Leiste fest am unteren Rand, Knöpfe auf „Willkommen“, Kacheln, gemerkter Reiter.
 const tabs=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'de-DE'});
 await tabs.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await tabs.addInitScript(()=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'t',refresh_token:'t',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'tabs-user',user_metadata:{username:'stefan'}}})));
 const phone=await tabs.newPage();phone.on('pageerror',e=>errors.push(e.message));
 await phone.goto(origin);await phone.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 assert.equal(await phone.locator('#home-view').getAttribute('data-home-tab'),'welcome','erstes Öffnen am Tag: Willkommen');
 assert.ok(await phone.locator('#home-view .intro h1').isVisible()&&await phone.locator('#welcome-review').isVisible());
 assert.ok(await phone.evaluate(()=>{const n=document.getElementById('home-tabs'),r=n.getBoundingClientRect();return getComputedStyle(n).position==='fixed'&&Math.abs(r.bottom-innerHeight)<1&&r.width===innerWidth;}),'Reiterleiste liegt am unteren Rand');
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'kein Querscrollen');
 assert.equal(await phone.locator('#welcome-new-note').textContent(),await phone.locator('#path-current-title').textContent(),'der Knopf nennt das aktuelle Thema');
 await phone.locator('#welcome-new').click();
 assert.ok(await phone.locator('#practice-view').isVisible(),'„Neue Sätze“ startet die Etappe direkt');
 assert.ok(await phone.locator('#home-tabs').isHidden(),'in der Übung gibt es keine Reiterleiste');
 await phone.locator('#practice-view [data-view="home"]').click();
 assert.equal(await phone.locator('#home-view').getAttribute('data-home-tab'),'welcome');
 await phone.locator('[data-home-tab-button="practice"]').click();
 assert.ok(await phone.locator('.home-daily').isVisible()&&await phone.locator('#home-view .intro').isHidden());
 assert.equal(await phone.locator('.home-exercises button:visible').count(),9,'neun Kacheln');
 assert.ok(await phone.locator('.home-tile-note').first().isVisible());
 assert.ok(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'kein Querscrollen mit Kacheln');
 await phone.locator('[data-home-activity="listen"]').click();
 assert.equal(await phone.locator('#continue-title').textContent(),'Hörübung');
 // Grammatik und Schreibtest sind Kacheln wie die anderen: erst die Karte darunter, los geht es mit dem Knopf.
 await phone.locator('[data-home-activity="writing"]').click();
 assert.ok(await phone.locator('[data-home-activity="writing"]').evaluate(el=>el.classList.contains('is-unavailable')),'Schreibtest ohne genug geübte Sätze: Kachel blass');
 assert.match(await phone.locator('#home-writing-note').textContent(),/dann ist der Schreibtest spielbar/);
 assert.equal(await phone.locator('#continue-title').textContent(),'Hörübung','die gewählte Übung bleibt');
 await phone.locator('[data-home-activity="grammar"]').click();
 assert.ok(await phone.locator('#home-view').isVisible(),'die Grammatik-Kachel bleibt auf der Startseite');
 assert.equal(await phone.locator('#continue-title').textContent(),'Grammatik');
 assert.ok(await phone.locator('#home-grammar-topic').isVisible()&&await phone.locator('#home-direction-control').isHidden());
 await phone.locator('#home-grammar-topic').selectOption('possession');
 assert.match(await phone.locator('#home-session-meta').textContent(),/Besitz/);
 await phone.locator('#continue-practice').click();
 assert.ok(await phone.locator('#practice-view').isVisible());
 assert.equal(await phone.locator('[data-activity="grammar"]').getAttribute('aria-pressed'),'true','„Grammatik üben“ startet die Grammatikübung');
 assert.equal(await phone.locator('#practice-settings').evaluate(d=>d.open),false,'ohne aufgeklappte Einstellungen');
 await phone.locator('#practice-view [data-view="home"]').click();
 await phone.locator('[data-home-tab-button="practice"]').press('ArrowRight');
 assert.equal(await phone.locator('#home-view').getAttribute('data-home-tab'),'new','Pfeiltasten wechseln den Reiter');
 await phone.reload();await phone.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 assert.equal(await phone.locator('#home-view').getAttribute('data-home-tab'),'new','der gewählte Reiter bleibt beim Neuladen');
 const second=await tabs.newPage();second.on('pageerror',e=>errors.push(e.message));
 await second.goto(origin);await second.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 assert.equal(await second.locator('#home-view').getAttribute('data-home-tab'),'practice','später am Tag geht direkt „Üben“ auf');
 await tabs.close();
 assert.deepEqual(errors,[]);
 await context.close();
 console.log('PASS: Reiter der Startseite, live cloud apply without reload, daily round, home selector, review counts across levels and launches, guest Level-1 lock, due-only verb round, preserved draft, identical colors, mobile layout, other exercises and guest privacy.');
}finally{await browser?.close();server.kill();}
