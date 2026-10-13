// Verwaltung im Browser: eigene Anmeldung mit Authenticator-Code (einrichten, abfragen, falscher Code), Sitzung nur im Tab, Abmelden, Zugang nur für Admins, Übersicht, Zu erledigen, PayPal-Abruf, Einstellungen, Schwarm,
// sechs Paletten, Handybreite. Alle Antworten der Datenbank sind hier nachgestellt.
import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(r=>server.stdout.once('data',r));
const b=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173',themes=['vanamo','mustikka','ruska','tunturi','kaamos','revontulet'];
const shots=process.env.ADMIN_SHOTS||'';
const now=new Date(),iso=ms=>new Date(Date.now()-ms).toISOString();
const month=k=>{const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-k,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
const week=k=>{const d=new Date();d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7)-7*k);return d.toISOString().slice(0,10);};
const overview={min_group:5,
 accounts:{total:214,new7:12,with_email:133,weekly:Array.from({length:12},(_,i)=>({week:week(11-i),n:[3,5,2,7,6,9,8,11,7,14,13,12][i]}))},
 activity:{today:31,d7:86,d30:120,practiced_today:1940,practiced_7:9000,practiced_prev7:8300,streak_avg:4.2,streak_users:40,cards_total:52000},
 classrooms:{rooms:9,members:74},swarm:{names:17,contributors:2},
 money:{months:[{month:month(2),gross:3,fees:.4,payments:1,recurring:0},{month:month(1),gross:12.5,fees:1.1,payments:3,recurring:1},{month:month(0),gross:7.4,fees:.78,payments:4,recurring:2}],
  last_payment_at:iso(2*86400000),last_ok:iso(3600000),last_error:null,goal:10},
 todo:{reports:1,errors:1,feedback:1}};
const errors=[{fingerprint:'a'.repeat(64),message:'NotAllowedError: play() failed <img src=x onerror=alert(1)>',source:'sentence-audio.mjs:142:9',page:'/',platforms:{'Chrome 129 · Android':5,'Safari 18 · iOS':2},hits:7,status:'new',last_seen:iso(7200000)},
 {fingerprint:'b'.repeat(64),message:'Alter Fehler',source:'x.js:1:1',page:'/',platforms:{},hits:1,status:'done',last_seen:iso(5*86400000)}];
const reports=[{id:'11111111-1111-1111-1111-111111111111',sentence_id:5,translation_id:7,category:'translation',note:'juoksee heißt läuft',snapshot:{sentence_text:'Koira juoksee rannalla.',translation_text:'Der Hund schwimmt am Strand.'},created_at:iso(3600000),updated_at:iso(3600000)}];
const feedback=[{id:'22222222-2222-2222-2222-222222222222',message:'Wäre toll, wenn man die Vögel ausschalten könnte.',page:'/',created_at:iso(86400000)}];
const settings={month_goal:10,notice_on:false,notice_text:'',notice_kind:'info',registration_open:true,collect_errors:true,updated_at:iso(86400000),
 swarm:[{id:'33333333-3333-3333-3333-333333333333',name:'Aino',contributor:true,until:null},{id:'44444444-4444-4444-4444-444444444444',name:'Liisa',contributor:false,until:iso(-90*86400000)}],
 money:{last_ok:iso(3600000),last_error:null,last_try:iso(3600000)}};
