// Klassenraum: Beitrag, Antwort und Raum melden – Grund ist Pflicht, Hinweis freiwillig, Knopf zeigt danach „Gemeldet“.
// Eigene Inhalte und der eigene Raum haben keinen „Melden“-Knopf.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',id='11111111-1111-4111-a111-111111111111',code='ABCDEF0123456789',roomId='22222222-2222-4222-a222-222222222222';
const postId='44444444-4444-4444-a444-444444444444',replyId='55555555-5555-4555-a555-555555555555',ownId='66666666-6666-4666-a666-666666666666';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
const session={access_token:'t',refresh_token:'t',user:{id,user_metadata:{username:'mia',nickname:'Mia'}}};
const now=new Date().toISOString();
const posts=[
 {id:postId,kind:'post',body:'Etwas Fragwürdiges',author:'Jonas',own:false,teacher:false,created_at:now,files:[],replies:[{id:replyId,body:'Eine Antwort',author:'Lea',own:false,teacher:false,created_at:now,reply_to_id:null}]},
 {id:ownId,kind:'post',body:'Mein eigener Beitrag',author:'Mia',own:true,teacher:false,created_at:now,files:[],replies:[]},
];
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE',reducedMotion:'reduce'});
  const calls=[];
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.route('**/auth/v1/**',route=>route.fulfill(json(session)));
  await context.route('**/rest/v1/**',async route=>{
   const url=route.request().url();
   if(!url.includes('/rpc/classroom_api'))return route.fulfill(json([]));
   const {action,payload}=JSON.parse(route.request().postData()||'{}');calls.push({action,payload});
   if(action==='invite_info')return route.fulfill(json({name:'Finnisch am Mittwoch',teacher:'Frau Virtanen',approval:false,member:false,pending:false,id:null}));
   if(action==='join')return route.fulfill(json({id:roomId}));
   if(action==='list')return route.fulfill(json([{id:roomId,name:'Finnisch am Mittwoch',owner:false,teacher:false,archived:false,open_tasks:0}]));
   if(action==='room')return route.fulfill(json({id:roomId,name:'Finnisch am Mittwoch',owner:false,teacher:false,archived:false,teacher_count:1,member_count:3,members:[{id,own:true,name:'Mia',role:'student',owner:false,blocked:false}],assignments:[]}));
   if(action==='stream_list')return route.fulfill(json({posts,has_more:false,open_questions:0}));
   if(action==='report'){if(payload.kind==='room')return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Du hast heute schon viele Meldungen geschickt. Bitte versuche es morgen wieder.'})});return route.fulfill(json({ok:true}));}
   return route.fulfill(json({}));
  });
  await context.route('**/storage/v1/**',route=>route.fulfill(json([])));
  await context.addInitScript(s=>{localStorage.setItem('suomi-auth-session-v1',s);sessionStorage.setItem('vanamo-intro-seen','1');},JSON.stringify(session));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>{errors.push('browser dialog: '+d.message());d.dismiss();});
  await page.goto(origin+'/?klasse='+code);
  await page.locator('#cr-invite-dialog').getByRole('button',{name:'Klasse beitreten'}).click({timeout:20000});
  await page.locator('#cr-post-'+postId).waitFor({timeout:20000});

  // Eigener Beitrag: kein „Melden“. Fremder Beitrag: „Melden“.
  assert.equal(await page.locator(`#cr-post-${ownId} [data-cr=report]`).count(),0,'own post has no report button');
  const report=page.locator(`#cr-post-${postId} > .cr-toolbar [data-cr=report]`);
  assert.equal(await report.count(),1);
  await report.click();
  const dialog=page.locator('#cr-report-dialog');await dialog.waitFor();
  assert.match(await dialog.textContent(),/Beitrag melden/);assert.match(await dialog.textContent(),/sieht niemand/);
  await dialog.locator('button[type=submit]').click();
  assert.match(await dialog.locator('#cr-report-status').textContent(),/Grund/,'reason required');
  await dialog.locator('input[value=illegal]').check();
  await dialog.locator('textarea').fill('Das ist nicht in Ordnung.');
  if(process.env.SHOTS&&viewport.width===390)await page.screenshot({path:process.env.SHOTS+'/report-dialog-390.png'});
  await dialog.locator('button[type=submit]').click();
  await dialog.getByText('Danke').waitFor();
  assert.deepEqual(calls.filter(c=>c.action==='report').at(-1).payload,{kind:'post',id:postId,reason:'illegal',note:'Das ist nicht in Ordnung.'});
  await dialog.locator('[data-report-close]').click();
  assert.equal(await report.textContent(),'Gemeldet');assert(await report.isDisabled());

  // Antwort melden.
  await page.locator(`#cr-post-${postId} details.cr-feed-replies > summary`).click();
  await page.locator(`#cr-stream-message-${replyId} [data-cr=report]`).click();
  await dialog.waitFor();await dialog.locator('input[value=harassment]').check();await dialog.locator('button[type=submit]').click();
  await dialog.getByText('Danke').waitFor();await dialog.locator('[data-report-close]').click();
  assert.deepEqual(calls.filter(c=>c.action==='report').at(-1).payload,{kind:'post',id:replyId,reason:'harassment',note:''});

  // Raum melden (Fehlermeldung des Servers wird angezeigt).
  await page.locator('summary',{hasText:'Unsere Klasse'}).click();
  await page.locator('.cr-report-room [data-cr=report]').click();
  await dialog.waitFor();assert.match(await dialog.textContent(),/Raum melden/);
  await dialog.locator('input[value=other]').check();await dialog.locator('button[type=submit]').click();
  await dialog.getByText('schon viele Meldungen').waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('PASS: Melden im Klassenraum – Beitrag, Antwort, Raum; Grund Pflicht; „Gemeldet“ danach; keine eigenen Inhalte; Desktop und Handy.');
}finally{await browser?.close();server.kill();}
