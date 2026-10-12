// Browser test: Hinweisband aus der Verwaltung, Rückmeldung an Vanamo, anonyme Seitenfehler-Meldungen und
// „Verwaltung“ im Kontomenü (nur für Admins). Alle Supabase-Aufrufe sind nachgebildet; nichts verlässt den Rechner.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {browserFamily,osFamily,shortSource,cleanMessage,worthReporting} from './dist/site-extras.mjs';

// Bausteine ohne Browser
assert.equal(browserFamily('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.70 Mobile Safari/537.36'),'Chrome 129');
assert.equal(browserFamily('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'),'Safari 18');
assert.equal(browserFamily('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'),'Firefox 131');
assert.equal(browserFamily('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/129.0 Safari/537.36 Edg/129.0'),'Edge 129');
assert.equal(osFamily('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)'),'iOS');assert.equal(osFamily('X11; Linux x86_64'),'Linux');
assert.equal(shortSource('https://vanamo.app/app.js?v=178',120,5,'https://vanamo.app'),'app.js:120:5');
assert.equal(shortSource('chrome-extension://abc/inject.js',1,1,'https://vanamo.app'),null,'extensions ignored');
assert.equal(cleanMessage('Fehler bei anna@example.org in https://vanamo.app/?invite=GEHEIM#x, id 1234567, token abcdefghijklmnopqrstuvwxyz123'),'Fehler bei [E-Mail] in https://vanamo.app/ id #, token …');
assert(!worthReporting('Script error.',''));assert(!worthReporting('TypeError: Failed to fetch',''));assert(worthReporting('TypeError: x is null','app.js:1:1'));

const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173';

async function open({viewport={width:1280,height:900},settings={notice:null,registration:true,goal_percent:0},reportHosts=null,signedIn=false,admin=false,path='/'}={}){
 const calls=[];
 const context=await browser.newContext({serviceWorkers:'block',locale:'de-DE',viewport});
 await context.addInitScript(({reportHosts,signedIn})=>{
  try{sessionStorage.setItem('vanamo-intro-seen','1');}catch{}
  if(reportHosts)window.VANAMO_REPORT_HOSTS=reportHosts;
  if(signedIn&&!localStorage.getItem('suomi-auth-session-v1'))localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'a',refresh_token:'r',user:{id:'00000000-0000-4000-8000-000000000001',user_metadata:{username:'steve'}}}));
 },{reportHosts,signedIn});
 await context.route('**/*',route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin===origin)return route.continue();
  if(!url.hostname.endsWith('.supabase.co'))return route.abort();
  const json=(b,s=200)=>route.fulfill({status:s,contentType:'application/json',body:JSON.stringify(b)});
  const body=JSON.parse(req.postData()||'{}');
  if(url.pathname.startsWith('/rest/v1/rpc/'))calls.push({fn:url.pathname.split('/').pop(),body,auth:req.headers().authorization||''});
  if(url.pathname==='/rest/v1/rpc/app_settings')return json(settings);
  if(url.pathname==='/rest/v1/rpc/send_feedback')return json({ok:true});
  if(url.pathname==='/rest/v1/rpc/report_client_error')return json({ok:true});
  if(url.pathname==='/rest/v1/rpc/admin_api')return json({admin});
  if(url.pathname==='/auth/v1/token')return json({access_token:'a',refresh_token:'r',user:{id:'00000000-0000-4000-8000-000000000001',user_metadata:{username:'steve'}}});
  if(url.pathname==='/auth/v1/user')return json({id:'00000000-0000-4000-8000-000000000001',user_metadata:{username:'steve'}});
  if(url.pathname.startsWith('/rest/v1/learning_state'))return route.fulfill({status:req.method()==='GET'?200:201,contentType:'application/json',body:req.method()==='GET'?'[]':''});
  if(url.pathname.startsWith('/rest/v1/rpc/'))return json({sentence_ids:[],translations:[]});
  return json({});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+path);await page.waitForTimeout(700);
 return {context,page,errors,calls};
}