const jwt=aal=>'e30.'+Buffer.from(JSON.stringify({sub:'a1',aal})).toString('base64url')+'.sig';
const session={access_token:jwt('aal2'),refresh_token:'r',user:{id:'a1'}};
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  // Ohne Sitzung: Anmeldeformular der Verwaltung; die Anmeldung der App zählt nicht.
  {const c=await b.newContext({viewport,serviceWorkers:'block'});const calls=[];
   await c.addInitScript(s=>localStorage.setItem('suomi-auth-session-v1',s),JSON.stringify({access_token:jwt('aal2'),refresh_token:'r',user:{id:'u1'}}));
   await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();calls.push(u.pathname);return r.abort();});
   const p=await c.newPage();await p.goto(origin+'/admin.html');await p.waitForSelector('#admin-login-form');
   assert.equal(calls.length,0,'the app session is not used');assert(await p.locator('.admin-nav').isHidden(),'no navigation before login');
   assert.equal(await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('vanamo-admin')).length),0);await c.close();}
  // Anmeldung: Passwort → Authenticator einrichten (QR) → Code → Kein Zugang (kein Admin) bzw. Code-Abfrage beim nächsten Mal.
  for(const mode of ['enroll','code','notadmin']){
   const c=await b.newContext({viewport,serviceWorkers:'block'});const seen=[];let level='aal1';
   await c.route('**/*',async r=>{const u=new URL(r.request().url()),req=r.request();if(u.origin===origin)return r.continue();
    const ok=v=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});seen.push(req.method()+' '+u.pathname);
    if(u.pathname==='/auth/v1/token'){const body=JSON.parse(req.postData());
     if(u.searchParams.get('grant_type')==='password'){assert.equal(body.email,'u'+Buffer.from('verwalter.x').toString('hex')+'@users.suomi.invalid');
      if(body.password!=='richtig')return r.fulfill({status:400,contentType:'application/json',body:'{"error":"invalid_grant"}'});}
     return ok({access_token:jwt(level),refresh_token:'r',user:{id:'a1'}});}
    if(u.pathname==='/auth/v1/user')return ok({id:'a1',factors:mode==='enroll'?[{id:'old',factor_type:'totp',status:'unverified'}]:[{id:'f1',factor_type:'totp',status:'verified'}]});
    if(u.pathname==='/auth/v1/factors/old'&&req.method()==='DELETE')return ok({});
    if(u.pathname==='/auth/v1/factors')return ok({id:'f1',type:'totp',totp:{qr_code:'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>',secret:'ABCDEF234567',uri:''}});
    if(u.pathname==='/auth/v1/factors/f1/challenge')return ok({id:'ch1'});
    if(u.pathname==='/auth/v1/factors/f1/verify'){const body=JSON.parse(req.postData());if(body.code!=='123456')return r.fulfill({status:422,contentType:'application/json',body:'{"msg":"Invalid TOTP code entered"}'});level='aal2';return ok({access_token:jwt('aal2'),refresh_token:'r2',user:{id:'a1'}});}
    if(u.pathname==='/rest/v1/rpc/admin_api'){const body=JSON.parse(req.postData());if(body.action==='overview')return ok(overview);if(body.action!=='status')return ok([]);return ok(mode==='notadmin'?{admin:false,aal2:true,ok:false}:{admin:true,aal2:true,ok:true});}
    return ok([]);});
   const p=await c.newPage();p.setDefaultTimeout(8000);p.on('pageerror',e=>console.log('PAGEERR',e.message));await p.goto(origin+'/admin.html');await p.waitForSelector('#admin-login-form');console.log('step',mode);
   await p.fill('#admin-user','Verwalter.X');await p.fill('#admin-pass','falsch');await p.click('#admin-login-form button[type=submit]');
   await p.waitForFunction(()=>/stimmt nicht/.test(document.getElementById('admin-login-status').textContent));
   await p.fill('#admin-pass','richtig');await p.click('#admin-login-form button[type=submit]');
   await p.waitForSelector('#admin-code-form');
   if(mode==='enroll'){assert(await p.locator('.admin-qr').isVisible(),'QR code shown');assert.equal(await p.textContent('.admin-secret'),'ABCDEF234567');assert(seen.includes('DELETE /auth/v1/factors/old'),'half-finished factor removed');
    if(shots&&viewport.width===390)await p.screenshot({path:`${shots}/admin-enroll-390.png`,fullPage:true});}
   else assert.equal(await p.locator('.admin-qr').count(),0,'no QR code when already set up');
   await p.fill('#admin-code','654321');await p.click('#admin-code-form button[type=submit]');
   await p.waitForFunction(()=>/stimmt nicht/.test(document.getElementById('admin-login-status').textContent));
   await p.fill('#admin-code','123 456');await p.click('#admin-code-form button[type=submit]');
   if(mode==='notadmin')await p.waitForFunction(()=>/Kein Zugang/.test(document.getElementById('admin').textContent));
   else await p.waitForSelector('.admin-kpis');
   assert.equal(await p.evaluate(()=>!!sessionStorage.getItem('vanamo-admin-session-v1')),true,'session only in this tab');
   assert.equal(await p.evaluate(()=>localStorage.getItem('vanamo-admin-session-v1')),null,'nothing in localStorage');
   if(mode==='code'){await p.click('#admin-logout');await p.waitForSelector('#admin-login-form');assert.equal(await p.evaluate(()=>sessionStorage.getItem('vanamo-admin-session-v1')),null,'logout clears the session');}
   await c.close();
  }
  // Angemeldet mit zweitem Faktor.
  const c=await b.newContext({viewport,serviceWorkers:'block',locale:'de-DE',timezoneId:'Europe/Berlin'});
  await c.addInitScript(s=>sessionStorage.setItem('vanamo-admin-session-v1',s),JSON.stringify(session));
  const calls=[];let synced=0,saved=null,live=JSON.parse(JSON.stringify(settings));
  await c.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===origin)return r.continue();
   const body=JSON.parse(r.request().postData()||'{}'),ok=v=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
   assert.equal(r.request().headers().authorization,'Bearer '+session.access_token,'session token sent');
   if(u.pathname.endsWith('/rpc/admin_api')){calls.push(body.action);const a=body.action,pl=body.payload||{};
    if(a==='status')return ok({admin:true,aal2:true,ok:true});if(a==='overview')return ok(overview);if(a==='errors')return ok(errors);if(a==='feedback')return ok(feedback);
    if(a==='settings')return ok(live);
    if(a==='settings_save'){saved=pl;if(pl.notice_on&&!pl.notice_text)return r.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Bitte einen Text für den Hinweis eingeben – oder den Hinweis ausschalten.'})});Object.assign(live,pl,{month_goal:Number(String(pl.month_goal).replace(',','.'))});return ok({ok:true});}
    if(a==='contributor_add'){live.swarm.push({id:'55555555-5555-5555-5555-555555555555',name:pl.name,contributor:true});return ok({ok:true,name:pl.name});}
    if(a==='swarm_remove'){live.swarm=live.swarm.filter(n=>n.id!==pl.id);return ok({ok:true});}
    return ok({ok:true});}
   if(u.pathname.endsWith('/rpc/sentence_quality_review_api')){calls.push('review:'+body.action);return ok(body.action==='list_reports'?reports:{decision:body.payload.decision});}
   if(u.pathname.endsWith('/functions/v1/paypal-sync')){synced++;return ok({ok:true,months:2});}
   return r.abort();});
  const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/status of 400/.test(m.text()))errs.push(m.text());});
  p.on('dialog',d=>{errs.push('dialog: '+d.message());d.dismiss();});
  await p.goto(origin+'/admin.html');await p.waitForSelector('.admin-kpis');
  const text=(await p.textContent('#admin')).replace(/[\u00a0\u202f]/g,' ');
  for(const t of ['214','Konten','31','1.940','62 %','133 von 214','Klassenräume','74 Mitglieder','+8 % zur Vorwoche','7,40 €','nach Gebühren 6,62 €','74 % von 10,00 €','Zahlungen diesen Monat','Neue Konten pro Woche','4,2','Koira juoksee rannalla.','Seitenfehler · 7×','Chrome 129 · Android (5×)','Wäre toll','Datenschutz'])
   assert(text.includes(t),`overview shows ${t}`);
  assert(!text.includes('Alter Fehler'),'done errors are not in the todo list');
  assert.equal(await p.locator('#admin img').count(),0,'error text is not rendered as HTML');
  assert.equal(await p.locator('.admin-bars').first().locator('.admin-bar').count(),6,'six months');
  assert.equal(await p.locator('.admin-bars').nth(1).locator('.admin-bar').count(),12,'twelve weeks');
  const sw=await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert(sw,'no horizontal scroll');
  if(shots)await p.screenshot({path:`${shots}/admin-${viewport.width}.png`,fullPage:true});
  // Aktionen: Satz freigeben, Fehler erledigt, Rückmeldung archivieren, PayPal abfragen.
  await p.click('[data-report][data-decision="restore"]');await p.waitForFunction(()=>true);
  await p.waitForTimeout(100);assert(calls.includes('review:resolve_report'),'report resolved');
  await p.click('[data-error]');await p.waitForTimeout(100);assert(calls.includes('error_done'),'error done');
  await p.click('[data-feedback]');await p.waitForTimeout(100);assert(calls.includes('feedback_archive'),'feedback archived');
  await p.click('[data-action="paypal"]');await p.waitForTimeout(150);assert.equal(synced,1,'paypal sync called');
  // Ohne Wert unter 5 Lernenden: Strich statt Zahl.
  overview.activity={...overview.activity,practiced_today:null,streak_avg:null};
  await p.click('[data-action="reload"]');await p.waitForTimeout(150);
  assert((await p.textContent('#admin')).includes('ab 5 Lernenden'),'small groups hidden');
  overview.activity={...overview.activity,practiced_today:1940,streak_avg:4.2};
  // Einstellungen
  await p.click('a[data-view="settings"]');await p.waitForSelector('#admin-settings-form');
  assert.equal(await p.getAttribute('a[data-view="settings"]','aria-current'),'page');
  assert.equal(await p.inputValue('#set-goal'),'10');
  for(const t of ['Aino','Liisa','Verbindungen','verbunden'])assert((await p.textContent('#admin')).includes(t),`settings show ${t}`);
  if(shots)await p.screenshot({path:`${shots}/admin-settings-${viewport.width}.png`,fullPage:true});
  await p.click('#set-notice');await p.click('.admin-save button');await p.waitForTimeout(100);
  assert.match(await p.textContent('#admin-save-status'),/Bitte einen Text/,'server message shown');
  await p.fill('#set-goal','12,50');await p.fill('#set-notice-text','Heute Wartung');await p.click('[data-kind="warn"]');await p.click('#set-registration');
  await p.click('.admin-save button');await p.waitForTimeout(150);
  assert.deepEqual(saved,{month_goal:'12,50',notice_on:true,notice_text:'Heute Wartung',notice_kind:'warn',registration_open:false,collect_errors:true});
  assert.match(await p.textContent('#admin-save-status'),/Gespeichert/);
  await p.fill('#set-contrib','Mikko');await p.click('#admin-contrib-form button');await p.waitForSelector('text=Mikko');
  const remove=p.locator('[data-remove="44444444-4444-4444-4444-444444444444"]');
  await remove.click();assert.equal(await remove.textContent(),'Entfernen?','asks first');await remove.click();
  await p.waitForFunction(()=>!document.body.textContent.includes('Liisa'));
  for(const t of themes){
   await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),t);
   const ok=await p.evaluate(()=>{const s=getComputedStyle(document.querySelector('.admin-card'));return s.backgroundColor!==getComputedStyle(document.body).color;});assert(ok,`readable in ${t}`);
  }
  await p.click('a[data-view="overview"]');await p.waitForSelector('.admin-kpis');
  if(shots){await p.evaluate(()=>document.documentElement.setAttribute('data-theme','kaamos'));await p.screenshot({path:`${shots}/admin-kaamos-${viewport.width}.png`,fullPage:true});}
  assert.deepEqual(errs,[],'no errors: '+errs.join(' | '));
  await c.close();
 }
 console.log('Verwaltung im Browser: eigene Anmeldung mit Authenticator-Code (einrichten, abfragen, falscher Code), Sitzung nur im Tab, Abmelden, Zugang nur für Admins, Übersicht mit Zahlen, Unterstützungen und Zu erledigen, Aktionen, PayPal-Abruf, kleine Gruppen verborgen, Einstellungen speichern, Schwarm bearbeiten, sechs Paletten, Handybreite.');
}finally{await b.close();server.kill();}
