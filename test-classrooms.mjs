// Klassenräume im Browser (Handy und Desktop): Gast-Hinweis, Raum anlegen, Aufgabe
// erstellen, abgeben, Frage stellen, Vergleich freigeben, Stream, Mitglieder.
// Die API-Antworten sind simuliert; die echten Rechte prüft test-classroom-db.mjs.
// CLASSROOM_SCREENSHOTS=<Ordner> speichert von jedem Schritt ein Bild, CLASSROOM_THEME=<Palette> wählt die Farbpalette.
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
  let teacher=true,step=0,activity=null,seenAt=null;
  const room={id,name:'Finnisch am Mittwoch',teacher:true,owner:true,teacher_count:1,archived:false,code:'ABCD1234ABCD1234',member_count:3,assignments:[],
   members:[{id:'owner',name:'Frau Virtanen',avatar:'tunturipollo',role:'teacher',owner:true,own:true,blocked:false},{id:'s1',name:'Anna Müller',avatar:'sinitiainen',role:'student',owner:false,blocked:false},{id:'s2',name:'Mika',role:'student',owner:false,blocked:false}]};
  const posts=[{id:'post-1',kind:'question',body:'Wann benutzt man den Partitiv? Siehe https://example.org/partitiv',author:'Anna Müller',avatar:'sinitiainen',own:false,teacher:false,resolved:false,created_at:'2026-10-01T09:00:00Z',files:[],
   replies:[{id:'reply-1',reply_to_id:null,body:'Zum Beispiel nach Zahlen: kaksi kahvia.',author:'Frau Virtanen',avatar:'tunturipollo',own:true,teacher:true,created_at:'2026-10-01T09:05:00Z'}]}];
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE'});
  // CLASSROOM_THEME=<Palette> prüft die Seiten in einer anderen Farbpalette (z. B. kaamos).
  if(process.env.CLASSROOM_THEME)await context.addInitScript(theme=>localStorage.setItem('vanamo-theme',theme),process.env.CLASSROOM_THEME);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.route('**/auth/v1/**',route=>route.fulfill(json({access_token:'test',refresh_token:'test',user:{id,user_metadata:{username:'teacher'}}})));
  await context.route('**/rest/v1/learning_state**',route=>route.fulfill(json([])));
  await context.route('**/rest/v1/rpc/sentence_quality_exclusions',route=>route.fulfill(json({sentence_ids:[],translations:[]})));
  await context.route('**/rest/v1/rpc/sentence_quality_api',route=>route.fulfill(json([])));
  await context.route('**/rest/v1/rpc/classroom_api',async route=>{
   const {action,payload}=route.request().postDataJSON();let result={};
   const members=room.members.map(m=>({...m,own:teacher?m.id==='owner':m.id==='s1'}));
   if(action==='list')result=[{id:room.id,name:room.name,archived:room.archived,teacher,owner:teacher,activity,seen:seenAt,open_tasks:teacher?0:room.assignments.filter(a=>!a.released&&!a.submissions.length).length}];
   if(action==='create'||action==='join')result={id};
   if(action==='room')result={...room,teacher,owner:teacher,members,code:teacher?room.code:null,assignments:room.assignments.map(a=>({...a,submissions:a.submissions.map(x=>({...x,own:!teacher})),own_assignment:teacher,can_manage:teacher,items_locked:a.released||a.submissions.length>0||a.messages.length>0}))};
   if(action==='assign')room.assignments.push({id:'22222222-2222-4222-a222-222222222222',title:payload.title,items:payload.items,due_at:payload.due_at,direction:payload.direction,created_at:'2026-10-02T08:00:00Z',released:false,submissions:[],messages:[],submitted_count:0});
   if(action==='submit'){room.assignments[0].submissions.push({id:'submission',answers:payload.answers,author_id:'s1',author:'Anna Müller',reactions:{},feedback:[]});room.assignments[0].submitted_count=1;}
   if(action==='release')room.assignments[0].released=true;
   if(action==='seen'&&(!seenAt||Date.parse(payload.at)>Date.parse(seenAt)))seenAt=payload.at;
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
  // Vögel neben den Namen: der eigene bewegt sich, ohne gewählten Vogel steht der Anfangsbuchstabe da (nicht als Text).
  assert.equal(await page.locator('.cr-roster .avatar[data-avatar="tunturipollo"].is-live').count(),1);
  assert.equal(await page.locator('.cr-roster .avatar[data-avatar="sinitiainen"]:not(.is-live)').count(),1);
  assert.equal(await page.locator('.cr-roster .avatar-initial[data-initial="M"]').count(),1);
  assert.ok(!(await page.locator('.cr-roster').textContent()).includes('MMika'));
  assert.ok(await page.locator('.cr-feed-card .cr-author .avatar[data-avatar="sinitiainen"]').count()>=1);
  assert.ok((await page.locator('.cr-today').textContent()).includes('1 Frage wartet auf eine Antwort.'));await check('mitglieder');
  // Aufgabe erstellen: eigener Satz und vorhandener Satz
  await page.locator('[data-cr=new_assignment]').first().click();
  await page.locator('[data-cr-form=assign] input[name=title]').fill('Unsere erste Runde');
  await page.locator('#cr-tab-custom [data-custom-field=de]').fill('Heute lernen wir zusammen.');
  await page.locator('#cr-tab-custom [data-custom-field=fi]').fill('Tänään opiskelemme yhdessä.');await check('aufgabe-eigener-satz');
  await page.locator('#cr-tab-custom [data-cr=confirm_custom]').click();
  // Kein Knopf „Weiteren Satz eingeben“ mehr: nach dem Hinzufügen steht von selbst ein leeres Feld da – auch wenn man es entfernt
  assert.equal(await page.locator('[data-cr=add_custom]').count(),0);
  assert.equal(await page.locator('#cr-tab-custom [data-custom-field=de]').count(),1);
  await page.locator('#cr-tab-custom .cr-custom-item:not(.cr-custom-added) [data-cr=remove_custom]').click();
  assert.equal(await page.locator('#cr-tab-custom [data-custom-field=de]').count(),1,'ein leeres Feld bleibt stehen');
  assert.equal(await page.locator('#cr-tab-custom .cr-custom-added').count(),1);
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
  // Vorhandenen Satz ins eigene Wiederholen übernehmen; der eigene Satz der Lehrkraft bleibt im Klassenraum
  assert.ok((await page.locator('.cr-review-offer').textContent()).includes('1 eigener Satz der Lehrkraft bleibt im Klassenraum.'));
  const stockId=room.assignments[0].items[0].id;
  await page.locator('[data-cr=add_reviews]').click();await page.getByText('1 Satz ist jetzt im Wiederholen fällig.').waitFor();
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem('suomi-learning-v1')).reviews[key],`${stockId}:de-fi`);
  assert.ok(saved&&saved.due<=Date.now()&&saved.repetitions===1,'Satz ist im Lernstand fällig');
  assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('suomi-learning-v1')).reviews).length),1,'nur der vorhandene Satz wurde übernommen');
  await page.locator('[data-cr=add_reviews]').click();await page.getByText('1 Satz war dort schon fällig.').waitFor();await check('ins-wiederholen');
  await page.locator('[data-cr-form=message] textarea').first().fill('Warum steht hier diese Form?');
  await page.locator('[data-cr-form=message] button').first().click();await page.locator('.cr-message').waitFor();await check('abgegeben-mit-frage');
  // Lehrkraft: Abgaben ansehen und Vergleich freigeben
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  // Zweite Abgabe, damit es einen Überblick gibt: beide haben „me“ zusätzlich, eine Antwort zu Satz 1 stimmt
  room.assignments[0].submissions.push({id:'submission-2',answers:['Sinä olet ihminen.','Tänään me opiskelemme yhdessä!'],author_id:'s2',author:'Mika',reactions:{},feedback:[]});room.assignments[0].submitted_count=2;
  await page.locator('#classrooms-refresh').click();await page.locator('.cr-stream-layout').waitFor();await page.locator('[data-cr=assignment]').first().click();await page.locator('.cr-overview').waitFor();
  const rows=page.locator('.cr-overview-row');assert.equal(await rows.count(),2);
  assert.match((await rows.nth(0).locator('.cr-overview-tally').textContent()).replace(/\s+/g,' '),/1 wie die Vorlage.*1 anders formuliert/);
  assert.match((await rows.nth(1).locator('.cr-overview-tally').textContent()).replace(/\s+/g,' '),/2 fast wie die Vorlage/);
  assert.match((await rows.nth(1).locator('.cr-overview-spots li').first().textContent()).replace(/\s+/g,' '),/me.*bei 2 zusätzlich/);await check('ueberblick-lehrkraft');
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
  assert.equal(await page.locator('#classrooms-button').getAttribute('data-news'),null,'gesehen: der Hinweis am Knopf ist weg');
  await page.waitForFunction(()=>true);assert.equal(seenAt,'2026-10-03T10:00:00Z','der Stand ist im Konto angekommen');await check('neues-im-raum');
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
  // Anderes Gerät: ohne Kopie auf dem Gerät gilt der Stand aus dem Konto, also nichts Neues
  await page.evaluate(id=>localStorage.removeItem('vanamo-classroom-seen:'+id),id);
  await page.locator('#classrooms-button').click();await page.locator('.cr-room-card').waitFor();
  assert.equal(await page.locator('.cr-room-card .cr-new').count(),0);assert.equal(await page.locator('#classrooms-button').getAttribute('data-news'),null);
  // … und was ein anderes Gerät noch nicht ins Konto gemeldet hat, ist hier neu
  seenAt='2026-10-03T09:00:00Z';await page.evaluate(id=>localStorage.removeItem('vanamo-classroom-seen:'+id),id);
  await page.locator('#classrooms-button').click();await page.locator('.cr-room-card .cr-new').waitFor();
  await page.locator('[data-cr=open]').click();await page.locator('.cr-stream-layout').waitFor();
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
  await page.locator('[data-cr=direction][data-value=fi-de]').click();
  // Satzauswahl: der finnische Satz steht jetzt oben, der deutsche klein darunter; zurückgestellt ist es wieder umgekehrt
  await page.locator('[data-cr=tab_existing]').click();
  const firstPick=page.locator('#cr-sentence-picker .cr-pick>span').first();
  assert.equal(await firstPick.getAttribute('lang'),'fi');assert.equal(await firstPick.locator('small').getAttribute('lang'),'de');await check('auswahl-fi-de');
  await page.locator('[data-cr=direction][data-value=de-fi]').click();assert.equal(await firstPick.locator('small').getAttribute('lang'),'fi');
  await page.locator('[data-cr=direction][data-value=fi-de]').click();await page.locator('[data-cr=tab_custom]').click();
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
  assert.ok((await page.locator('[data-cr-form=update_assignment]').textContent()).includes('Aufgabentyp: Finnisch → Deutsch'));assert.equal(await page.locator('[data-cr-form=update_assignment] [name=direction]').count(),0);
  // Dritter Aufgabentyp: Lückentext mit gewählter Lücke
  const fresh=async()=>{await page.locator('[data-cr-form=update_assignment] [data-cr=assignment], [data-cr=assignment]').first().click();await page.locator('[data-cr=delete_assignment]').click();await page.getByText('Die Aufgabe wurde gelöscht.').waitFor();await page.locator('[data-cr=new_assignment]').first().click();await page.locator('[data-cr-form=assign]').waitFor();};
  await fresh();
  await page.locator('[data-cr-form=assign] input[name=title]').fill('Welches Wort fehlt?');
  await page.locator('[data-cr=type][data-type=cloze]').click();
  assert.equal(await page.locator('[data-cr=type][data-type=cloze]').getAttribute('aria-selected'),'true');assert.ok(await page.locator('#cr-direction-switch').isHidden()&&await page.locator('#cr-source-switch').isVisible());
  // Zurück zu Übersetzen merkt sich die zuletzt gewählte Richtung
  await page.locator('[data-cr=type][data-type=translate]').click();assert.equal(await page.locator('[data-cr-form=assign] [name=direction]').inputValue(),'de-fi');assert.ok(await page.locator('#cr-direction-switch').isVisible());
  await page.locator('[data-cr=type][data-type=cloze]').click();
  await page.locator('#cr-tab-custom [data-custom-field=de]').fill('Ich habe eine Frage.');
  await page.locator('#cr-tab-custom [data-custom-field=fi]').fill('Minulla on kysymys.');
  await page.locator('#cr-tab-custom [data-cr=confirm_custom]').click();
  assert.equal(await page.locator('.cr-gap-word').count(),3);assert.equal((await page.locator('.cr-gap-word[aria-pressed=true]').textContent()).trim(),'Minulla','Vorschlag: das längste Wort');
  await page.locator('.cr-gap-word').nth(2).click();assert.equal((await page.locator('.cr-gap-word[aria-pressed=true]').textContent()).trim(),'kysymys.');await check('lueckentext-erstellen');
  await page.locator('[data-cr-form=assign] button.primary').click();await page.locator('.cr-feed-assignment').first().waitFor();
  assert.equal(room.assignments[0].direction,'cloze');assert.equal(room.assignments[0].items[0].gap,2);
  await page.locator('#classrooms-button').click();teacher=false;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  const gapText=await page.locator('.cr-assignment-item h3').first().textContent();
  assert.ok(gapText.includes('Minulla on')&&gapText.includes('_____')&&!gapText.includes('kysymys'),'das Lückenwort ist vor der Abgabe nicht zu sehen');
  await page.locator('input[data-answer]').fill(' Kysymys ');await check('lueckentext-beantworten');
  await page.locator('[data-cr-form=submit] button.primary').click();await page.getByText('1 von 1 richtig.').waitFor();
  assert.ok(await page.locator('.cr-verdict-right').count());await check('lueckentext-abgegeben');
  // Vierter Aufgabentyp: Verbformen
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('.cr-stream-layout').waitFor();await fresh();
  await page.locator('[data-cr-form=assign] input[name=title]').fill('Präsens üben');
  await page.locator('[data-cr=type][data-type=verbs]').click();
  assert.ok(await page.locator('#cr-tab-custom').isHidden()&&await page.locator('#cr-source-switch').isHidden()&&await page.locator('#cr-direction-switch').isHidden(),'bei Verbformen gibt es keine Satzauswahl und keine Richtung');
  await page.locator('#cr-verb-filter').fill('teh');assert.ok(await page.locator('[data-verb=olla]').isHidden());await page.locator('[data-verb=tehdä]').check();
  await page.locator('#cr-verb-filter').fill('');await page.locator('[data-verb=olla]').check();
  assert.equal(await page.locator('#cr-selection-count').textContent(),'12 Formen ausgewählt');
  for(const person of [1,3,4,5])await page.locator(`[data-person="${person}"]`).uncheck();
  assert.equal(await page.locator('#cr-selection-count').textContent(),'4 Formen ausgewählt');await check('verbformen-erstellen');
  await page.locator('[data-cr-form=assign] button.primary').click();await page.locator('.cr-feed-assignment').first().waitFor();
  assert.deepEqual(room.assignments[0].items.map(item=>item.text),['olen','on','teen','tekee']);assert.equal(room.assignments[0].direction,'verbs');
  assert.ok((await page.locator('.cr-feed-assignment').first().textContent()).includes('4 Formen · Verbformen'));
  await page.locator('#classrooms-button').click();teacher=false;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  assert.equal((await page.locator('.cr-assignment-item h3').first().textContent()).replace(/\s+/g,' ').trim(),'olla · minä');
  const forms=page.locator('input[data-answer]');assert.equal(await forms.count(),4);
  for(const [n,value] of ['olen','hän on','teen','tekevät'].entries())await forms.nth(n).fill(value);await check('verbformen-beantworten');
  await page.locator('[data-cr-form=submit] button.primary').click();await page.getByText('3 von 4 richtig.').waitFor();
  assert.equal(await page.locator('.cr-verdict-right').count(),3);assert.ok((await page.locator('.cr-verdict-wrong').textContent()).includes('tekee'));
  assert.equal(await page.locator('.cr-review-offer').count(),0);await check('verbformen-abgegeben');
  await page.locator('#classrooms-button').click();teacher=true;
  await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').first().click();
  assert.ok((await page.locator('.cr-submission-card .cr-score').textContent()).includes('3 von 4 richtig'));await check('verbformen-lehrkraft');
  assert.deepEqual(errors,[],`${tag}: Fehler in der Konsole`);
  await context.close();
 }
 console.log('PASS: Klassenräume auf Handy und Desktop – Gast, Raum, Stream, Mitglieder, Aufgabe, Bearbeiten, Entwurf, Abgabe, Vergleich, Wiederholen, Überblick, Kommentar, Frage, Freigabe, Neues, Löschen, Finnisch → Deutsch, Lückentext, Verbformen, keine Überbreite, keine Konsolenfehler');
}finally{await browser?.close();server.kill();}
