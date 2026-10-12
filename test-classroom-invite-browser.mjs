// Klassenraum per Einladungslink (…/?klasse=CODE): Fenster mit Raum und Lehrkraft, Beitritt oder Anfrage,
// Gäste zuerst zum Anmelden. Im Raum: Link teilen, Freigabe-Schalter, Anfragen aufnehmen/ablehnen.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',id='11111111-1111-4111-a111-111111111111',code='ABCDEF0123456789',roomId='22222222-2222-4222-a222-222222222222';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
const session={access_token:'t',refresh_token:'t',user:{id,user_metadata:{username:'stefan',nickname:'Stefan'}}};
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',locale:'de-DE',reducedMotion:'reduce'});
 const calls=[];let approval=true,pending=false,requests=[];const anna={id:'33333333-3333-4333-a333-333333333333',name:'Anna',avatar:'kurki',created_at:new Date().toISOString()};
 await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await context.route('**/auth/v1/**',route=>route.fulfill(json(session)));
 await context.route('**/rest/v1/**',async route=>{
  const url=route.request().url();
  if(!url.includes('/rpc/classroom_api'))return route.fulfill(json([]));
  const {action,payload}=JSON.parse(route.request().postData()||'{}');calls.push({action,payload});
  if(action==='invite_info')return route.fulfill(json(payload.code===code?{name:'Finnisch am Mittwoch',teacher:'Frau Virtanen',approval,member:false,pending,id:null}:{error:'Dieser Einladungslink ist ungültig oder der Raum ist geschlossen.'}));
  if(action==='join'){pending=approval;return route.fulfill(json(approval?{pending:true,name:'Finnisch am Mittwoch'}:{id:roomId}));}
  if(action==='list')return route.fulfill(json(pending?[{id:roomId,name:'Finnisch am Mittwoch',pending:true}]:[{id:roomId,name:'Finnisch am Mittwoch',owner:true,teacher:true,archived:false,requests:requests.length,open_tasks:0}]));
  if(action==='room')return route.fulfill(json({id:roomId,name:'Finnisch am Mittwoch',owner:true,teacher:true,archived:false,code,approval,requests,teacher_count:1,member_count:0,members:[{id,own:true,name:'Stefan',role:'teacher',owner:true,blocked:false}],assignments:[]}));
  if(action==='approve'||action==='decline'){requests=requests.filter(r=>r.id!==payload.user_id);return route.fulfill(json({}));}
  if(action==='set_approval'){approval=payload.approval;return route.fulfill(json({}));}
  if(action==='cancel_request'){pending=false;return route.fulfill(json({}));}
  if(action==='seen')return route.fulfill(json({}));
  return route.fulfill(json({}));
 });
 await context.route('**/storage/v1/**',route=>route.fulfill(json([])));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const dialog=page.locator('#cr-invite-dialog');

 // Gast: Link öffnen → Fenster mit Registrieren/Anmelden; der Code bleibt bis nach dem Anmelden liegen.
 await page.goto(origin+'/?klasse='+code.toLowerCase());
 await dialog.waitFor({state:'visible',timeout:20000});
 assert.equal(new URL(page.url()).search,'','Code verschwindet aus der Adresszeile');
 assert.match(await dialog.textContent(),/Melde dich an oder erstelle/);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vanamo-classroom-invite')),code);
 await dialog.getByRole('button',{name:'Anmelden'}).click();
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vanamo-classroom-invite')),code,'bleibt fürs Anmelden');
 await page.keyboard.press('Escape');

 // Angemeldet: Raum und Lehrkraft, Name vorausgefüllt, „Beitritt anfragen“ → Anfrage gesendet.
 await page.evaluate(s=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify(s)),session);
 await page.goto(origin+'/?klasse='+code);
 await dialog.getByText('Finnisch am Mittwoch').waitFor({timeout:20000});
 assert.match(await dialog.textContent(),/Lehrkraft: Frau Virtanen/);
 assert.equal(await dialog.locator('input[name=display_name]').inputValue(),'Stefan');
 await dialog.getByRole('button',{name:'Beitritt anfragen'}).click();
 await dialog.getByText('Anfrage gesendet').waitFor();
 assert.deepEqual(calls.find(c=>c.action==='join').payload,{code,display_name:'Stefan'});
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vanamo-classroom-invite')),null,'Einladung erledigt');
 await dialog.getByRole('button',{name:'Zu den Klassenräumen'}).click();
 await page.locator('.cr-room-pending').waitFor();
 assert.match(await page.locator('.cr-room-pending').textContent(),/Wartet auf Freigabe/);
 page.once('dialog',d=>d.accept());
 await page.locator('.cr-room-pending [data-cr=cancel_request]').click();
 await page.locator('.cr-room-pending').waitFor({state:'detached'});
 assert.equal(calls.at(-2).action,'cancel_request');

 // Ungültiger Link: Hinweis statt Formular.
 await page.goto(origin+'/?klasse=FFFFFFFFFFFFFFFF');
 await dialog.getByText('ungültig').waitFor({timeout:20000});
 await dialog.getByRole('button',{name:'OK'}).click();

 // Raum ohne Freigabe: direkt beitreten und den Raum öffnen.
 approval=false;
 await page.goto(origin+'/?klasse='+code);
 await dialog.getByRole('button',{name:'Klasse beitreten'}).click({timeout:20000});
 await page.locator('#classrooms-view:not([hidden])').waitFor();
 await page.locator('.cr-invite-card').waitFor();

 // Ersteller im Raum: Link und Schalter; mit Freigabe und Anfrage steht oben die Anfrage.
 const link=await page.locator('.cr-invite-card .cr-invite-link').inputValue();
 assert.equal(link,origin+'/?klasse='+code);
 await page.locator('summary',{hasText:'Unsere Klasse'}).click();
 await page.locator('summary',{hasText:'Einladung & Mitglieder verwalten'}).click();
 assert.equal(await page.locator('[data-cr-approval]').isChecked(),false);
 requests=[anna];
 await page.locator('[data-cr-approval]').check();
 await page.locator('.cr-requests').waitFor();
 assert.equal(await page.locator('.cr-invite-card').count(),0,'mit Anfrage keine Einladungsbox');
 assert.deepEqual(calls.filter(c=>c.action==='set_approval').at(-1).payload,{room_id:roomId,approval:true});
 assert.match(await page.locator('.cr-requests').textContent(),/1 Beitrittsanfrage.*Anna/s);
 await page.locator('.cr-requests [data-cr=approve]').click();
 await page.locator('.cr-requests').waitFor({state:'detached'});
 assert.equal(calls.filter(c=>c.action==='approve').at(-1).payload.user_id,'33333333-3333-4333-a333-333333333333');
 assert.deepEqual(errors,[]);
 console.log('PASS: Einladungslink – Gast zum Anmelden, Anfrage mit Namen, wartender Raum zurückziehbar, ungültiger Link, direkter Beitritt, Link und Freigabe-Schalter, Anfrage aufnehmen');
}finally{await browser?.close();server.kill();}
