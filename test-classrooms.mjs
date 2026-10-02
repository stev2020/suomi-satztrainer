// Klassenräume im Browser (Handy und Desktop): Gast-Hinweis, Raum anlegen, Aufgabe
// erstellen, abgeben, Frage stellen, Vergleich freigeben, Stream, Mitglieder.
// Die API-Antworten sind simuliert; die echten Rechte prüft test-classroom-db.mjs.
// CLASSROOM_SCREENSHOTS=<Ordner> speichert von jedem Schritt ein Bild.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
const origin='http://localhost:4173',id='11111111-1111-4111-a111-111111111111';
const shots=process.env.CLASSROOM_SCREENSHOTS;
const json=body=>({status:200,contentType:'application/json',body:JSON.stringify(body)});
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  const tag=viewport.width<600?'handy':'desktop';
  let teacher=true,step=0,activity=null;
  const room={id,name:'Finnisch am Mittwoch',teacher:true,owner:true,teacher_count:1,archived:false,code:'ABCD1234ABCD1234',member_count:3,assignments:[],
   members:[{id:'owner',name:'Frau Virtanen',role:'teacher',owner:true,own:true,blocked:false},{id:'s1',name:'Anna Müller',role:'student',owner:false,blocked:false},{id:'s2',name:'Mika',role:'student',owner:false,blocked:false}]};
  const posts=[{id:'post-1',kind:'question',body:'Wann benutzt man den Partitiv? Siehe https://example.org/partitiv',author:'Anna Müller',own:false,teacher:false,resolved:false,created_at:'2026-10-01T09:00:00Z',files:[],
   replies:[{id:'reply-1',reply_to_id:null,body:'Zum Beispiel nach Zahlen: kaksi kahvia.',author:'Frau Virtanen',own:true,teacher:true,created_at:'2026-10-01T09:05:00Z'}]}];
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.route('**/auth/v1/**',route=>route.fulfill(json({access_token:'test',refresh_token:'test',user:{id,user_metadata:{username:'teacher'}}})));
  await context.route('**/rest/v1/learning_state**',route=>route.fulfill(json([])));
  await context.route('**/rest/v1/rpc/sentence_quality_exclusions',route=>route.fulfill(json({sentence_ids:[],translations:[]})));
  await context.route('**/rest/v1/rpc/sentence_quality_api',route=>route.fulfill(json([])));
  await context.route('**/rest/v1/rpc/classroom_api',async route=>{
   const {action,payload}=route.request().postDataJSON();let result={};
   const members=room.members.map(m=>({...m,own:teacher?m.id==='owner':m.id==='s1'}));
   if(action==='list')result=[{id:room.id,name:room.name,archived:room.archived,teacher,owner:teacher,activity,open_tasks:teacher?0:room.assignments.filter(a=>!a.released&&!a.submissions.length).length}];
   if(action==='create'||action==='join')result={id};
   if(action==='room')result={...room,teacher,owner:teacher,members,code:teacher?room.code:null,assignments:room.assignments.map(a=>({...a,submissions:a.submissions.map(x=>({...x,own:!teacher})),own_assignment:teacher,can_manage:teacher,items_locked:a.released||a.submissions.length>0||a.messages.length>0}))};
   if(action==='assign')room.assignments.push({id:'22222222-2222-4222-a222-222222222222',title:payload.title,items:payload.items,due_at:payload.due_at,direction:payload.direction,created_at:'2026-10-02T08:00:00Z',released:false,submissions:[],messages:[],submitted_count:0});
   if(action==='submit'){room.assignments[0].submissions.push({id:'submission',answers:payload.answers,author_id:'s1',author:'Anna Müller',reactions:{},feedback:[]});room.assignments[0].submitted_count=1;}
   if(action==='release')room.assignments[0].released=true;
   if(action==='feedback'){assert.ok(teacher);const sub=room.assignments[0].submissions.find(x=>x.id===payload.submission_id);sub.feedback=(sub.feedback||[]).filter(f=>f.item_index!==payload.item_index);if(payload.body.trim())sub.feedback.push({item_index:payload.item_index,body:payload.body.trim(),author:'Frau Virtanen'});}
   if(action==='update_assignment'){const a=room.assignments[0];a.title=payload.title;a.due_at=payload.due_at||null;if(payload.direction)a.direction=payload.direction;if(payload.items){assert.ok(!a.submissions.length&&!a.messages.length);a.items=payload.items;}}
   if(action==='delete_assignment'){assert.equal(payload.assignment_id,room.assignments[0].id);room.assignments=[];}
   if(action==='message')room.assignments[0].messages.push({id:'message-'+(room.assignments[0].messages.length+1),author:teacher?'Frau Virtanen':'Anna Müller',teacher,own:true,body:payload.body,item_index:Number(payload.item_index),parent_id:payload.parent_id||null,deleted:false});
   if(action==='stream_list')result={posts,has_more:false,open_questions:posts.filter(p=>p.kind==='question'&&!p.resolved).length,assignment_dates:Object.fromEntries(room.assignments.map(a=>[a.id,a.created_at]))};
   if(action==='stream_post'){posts.unshift({id:payload.request_id,kind:payload.kind,body:payload.body,author:teacher?'Frau Virtanen':'Anna Müller',own:true,teacher,resolved:false,created_at:'2026-10-02T09:00:00Z',files:[],replies:[]});result={id:payload.request_id};}
   await route.fulfill(json(result));
  });
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!/net::ERR_FAILED|Failed to load resource/.test(m.text()))errors.push(m.text());});
  page.on('dialog',d=>d.accept());
  const check=async name=>{
   await page.waitForFunction(()=>!document.querySelector('[aria-busy]'));
   const wide=await page.evaluate(()=>[...document.querySelectorAll('#classrooms-view *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1&&getComputedStyle(e).position!=='fixed'&&!e.closest('[hidden]')).slice(0,3).map(e=>e.tagName+'.'+e.className));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tag} ${name}: Seite ist breiter als der Bildschirm (${wide})`);
   assert.ok(!await page.locator('#classrooms-status.error').count(),`${tag} ${name}: ${await page.locator('#classrooms-status').textContent()}`);
   if(shots)await page.screenshot({path:`${shots}/${tag}-${String(++step).padStart(2,'0')}-${name}.png`,fullPage:true});
  };
  // Gast
  await page.goto(origin);await page.locator('#classrooms-button').click();
  await page.getByText('Zum Beitreten und Speichern brauchst du ein Konto.').waitFor();await check('gast');
  // Lehrkraft: Raum anlegen
  await page.evaluate(id=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'test',refresh_token:'test',user:{id,user_metadata:{username:'teacher'}}})),id);
  await page.reload();await page.locator('#classrooms-button').click();
  await page.locator('.cr-room-action summary').first().waitFor();await check('raumliste');
  await page.locator('.cr-room-action:has([data-cr-form=create]) summary').click();
  await page.locator('[data-cr-form=create] [name=name]').fill('Finnisch am Mittwoch');
  await page.locator('[data-cr-form=create] [name=display_name]').fill('Frau Virtanen');
  await page.locator('[data-cr-form=create] button').click();
  await page.locator('.cr-stream-layout').waitFor();
  assert.equal(await page.locator('#classrooms-title').textContent(),'Finnisch am Mittwoch');
  assert.ok(await page.locator('.cr-post-body a[rel~=noopener]').count(),'links in posts are safe links');await check('raum-lehrkraft');
  // Stream: Beitrag schreiben
  await page.locator('#cr-stream-compose summary').click();
  await page.locator('[data-cr-form=stream_post] textarea').fill('Morgen bitte das Buch mitbringen.');await check('beitrag-schreiben');
  await page.locator('[data-cr-form=stream_post] button[type=submit], [data-cr-form=stream_post] button.primary').first().click();
  await page.getByText('Morgen bitte das Buch mitbringen.').first().waitFor();
  // Mitglieder
  for(const details of await page.locator('.cr-sidebar-disclosure').all())await details.locator('summary').first().click();
  assert.ok((await page.locator('.cr-roster').textContent()).includes('Anna Müller'));
  assert.ok((await page.locator('.cr-today').textContent()).includes('1 Frage wartet auf eine Antwort.'));await check('mitglieder');
  // Aufgabe erstellen: eigener Satz und vorhandener Satz
  await page.locator('[data-cr=new_assignment]').first().click();
  await page.locator('[data-cr-form=assign] input[name=title]').fill('Unsere erste Runde');
  await page.locator('#cr-tab-custom [data-custom-field=de]').fill('Heute lernen wir zusammen.');
  await page.locator('#cr-tab-custom [data-custom-field=fi]').fill('Tänään opiskelemme yhdessä.');await check('aufgabe-eigener-satz');
  await page.locator('#cr-tab-custom [data-cr=confirm_custom]').click();
  await page.locator('[data-cr=tab_existing]').click();
  await page.locator('[data-sentence]').first().check();
  assert.equal(await page.locator('#cr-selection-count').textContent(),'2 Sätze ausgewählt');await check('aufgabe-vorhandene-saetze');
  await page.locator('[data-cr-form=assign] button.primary').click();
  await page.locator('.cr-feed-assignment').first().waitFor();await check('raum-mit-aufgabe');
  await page.locator('[data-cr=assignment]').first().click();
  await page.getByRole('heading',{name:'Unsere erste Runde'}).waitFor();
  assert.ok(await page.locator('[data-cr=release]').isVisible());await check('aufgabe-lehrkraft');
  // Aufgabe bearbeiten: Titel, eigener Satz; ein Satz lässt sich entfernen und wieder behalten
  await page.locator('[data-cr=edit_assignment]').click();
  await page.locator('[data-cr-form=update_assignment] [name=title]').fill('Unsere erste Runde, korrigiert');
  assert.equal(await page.locator('#cr-edit-items textarea').count(),2,'nur der eigene Satz ist als Text änderbar');
  await page.locator('#cr-edit-items [data-edit-field=fi]').fill('Tänään opiskelemme yhdessä!');
  await page.locator('#cr-edit-items [data-cr=edit_toggle]').first().click();
  assert.equal(await page.locator('.cr-edit-removed').count(),1);assert.equal(await page.locator('#cr-edit-items [data-cr=edit_toggle]').count(),1,'der letzte Satz lässt sich nicht entfernen');await check('aufgabe-bearbeiten');
  await page.locator('#cr-edit-items [data-cr=edit_toggle]').first().click();assert.equal(await page.locator('.cr-edit-removed').count(),0);
  await page.locator('[data-cr-form=update_assignment] button.primary').click();
  await page.getByRole('heading',{name:'Unsere erste Runde, korrigiert'}).waitFor();
  assert.equal(room.assignments[0].items.length,2);assert.equal(room.assignments[0].items[1].text,'Tänään opiskelemme yhdessä!');assert.equal(room.assignments[0].items[1].origin,'teacher_created');
  // Teilnehmerin: beantworten, abgeben, Frage stellen
  await page.locator('#classrooms-button').click();teacher=false;
  await page.locator('[data-cr=open]').click();await page.locator('.cr-stream-layout').waitFor();
  assert.equal(await page.locator('[data-cr=new_assignment]').count(),0);await check('raum-teilnehmerin');
  await page.locator('[data-cr=assignment]').first().click();
  assert.equal(await page.locator('[data-cr=edit_assignment],[data-cr=delete_assignment]').count(),0,'Teilnehmer können Aufgaben nicht ändern');
  const answers=page.locator('[data-answer]');assert.equal(await answers.count(),2);
  await answers.nth(0).fill('<img src=x onerror=alert(1)> Hei!');await answers.nth(1).fill('Tänään me opiskelemme yhdessä.');await check('aufgabe-beantworten');
  // Entwurf übersteht das Neuladen
  await page.reload();await page.locator('#classrooms-button').click();await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  assert.equal(await answers.nth(1).inputValue(),'Tänään me opiskelemme yhdessä.','Entwurf ist nach dem Neuladen noch da');
  assert.ok(await page.evaluate(id=>localStorage.getItem('vanamo-classroom-drafts:'+id),id));
  await page.locator('[data-cr-form=submit] button.primary').click();
  await page.getByText('Deine Antworten sind gespeichert.').waitFor();
  assert.equal(await page.evaluate(id=>localStorage.getItem('vanamo-classroom-drafts:'+id),id),null,'nach der Abgabe ist der Entwurf entfernt');
  assert.equal(await page.locator('#classrooms-content img').count(),0,'answers are shown as text');
  assert.ok(await page.locator('.cr-assignment-item .translation-diffs').count(),'Vergleich mit der Vorlage nach der Abgabe');
  await page.locator('[data-cr-form=message] textarea').first().fill('Warum steht hier diese Form?');
  await page.locator('[data-cr-form=message] button').first().click();await page.locator('.cr-message').waitFor();await check('abgegeben-mit-frage');
  // Lehrkraft: Abgaben ansehen und Vergleich freigeben
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  await page.locator('[data-cr=release]').waitFor();
  // Lehrkraft: Vergleich je Antwort sehen und einen Kommentar schreiben, ändern, löschen
  assert.ok(await page.locator('.cr-submission-card .translation-diffs').count(),'Lehrkraft sieht den Vergleich mit der Vorlage');
  const note=page.locator('.cr-submission-card .cr-feedback-edit').nth(1);
  await note.locator('summary').click();await note.locator('textarea').fill('Das „me“ kannst du weglassen. <b>Gut!</b>');await check('kommentar-schreiben');
  await note.locator('button.primary').click();
  await page.locator('.cr-feedback-edit[open] textarea').waitFor();
  assert.equal(room.assignments[0].submissions[0].feedback[0].item_index,1);assert.equal(await page.locator('.cr-feedback-edit[open]').count(),1);await check('abgaben-lehrkraft');
  // Teilnehmerin liest den Kommentar bei ihrem Satz
  await page.locator('#classrooms-button').click();teacher=false;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  await page.locator('.cr-teacher-note').waitFor();
  assert.ok((await page.locator('.cr-assignment-item').nth(1).locator('.cr-teacher-note').textContent()).includes('Das „me“ kannst du weglassen. <b>Gut!</b>'));
  assert.equal(await page.locator('.cr-teacher-note b').count(),0,'Kommentar wird als Text gezeigt');assert.equal(await page.locator('.cr-feedback-edit').count(),0);await check('kommentar-lesen');
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();await page.locator('[data-cr=release]').waitFor();
  await page.locator('[data-cr=edit_assignment]').click();await page.locator('.cr-edit-locked').waitFor();
  assert.equal(await page.locator('#cr-edit-items').count(),0,'nach einer Abgabe sind die Sätze fest');await check('bearbeiten-saetze-fest');
  await page.locator('[data-cr-form=update_assignment] [data-cr=assignment]').click();await page.locator('[data-cr=release]').waitFor();
  await page.locator('[data-cr=release]').click();await page.locator('[data-cr=react]').first().waitFor();await check('vergleich-freigegeben');
  await page.locator('[data-cr=back]').click();await page.locator('.cr-stream-layout').waitFor();await check('zurueck-im-raum');
  // Hinweis auf Neues: Zahl am Knopf, „Neu“ am Raum und am Beitrag, verschwindet nach dem Ansehen
  assert.equal(await page.locator('#classrooms-button').getAttribute('data-news'),null);
  const newer=body=>({id:'post-'+body.length,kind:'post',body,author:'Anna Müller',own:false,teacher:false,resolved:false,created_at:activity,files:[],replies:[]});
  activity='2026-10-03T10:00:00Z';posts.unshift(newer('Neues von Anna'));
  await page.locator('#classrooms-button').click();await page.locator('.cr-room-card .cr-new').waitFor();
  assert.equal(await page.locator('#classrooms-button').getAttribute('data-news'),'1');await check('neues-in-raumliste');
  await page.locator('[data-cr=open]').click();await page.locator('.cr-stream-layout').waitFor();
  assert.equal(await page.locator('.cr-feed-card .cr-new').count(),1);assert.ok((await page.locator('.cr-feed-card:has(.cr-new)').textContent()).includes('Neues von Anna'));
  assert.equal(await page.locator('#classrooms-button').getAttribute('data-news'),null,'gesehen: der Hinweis am Knopf ist weg');await check('neues-im-raum');
  await page.locator('#classrooms-refresh').click();await page.waitForFunction(()=>!document.querySelector('.cr-new'));
  // Neue Antwort unter einem alten Beitrag: „Neu“ an der Zeile „n Antworten“, nach dem Aufklappen nur an der neuen Antwort
  activity='2026-10-03T10:30:00Z';posts.find(p=>p.id==='post-1').replies.push({id:'reply-new',reply_to_id:null,body:'Danke, verstanden!',author:'Mika',own:false,teacher:false,created_at:activity});
  await page.locator('#classrooms-refresh').click();await page.locator('#cr-post-post-1 .cr-feed-replies summary .cr-new').waitFor();
  assert.ok(!await page.locator('#cr-post-post-1 .cr-feed-replies').evaluate(e=>e.open),'Antworten bleiben zugeklappt, damit die Seite kurz bleibt');
  await page.locator('#cr-post-post-1 .cr-feed-replies summary').click();await page.locator('#cr-stream-message-reply-new .cr-new').waitFor();
  assert.equal(await page.locator('#cr-post-post-1 .cr-feed-replies summary .cr-new').count(),1);
  assert.equal(await page.locator('#cr-stream-message-reply-1 .cr-new').count(),0,'alte Antworten bleiben unmarkiert');
  assert.equal(await page.locator('#cr-post-post-1 .cr-feed-meta .cr-new').count(),0,'der alte Beitrag selbst ist nicht neu');await check('neue-antwort');
  await page.locator('#classrooms-refresh').click();await page.waitForFunction(()=>!document.querySelector('.cr-new'));
  // Zurück im Tab nach einer Weile: der Raum lädt von selbst neu
  activity='2026-10-03T11:00:00Z';posts.unshift(newer('Noch etwas Neues'));
  await page.evaluate(()=>{const real=Date.now;Date.now=()=>real()+180000;document.dispatchEvent(new Event('visibilitychange'));});
  await page.getByText('Noch etwas Neues').waitFor();assert.equal(await page.locator('.cr-feed-card .cr-new').count(),1);
  await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));});
  // Aufgabe löschen
  await page.locator('[data-cr=assignment]').first().click();await page.locator('[data-cr=delete_assignment]').click();
  await page.getByText('Die Aufgabe wurde gelöscht.').waitFor();assert.equal(await page.locator('[data-cr=assignment]').count(),0);assert.equal(room.assignments.length,0);await check('aufgabe-geloescht');
  // Zweiter Aufgabentyp: Finnisch → Deutsch
  await page.locator('[data-cr=new_assignment]').first().click();
  await page.locator('[data-cr-form=assign] input[name=title]').fill('Vom Finnischen ins Deutsche');
  await page.locator('[data-cr-form=assign] [name=direction]').selectOption('fi-de');
  // Satzauswahl: der finnische Satz steht jetzt oben, der deutsche klein darunter; zurückgestellt ist es wieder umgekehrt
  await page.locator('[data-cr=tab_existing]').click();
  const firstPick=page.locator('#cr-sentence-picker .cr-pick>span').first();
  assert.equal(await firstPick.getAttribute('lang'),'fi');assert.equal(await firstPick.locator('small').getAttribute('lang'),'de');await check('auswahl-fi-de');
  await page.locator('[data-cr-form=assign] [name=direction]').selectOption('de-fi');assert.equal(await firstPick.locator('small').getAttribute('lang'),'fi');
  await page.locator('[data-cr-form=assign] [name=direction]').selectOption('fi-de');await page.locator('[data-cr=tab_custom]').click();
  assert.ok(await page.evaluate(()=>{const f=document.querySelector('#cr-tab-custom [data-custom-field=fi]').getBoundingClientRect(),d=document.querySelector('#cr-tab-custom [data-custom-field=de]').getBoundingClientRect();return f.top<d.top;}),'eigener Satz: finnisches Feld zuerst');
  await page.locator('#cr-tab-custom [data-custom-field=de]').fill('Ich habe eine Frage.');
  await page.locator('#cr-tab-custom [data-custom-field=fi]').fill('Minulla on kysymys.');await check('aufgabe-fi-de-erstellen');
  await page.locator('#cr-tab-custom [data-cr=confirm_custom]').click();
  await page.locator('[data-cr-form=assign] button.primary').click();
  await page.locator('.cr-feed-assignment').first().waitFor();assert.equal(room.assignments[0].direction,'fi-de');
  assert.ok((await page.locator('.cr-feed-assignment').first().textContent()).includes('Finnisch → Deutsch'));
  await page.locator('#classrooms-button').click();teacher=false;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  assert.equal((await page.locator('.cr-assignment-item h3').first().textContent()).trim(),'Minulla on kysymys.');
  assert.ok(!(await page.locator('.cr-assignment-item').first().textContent()).includes('Ich habe eine Frage.'),'die deutsche Lösung ist vor der Abgabe nicht zu sehen');
  assert.equal(await page.locator('[data-answer]').getAttribute('lang'),'de');
  await page.locator('[data-answer]').fill('Ich habe ein Frage.');await check('aufgabe-fi-de-beantworten');
  await page.locator('[data-cr-form=submit] button.primary').click();await page.getByText('Deine Antworten sind gespeichert.').waitFor();
  assert.ok((await page.locator('.cr-assignment-item').first().textContent()).includes('Richtige Lösung: Ich habe eine Frage.'));
  assert.ok(await page.locator('.cr-assignment-item .translation-diffs').count(),'Vergleich mit der deutschen Vorlage');await check('aufgabe-fi-de-abgegeben');
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  await page.locator('[data-cr=edit_assignment]').click();await page.locator('.cr-edit-locked').waitFor();
  assert.ok((await page.locator('[data-cr-form=update_assignment]').textContent()).includes('Richtung: Finnisch → Deutsch'));assert.equal(await page.locator('[data-cr-form=update_assignment] [name=direction]').count(),0);
  assert.deepEqual(errors,[],`${tag}: Fehler in der Konsole`);
  await context.close();
 }
 console.log('PASS: Klassenräume auf Handy und Desktop – Gast, Raum, Stream, Mitglieder, Aufgabe, Bearbeiten, Entwurf, Abgabe, Vergleich, Kommentar, Frage, Freigabe, Neues, Löschen, Finnisch → Deutsch, keine Überbreite, keine Konsolenfehler');
}finally{await browser?.close();server.kill();}
