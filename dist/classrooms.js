import {accountUser,accountRequest} from './auth.js';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const date=v=>v?new Date(v).toLocaleString('de-DE'):'Ohne Abgabetermin';
let room=null,selected=null,deck=null,busy=false,dirty=false;
const replyDrafts=new Map();
const drafts=new Map(); // Memory only; never localStorage or service-worker data.
const css=document.createElement('link');css.rel='stylesheet';css.href='./classrooms.css';document.head.append(css);
const button=document.createElement('button');button.id='classrooms-button';button.className='quiet';button.textContent='Klassenräume';
$('account-button').before(button);
document.body.insertAdjacentHTML('beforeend',`<dialog id="classrooms-dialog" aria-labelledby="classrooms-title"><div class="dialog-top"><h2 id="classrooms-title">Klassenräume</h2><button type="button" id="classrooms-close" class="quiet" aria-label="Klassenräume schließen">✕</button></div><p id="classrooms-status" role="status" aria-live="polite"></p><div id="classrooms-content"></div></dialog>`);
const status=(s,error=false)=>{$('classrooms-status').textContent=s;$('classrooms-status').classList.toggle('error',error);};
async function api(action,payload={}){
 if(!accountUser())throw new Error('Bitte zuerst anmelden.');
 const response=await accountRequest('/rest/v1/rpc/classroom_api',{method:'POST',body:JSON.stringify({action,payload})});
 const value=await response.json().catch(()=>({}));
 if(!response.ok||value.error)throw new Error(value.error||(value.code==='23505'?'Bereits abgegeben. Bitte aktualisieren.':value.message)||'Anfrage fehlgeschlagen. Bitte erneut versuchen.');
 return value;
}
async function run(fn){
 if(busy)return;busy=true;status('Wird geladen …');$('classrooms-dialog').setAttribute('aria-busy','true');
 try{await fn();status('');}catch(e){status(navigator.onLine?e.message:'Offline: Klassenräume benötigen eine Internetverbindung. Deine Eingaben bleiben hier erhalten.',true);}
 finally{busy=false;$('classrooms-dialog').removeAttribute('aria-busy');}
}
const b=(text,action,extra='')=>`<button type="button" class="quiet" data-cr="${action}" ${extra}>${text}</button>`;
function source(s,depth=0){
 if(!s||depth>3)return '';
 const link=/^\d+$/.test(String(s.id))?`<a href="https://tatoeba.org/en/sentences/show/${Number(s.id)}" target="_blank" rel="noopener">#${Number(s.id)}</a>`:'';
 return `${link} ${esc(s.owner||'Tatoeba')} · ${esc(s.license||'siehe Originalquelle')}${s.origin?` · ${esc(s.origin)} (übertragene/indirekte Übersetzung)`:''}${s.source?`<br>Vorlage: ${source(s.source,depth+1)}`:''}`;
}
const sources=s=>`<details class="cr-sources"><summary>Quellen &amp; Lizenzen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations?.[0])}</p></details>`;
async function home(){
 room=null;selected=null;dirty=false;
 if(!accountUser()){$('classrooms-content').innerHTML=`<p>Gemeinsam Finnisch lernen: Erstelle einen Raum oder tritt deiner Klasse per Code bei.</p><p>Zum Beitreten und Speichern brauchst du ein Konto.</p>${b('Anmelden / Registrieren','login')}`;return;}
 const rooms=await api('list');
 $('classrooms-content').innerHTML=`<p>Ein Raum für eure Sätze, Fragen und gemeinsamen Fortschritte.</p><div class="cr-grid"><form data-cr-form="create" class="cr-card"><h3>Klassenraum erstellen</h3><label>Raumname<input name="name" required minlength="3" maxlength="80" placeholder="Finnisch am Mittwoch"></label><p class="cr-note">Du übernimmst die Lehrkraft-Rolle und verwaltest Aufgaben und Mitglieder.</p><button class="primary">Raum erstellen</button></form><form data-cr-form="join" class="cr-card"><h3>Mit Code beitreten</h3><label>Einladungscode<input name="code" required maxlength="40" autocomplete="off" placeholder="Code der Lehrkraft"></label><p class="cr-note">Im Raum sind dein Nutzername und deine Beiträge sichtbar. Die Lehrkraft sieht deine Abgaben. Dein privater Lernstand bleibt privat.</p><button class="primary">Klasse beitreten</button></form></div><h3>Meine Klassenräume</h3><div class="cr-grid">${rooms.length?rooms.map(r=>`<article class="cr-card"><span class="cr-badge">${r.teacher?'Lehrkraft':'Teilnehmer'}${r.archived?' · Archiv':''}</span><h3>${esc(r.name)}</h3>${b('Raum öffnen','open',`data-id="${r.id}"`)}</article>`).join(''):'<p>Noch keine Klassenräume. Erstelle einen Raum oder gib einen Einladungscode ein.</p>'}</div>`;
}
async function open(id){room=await api('room',{room_id:id});renderRoom();}
function renderRoom(){
 dirty=false;
 const assignments=room.assignments;
 $('classrooms-content').innerHTML=`<div class="cr-toolbar">${b('← Meine Räume','home')}${b('Aktualisieren','refresh')}</div><div class="cr-hero"><span class="cr-badge">${room.teacher?'Dein Klassenraum · Lehrkraft':'Dein Klassenraum · Teilnehmer'}</span><h2>${esc(room.name)}</h2><p>1 Lehrkraft · ${room.member_count} Teilnehmer · ${assignments.length} Aufgabenpakete${room.archived?' · Archiviert':''}</p></div>${room.teacher?`<details class="cr-card"><summary>Einladung &amp; Mitglieder verwalten</summary><p>Einladungscode: <strong class="cr-code">${esc(room.code)}</strong></p><div class="cr-toolbar">${b('Code kopieren','copy')}${!room.archived?b('Code erneuern','rotate')+b('Raum archivieren','archive'):''}${b('Klassenraum löschen','delete_room','data-danger="true"')}</div><form id="cr-delete-confirm" data-cr-form="delete_room" class="cr-delete-warning" hidden><h3>Klassenraum endgültig löschen</h3><p>Alle Aufgaben, Abgaben, Fragen, Reaktionen und Mitgliedschaften dieses Raums werden unwiderruflich gelöscht. Nutzerkonten und persönliche Lernstände bleiben erhalten.</p><label>Zur Bestätigung den Raumnamen „${esc(room.name)}“ eingeben<input name="confirm_name" required maxlength="80" autocomplete="off"></label><div class="cr-toolbar"><button class="quiet cr-danger" type="submit">Endgültig löschen</button>${b('Abbrechen','cancel_delete')}</div></form><p class="cr-note">Entfernte Mitglieder können mit diesem Konto nicht erneut beitreten. Archivierte Räume bleiben lesbar.</p></details>`:`<p class="cr-note">Deine Abgaben sieht die Lehrkraft. Nach der Freigabe sieht die Klasse Antworten ohne Nutzernamen; dies ist keine Garantie gegen Wiedererkennung. Fragen erscheinen mit Nutzernamen.</p>${b('Raum verlassen','leave')}`}
 <details class="cr-card cr-roster" open><summary>Mitglieder · ${room.members.filter(m=>!m.blocked).length}</summary>${room.members.map(m=>`<div class="cr-member"><span>${esc(m.name)} · ${m.role==='teacher'?'Lehrkraft · Ersteller':'Teilnehmer'}${m.blocked?' · entfernt':''}</span>${room.teacher&&m.role!=='teacher'&&!m.blocked&&!room.archived?b('Entfernen','remove',`data-id="${m.id}"`):''}</div>`).join('')}</details>
 ${room.teacher&&!room.archived?`<p>${b('＋ Aufgabenpaket erstellen','new_assignment')}</p><div id="cr-composer"></div>`:''}<h3>Aufgaben &amp; Klassenfortschritt</h3><div class="cr-grid">${assignments.map(a=>{const own=a.submissions.some(s=>s.own);return `<article class="cr-card"><span class="cr-badge">${a.released?'Vergleich freigegeben':own?'Abgegeben':a.due_at&&new Date(a.due_at)<new Date()?'Frist abgelaufen':'Offen'}</span><h3>${esc(a.title)}</h3><p>${a.items.length} Sätze · ${esc(date(a.due_at))}</p><label>${a.submitted_count} / ${room.member_count} Teilnehmer haben abgegeben<progress max="${Math.max(room.member_count,1)}" value="${a.submitted_count}"></progress></label>${b('Aufgabe öffnen','assignment',`data-id="${a.id}"`)}</article>`;}).join('')||'<p>Noch keine Aufgaben. Die Lehrkraft kann das erste Satzpaket zusammenstellen.</p>'}</div>`;
}
async function composer(){
 if(!deck){const r=await fetch('./sentences.json');if(!r.ok)throw new Error('Sätze konnten nicht geladen werden.');deck=(await r.json()).sentences;}
 $('cr-composer').innerHTML=`<form data-cr-form="assign" class="cr-card"><h3>Neues Satzpaket</h3><label>Titel<input name="title" required minlength="3" maxlength="100" placeholder="Unsere erste Übersetzungsrunde"></label><div class="cr-grid"><label>Level<select id="cr-level">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></label><label>Suche im Satz<input id="cr-search" placeholder="z. B. Kaffee"></label><label>Abgabetermin (optional)<input name="due" type="datetime-local"></label></div><p>Wähle 1–20 Sätze. Die Auswahl bleibt beim Filtern erhalten.</p><p id="cr-selection-count">0 Sätze ausgewählt</p><div id="cr-sentence-picker"></div><button class="primary">Aufgabenpaket veröffentlichen</button></form>`;
 selected=new Map();picker();
}
function picker(){
 const term=$('cr-search').value.toLowerCase(),level=Number($('cr-level').value);
 const matches=deck.filter(s=>s.level===level&&s.translations?.length&&`${s.text} ${s.translations[0].text}`.toLowerCase().includes(term));
 $('cr-sentence-picker').innerHTML=matches.slice(0,80).map(s=>`<label class="cr-pick"><input type="checkbox" data-sentence="${s.id}" ${selected.has(s.id)?'checked':''}><span>${esc(s.translations[0].text)}<small lang="fi">${esc(s.text)}</small></span></label>`).join('')||'<p>Keine passenden Sätze.</p>';
 if(matches.length>80)$('cr-sentence-picker').insertAdjacentHTML('beforeend','<p>Die ersten 80 Treffer. Grenze die Suche bei Bedarf ein.</p>');
}
function assignment(id){
 const a=room.assignments.find(x=>x.id===id);if(!a)throw new Error('Aufgabe nicht mehr verfügbar.');
 selected=id;dirty=false;
 const own=a.submissions.find(s=>s.own),closed=room.archived||a.released||(a.due_at&&new Date(a.due_at)<new Date());
 const canSubmit=!room.teacher&&!own&&!closed,answers=drafts.get(id)||[];
 $('classrooms-content').innerHTML=`<div class="cr-toolbar">${b('← Zum Klassenraum','back')}${b('Aktualisieren','refresh_assignment')}</div><h2>${esc(a.title)}</h2><p>${esc(date(a.due_at))} · ${a.submitted_count}/${room.member_count} Abgaben</p><p class="cr-note">Deutsch → Finnisch. Andere Formulierungen können ebenfalls richtig sein. Keine automatische Benotung; Satzvorlagen sind Übungsmaterial, kein geschützter Prüfungstest.</p>${room.teacher&&!a.released&&!room.archived?`<p>${b('Abgaben schließen & Vergleich freigeben','release')}</p><p class="cr-note">Danach sind keine weiteren Abgaben möglich. Die Klasse sieht die Antworten ohne Nutzernamen.</p>`:''}${canSubmit?'<form data-cr-form="submit">':''}${a.items.map((s,i)=>`<article class="cr-card"><h3>${i+1}. ${esc(s.translations[0].text)}</h3>${canSubmit?`<label for="cr-answer-${i}">Deine finnische Übersetzung</label><textarea id="cr-answer-${i}" name="answer-${i}" data-answer="${i}" required maxlength="2000" rows="2" lang="fi">${esc(answers[i]||'')}</textarea>`:own?`<p lang="fi">Deine Antwort: ${esc(own.answers[i])}</p>`:''}${room.teacher||own||a.released?`<p lang="fi"><strong>Finnische Vorlage:</strong> ${esc(s.text)}</p>`:''}${sources(s)}</article>`).join('')}${canSubmit?'<p class="cr-note">Abgabe ist verbindlich. Entwürfe bleiben nur in dieser geöffneten Seite erhalten und gehen beim Neuladen verloren.</p><button class="primary">Alle Antworten verbindlich abgeben</button></form>':`<p>${own?'Deine Antworten sind gespeichert.':room.teacher?'Hier siehst du die eingereichten Antworten.':'Abgabe ist geschlossen.'}</p>`}
 ${room.teacher||a.released?`<h3>${room.teacher?'Abgabenübersicht':'Gemeinsamer Lösungsvergleich'}</h3>${room.teacher?`<p>Noch ohne Abgabe: ${room.members.filter(m=>m.role!=='teacher'&&!m.blocked&&!a.submissions.some(s=>s.author===m.name)).map(m=>esc(m.name)).join(', ')||'niemand'}</p>`:''}${a.submissions.map((s,i)=>`<article class="cr-card"><h4>${room.teacher?esc(s.author):s.own?'Deine Lösung':`Lösung ${i+1}`}</h4>${s.answers.map((v,j)=>`<p><strong>${j+1}.</strong> <span lang="fi">${esc(v)}</span></p>`).join('')}${a.released&&!room.archived?`<div class="cr-toolbar">${Object.entries({helpful:'Hilfreich',interesting:'Interessant',encouraging:'Gut gemacht'}).map(([k,label])=>b(`${label} · ${s.reactions[k]||0}`,'react',`data-id="${s.id}" data-kind="${k}"`)).join('')}</div>`:''}</article>`).join('')||'<p>Noch keine Abgaben.</p>'}`:'<p>Der gemeinsame Lösungsvergleich wird von der Lehrkraft freigegeben.</p>'}
 <h3>Fragen &amp; Austausch zu den Sätzen</h3><p class="cr-note">Für alle im Raum sichtbar, mit Nutzernamen. Keine persönlichen Daten posten. Die Lehrkraft kann Beiträge entfernen.</p>${discussion(a)}${!room.archived?`<form data-cr-form="message" class="cr-card"><h4>Neue Diskussion starten</h4><label>Zu welchem Satz?<select name="item_index">${a.items.map((s,i)=>`<option value="${i}">${i+1}. ${esc(s.translations[0].text)}</option>`).join('')}</select></label><label>Frage oder Diskussionsbeitrag<textarea name="body" required maxlength="1500" rows="3"></textarea></label><button class="primary">Beitrag senden</button></form>`:''}`;
}
function discussion(a){
 if(!a.messages.length)return '<p>Noch keine Fragen – starte eine Diskussion zu einem Satz.</p>';
 const ids=new Set(a.messages.map(m=>m.id)),children=new Map();
 for(const m of a.messages){
   const parent=m.parent_id&&ids.has(m.parent_id)?m.parent_id:null;
   if(!children.has(parent))children.set(parent,[]);children.get(parent).push(m);
 }
 const seen=new Set();
 function render(parent,depth=0){
   return (children.get(parent)||[]).map(m=>{
     if(seen.has(m.id))return '';seen.add(m.id);
     const parentMessage=a.messages.find(x=>x.id===m.parent_id);
     return `<li class="cr-thread-node"><article class="cr-message" id="cr-message-${m.id}" data-message-id="${m.id}"><div class="cr-message-meta"><strong>${esc(m.author)}</strong>${m.teacher?' · Lehrkraft':''} · Satz ${m.item_index+1}${m.created_at?` · <time datetime="${esc(m.created_at)}">${esc(date(m.created_at))}</time>`:''}</div>${parentMessage?`<small class="cr-note">Antwort an ${esc(parentMessage.author)}</small>`:''}<p class="${m.deleted?'cr-removed':''}">${esc(m.deleted?'Beitrag entfernt.':m.body)}</p><div class="cr-toolbar">${!room.archived?b('Antworten','reply',`data-id="${m.id}"`):''}${!m.deleted&&(room.teacher||m.own)&&!room.archived?b('Beitrag entfernen','delete_message',`data-id="${m.id}"`):''}</div><div id="cr-reply-${m.id}"></div></article>${children.has(m.id)?`<ul class="cr-replies ${depth>=3?'cr-replies-deep':''}" aria-label="Antworten auf den Beitrag von ${esc(m.author)}">${render(m.id,depth+1)}</ul>`:''}</li>`;
   }).join('');
 }
 return `<ul class="cr-discussions" aria-label="Diskussionen">${render(null)}</ul>`;
}
async function refreshAssignment(){const id=selected;room=await api('room',{room_id:room.id});assignment(id);}
function canNavigate(){return !dirty||confirm('Ungespeicherte Eingaben verlassen? Antwortentwürfe bleiben bis zum Neuladen dieser Seite erhalten.');}
button.onclick=()=>{$('classrooms-dialog').showModal();run(home);};
$('classrooms-close').onclick=()=>{if(canNavigate())$('classrooms-dialog').close();};
$('classrooms-dialog').addEventListener('cancel',e=>{if(!canNavigate())e.preventDefault();});
$('classrooms-content').addEventListener('input',e=>{
 dirty=true;
 if(e.target.matches('[data-answer]')){const v=drafts.get(selected)||[];v[Number(e.target.dataset.answer)]=e.target.value;drafts.set(selected,v);}
 if(e.target.matches('[data-reply-id]'))replyDrafts.set(e.target.dataset.replyId,e.target.value);
 if(e.target.id==='cr-search')picker();
});
$('classrooms-content').addEventListener('change',e=>{
 if(e.target.id==='cr-level')picker();
 if(e.target.matches('[data-sentence]')){const id=Number(e.target.dataset.sentence);if(e.target.checked){if(selected.size>=20){e.target.checked=false;status('Maximal 20 Sätze pro Paket.',true);return;}selected.set(id,deck.find(s=>s.id===id));}else selected.delete(id);$('cr-selection-count').textContent=`${selected.size} Sätze ausgewählt`;}
});
$('classrooms-content').addEventListener('click',e=>{
 const el=e.target.closest('[data-cr]');if(!el)return;
 const action=el.dataset.cr;
 run(async()=>{
   if(['home','back','refresh','refresh_assignment','assignment'].includes(action)&&!canNavigate())return;
   if(action==='login'){$('classrooms-dialog').close();$('account-button').click();return;}
   if(action==='home')return home();if(action==='open')return open(el.dataset.id);
   if(action==='back'||action==='refresh')return open(room.id);
   if(action==='assignment')return assignment(el.dataset.id);
   if(action==='refresh_assignment')return refreshAssignment();
   if(action==='new_assignment')return composer();
   if(action==='reply'){
     const a=room.assignments.find(x=>x.id===selected),m=a.messages.find(x=>x.id===el.dataset.id);
     if(!m||room.archived)throw new Error('Auf diesen Beitrag kann gerade nicht geantwortet werden.');
     const slot=$('cr-reply-'+m.id);
     if(!slot.querySelector('form'))slot.innerHTML=`<form data-cr-form="message" class="cr-reply-form"><input type="hidden" name="parent_id" value="${m.id}"><input type="hidden" name="item_index" value="${m.item_index}"><label>Antwort an ${esc(m.author)}<textarea name="body" data-reply-id="${m.id}" required maxlength="1500" rows="3">${esc(replyDrafts.get(m.id)||'')}</textarea></label><div class="cr-toolbar"><button class="primary">Antwort senden</button>${b('Abbrechen','cancel_reply',`data-id="${m.id}"`)}</div></form>`;
     slot.querySelector('textarea').focus();return;
   }
   if(action==='cancel_reply'){$('cr-reply-'+el.dataset.id).innerHTML='';return;}
   if(action==='delete_room'){$('cr-delete-confirm').hidden=false;$('cr-delete-confirm').querySelector('input').focus();return;}
   if(action==='cancel_delete'){$('cr-delete-confirm').reset();$('cr-delete-confirm').hidden=true;dirty=false;return;}
   if(action==='copy'){await navigator.clipboard.writeText(room.code);el.textContent='Kopiert ✓';return;}
   if(['rotate','archive','remove','leave','release','delete_message'].includes(action)&&!confirm({rotate:'Bisherigen Einladungscode ungültig machen?',archive:'Raum archivieren? Er bleibt lesbar, neue Beiträge und Beitritte werden geschlossen.',remove:'Dieses Mitglied entfernen und erneuten Beitritt sperren?',leave:'Raum verlassen? Deine bisherigen Beiträge und Abgaben bleiben im Raum.',release:'Alle Abgaben schließen und Antworten für die Klasse freigeben?',delete_message:'Den Inhalt dieses Beitrags entfernen? Antworten darauf bleiben erhalten.'}[action]))return;
   await api(action,{room_id:room.id,assignment_id:typeof selected==='string'?selected:null,user_id:el.dataset.id,submission_id:el.dataset.id,message_id:el.dataset.id,kind:el.dataset.kind});
   if(action==='leave')return home();
   if(['release','react','delete_message'].includes(action))return refreshAssignment();
   return open(room.id);
 });
});
$('classrooms-content').addEventListener('submit',e=>{
 const form=e.target;e.preventDefault();const data=new FormData(form),action=form.dataset.crForm;
 run(async()=>{
   let payload=Object.fromEntries(data);
   if(action==='assign'){
     if(!selected?.size)throw new Error('Bitte mindestens einen Satz auswählen.');
     payload={title:data.get('title'),items:[...selected.values()],due_at:data.get('due')?new Date(data.get('due')).toISOString():null};
   }
   if(action==='submit'){
     const a=room.assignments.find(x=>x.id===selected);
     payload={assignment_id:selected,answers:a.items.map((s,i)=>String(data.get(`answer-${i}`)||'').trim())};
     if(!confirm('Antworten jetzt verbindlich abgeben? Danach sind sie nicht mehr änderbar.'))return;
   }
   if(action==='message')payload.assignment_id=selected;
   if(action==='delete_room'&&data.get('confirm_name')!==room.name)throw new Error('Bitte den Raumnamen exakt eingeben.');
   if(room)payload.room_id=room.id;
   const value=await api(action,payload);dirty=false;
   if(action==='delete_room'){for(const a of room.assignments)drafts.delete(a.id);await home();$('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Klassenraum und zugehörige Inhalte wurden endgültig gelöscht.</p>');return;}
   if(action==='create'||action==='join')return open(value.id);
   if(action==='submit'){drafts.delete(selected);return refreshAssignment();}
   if(action==='message'){
     if(payload.parent_id)replyDrafts.delete(payload.parent_id);
     await refreshAssignment();
     if(payload.parent_id)$('cr-message-'+payload.parent_id)?.scrollIntoView?.({block:'nearest'});
     return;
   }
   return open(room.id);
 });
});
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