try{
 // Kein Hinweis: kein Band. Mit Hinweis: Band oben, schließbar, bleibt in dieser Sitzung zu.
 {const {context,page}=await open();assert.equal(await page.locator('.site-notice').count(),0);await context.close();}
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const {context,page,errors}=await open({viewport,settings:{notice:{text:'Heute ab 22 Uhr kurze Wartung <b>x</b>',kind:'warn'},registration:true,goal_percent:0}});
  await page.waitForSelector('.site-notice.warn');
  assert.equal(await page.textContent('.site-notice span'),'Heute ab 22 Uhr kurze Wartung <b>x</b>','notice is text, not HTML');
  assert.equal(await page.evaluate(()=>document.body.firstElementChild.className),'site-notice warn','band at the very top');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  await page.click('.site-notice button');assert.equal(await page.locator('.site-notice').count(),0);
  await page.reload();await page.waitForTimeout(600);assert.equal(await page.locator('.site-notice').count(),0,'closed notice stays closed');
  assert.deepEqual(errors,[]);await context.close();
 }
 // Rückmeldung: anonym, mit Seitenpfad, ohne Konto.
 {const {context,page,calls,errors}=await open({viewport:{width:390,height:844}});
  await page.click('footer [data-feedback-open]');await page.waitForSelector('#feedback-dialog[open]');
  assert.match(await page.textContent('#feedback-dialog'),/Anonym/);
  await page.fill('#feedback-text','ok');await page.click('#feedback-form button[type=submit]');
  assert.match(await page.textContent('#feedback-status'),/ein paar Worte mehr/);
  await page.fill('#feedback-text','Bitte einen Schalter für die Vögel.');await page.click('#feedback-form button[type=submit]');
  await page.waitForFunction(()=>/Danke/.test(document.getElementById('feedback-status').textContent));
  const sent=calls.find(c=>c.fn==='send_feedback');
  assert.deepEqual(sent.body,{p_message:'Bitte einen Schalter für die Vögel.',p_page:'/'});
  assert.equal(sent.auth,'','feedback is sent without an account');
  assert.deepEqual(errors,[]);await context.close();}
 // Seitenfehler: nur auf freigegebenen Adressen, bereinigt, höchstens 5.
 {const {context,page,calls}=await open();
  await page.evaluate(()=>setTimeout(()=>{throw new Error('Boom');},0));await page.waitForTimeout(200);
  assert.equal(calls.filter(c=>c.fn==='report_client_error').length,0,'no reports from other hosts');await context.close();}
 {const {context,page,calls}=await open({reportHosts:['localhost']});
  await page.evaluate(()=>setTimeout(()=>{throw new Error('Boom für anna@example.org ?invite=GEHEIM');},0));
  await page.evaluate(()=>{for(let i=0;i<8;i++)setTimeout(()=>{throw new Error('Fehler '+i);},0);});
  await page.evaluate(()=>{Promise.reject(new TypeError('Kaputt'));});
  await page.waitForTimeout(400);
  const reports=calls.filter(c=>c.fn==='report_client_error').map(c=>c.body.p);
  assert.equal(reports.length,5,'at most five reports per page view');
  assert.equal(reports[0].message,'Error: Boom für [E-Mail]','message scrubbed: '+reports[0].message);
  assert.equal(reports[0].page,'/');assert.match(reports[0].browser,/^Chrome \d+$|^Anderer$/);assert.equal(reports[0].os,'Linux');
  assert(calls.filter(c=>c.fn==='report_client_error').every(c=>c.auth===''),'error reports carry no account');
  assert(!JSON.stringify(reports).includes('GEHEIM'),'no query strings');
  await context.close();}
 // Kontomenü: „Verwaltung“ nur für Admins.
 for(const admin of [false,true]){
  const {context,page,errors}=await open({signedIn:true,admin});
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#account-admin').count(),admin?1:0,admin?'admin sees the entry':'normal users do not');
  if(admin){
   assert.equal(await page.evaluate(()=>document.getElementById('logout').style.getPropertyValue('--i')),'4','logout moves one down');
   await page.click('#account-button');await page.waitForTimeout(400);
   await Promise.all([page.waitForURL('**/admin.html'),page.click('#account-admin')]);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
 // Unterstützen-Seite: Füllstand des Monatsziels kommt aus der Datenbank (nur Prozent).
 {const {context,page}=await open({path:'/unterstuetzen.html',settings:{notice:null,registration:true,goal_percent:74}});
  await page.waitForFunction(()=>document.getElementById('support-goal-bar').getAttribute('aria-valuenow')==='74');
  await context.close();}
 console.log('Hinweisband, Rückmeldung (anonym), Seitenfehler (bereinigt, höchstens 5, nur auf vanamo.app), „Verwaltung“ nur für Admins, Monatsziel aus der Datenbank.');
}finally{await browser.close();server.kill();}
