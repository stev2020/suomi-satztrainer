import {accountUser,accountRequest} from './auth.js';
import {GRAMMAR_TOPICS,topicNotes} from './grammar-topics.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const date=v=>v?new Date(v).toLocaleString('de-DE'):'Ohne Abgabetermin';
let room=null,selected=null,deck=null,grammar=null,customItems=[],busy=false,dirty=false;
const replyDrafts=new Map();
const drafts=new Map(); // Memory only; never localStorage or service-worker data.
const css=document.createElement('link');css.rel='stylesheet';css.href='./classrooms.css';document.head.append(css);
const button=document.createElement('button');button.id='classrooms-button';button.type='button';button.dataset.view='classrooms';button.textContent='Klassenräume';
const headerNav=document.querySelector('.header-nav');
if(headerNav)headerNav.insertBefore(button,headerNav.querySelector('[data-view="progress"]'));else $('account-button').before(button);
const main=document.querySelector('main')||document.body.appendChild(document.createElement('main'));
const classroomAnchor=main.querySelector('.page-tools')||main.querySelector('.bottom-nav')||main.querySelector('footer');
const classroomMarkup=`<section id="classrooms-view" class="app-view classrooms-view" aria-labelledby="classrooms-title" hidden><div class="view-heading"><div class="cr-view-title"><div><div class="eyebrow">GEMEINSAM LERNEN</div><h1 id="classrooms-title">Klassenräume</h1></div><button type="button" id="classrooms-refresh" class="quiet" hidden>Aktualisieren</button></div></div><p id="classrooms-status" role="status" aria-live="polite"></p><div id="classrooms-content"></div></section>`;
if(classroomAnchor)classroomAnchor.insertAdjacentHTML('beforebegin',classroomMarkup);else main.insertAdjacentHTML('beforeend',classroomMarkup);
const status=(s,error=false)=>{$('classrooms-status').textContent=s;$('classrooms-status').classList.toggle('error',error);};
async function api(action,payload={}){
 if(!accountUser())throw new Error('Bitte zuerst anmelden.');
 const response=await accountRequest('/rest/v1/rpc/classroom_api',{method:'POST',body:JSON.stringify({action,payload})});
 const value=await response.json().catch(()=>({}));
 if(!response.ok||value.error)throw new Error(value.error||(value.code==='23505'?'Bereits abgegeben. Bitte aktualisieren.':value.message)||'Anfrage fehlgeschlagen. Bitte erneut versuchen.');
 return value;
}
async function run(fn){
 if(busy)return;busy=true;status('Wird geladen …');$('classrooms-view').setAttribute('aria-busy','true');
 try{await fn();status('');}catch(e){status(navigator.onLine?e.message:'Offline: Klassenräume benötigen eine Internetverbindung. Deine Eingaben bleiben hier erhalten.',true);}
 finally{busy=false;$('classrooms-view').removeAttribute('aria-busy');}
}
const b=(text,action,extra='')=>`<button type="button" class="quiet" data-cr="${action}" ${extra}>${text}</button>`;
function source(s,depth=0){
 if(!s||depth>3)return '';
 const link=/^\d+$/.test(String(s.id))?`<a href="https://tatoeba.org/en/sentences/show/${Number(s.id)}" target="_blank" rel="noopener">#${Number(s.id)}</a>`:'';
 return `${link} ${esc(s.owner||'Tatoeba')} · ${esc(s.license||'siehe Originalquelle')}${s.origin?` · ${esc(s.origin)} (übertragene/indirekte Übersetzung)`:''}${s.source?`<br>Vorlage: ${source(s.source,depth+1)}`:''}`;
}
const sources=s=>s.origin==='teacher_created'?'<details class="cr-sources"><summary>Herkunft</summary><p>Eigener Satz und richtige Übersetzung der Lehrkraft.</p></details>':`<details class="cr-sources"><summary>Quellen &amp; Lizenzen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations?.[0])}</p></details>`;
function updateHeading(){
 $('classrooms-title').textContent=room?.name||'Klassenräume';
 $('classrooms-refresh').hidden=!room;
}
async function home(){
 room=null;selected=null;dirty=false;streamFilter='all';updateHeading();
 if(!accountUser()){$('classrooms-content').innerHTML=`<p>Gemeinsam Finnisch lernen: Erstelle einen Raum oder tritt deiner Klasse per Code bei.</p><p>Zum Beitreten und Speichern brauchst du ein Konto.</p>${b('Anmelden / Registrieren','login')}`;return;}
 const rooms=await api('list');
 $('classrooms-content').innerHTML=`<p>Ein Raum für eure Sätze, Fragen und gemeinsamen Fortschritte.</p><h3>Meine Klassenräume</h3><div class="cr-grid">${rooms.length?rooms.map(r=>`<article class="cr-card cr-room-card"><span class="cr-badge">${r.teacher?'Lehrkraft':'Teilnehmer'}${r.archived?' · Archiv':''}</span><h3>${esc(r.name)}</h3>${b('Raum öffnen','open',`data-id="${r.id}"`)}</article>`).join(''):'<p>Noch keine Klassenräume. Erstelle einen Raum oder gib einen Einladungscode ein.</p>'}</div><div class="cr-grid cr-room-actions"><details class="cr-card cr-room-action"><summary><span><strong>Klassenraum erstellen</strong><small class="cr-room-action-closed">Zum Öffnen anklicken</small><small class="cr-room-action-open">Einklappen</small></span></summary><form data-cr-form="create"><label>Raumname<input name="name" required minlength="3" maxlength="80" placeholder="Finnisch am Mittwoch"></label><label>Dein Name in diesem Klassenraum<input name="display_name" required maxlength="80" autocomplete="name" placeholder="Zum Beispiel Anna Müller"></label><p class="cr-note">So sieht dich diese Klasse. Dein Benutzername für den Login bleibt unverändert.</p><p class="cr-note">Du übernimmst die Lehrkraft-Rolle und verwaltest Aufgaben und Mitglieder.</p><button class="primary">Raum erstellen</button></form></details><details class="cr-card cr-room-action"><summary><span><strong>Mit Code beitreten</strong><small class="cr-room-action-closed">Zum Öffnen anklicken</small><small class="cr-room-action-open">Einklappen</small></span></summary><form data-cr-form="join"><label>Einladungscode<input name="code" required maxlength="40" autocomplete="off" placeholder="Code der Lehrkraft"></label><label>Dein Name in diesem Klassenraum<input name="display_name" required maxlength="80" autocomplete="name" placeholder="Zum Beispiel Anna Müller"></label><p class="cr-note">So sieht dich diese Klasse. Dein Benutzername für den Login bleibt unverändert.</p><p class="cr-note">Im Raum sind dein Klassenraumname und deine Beiträge sichtbar. Die Lehrkräfte sehen deine Abgaben. Dein privater Lernstand bleibt privat.</p><button class="primary">Klasse beitreten</button></form></details></div>`;
}
async function open(id){
 const next=await api('room',{room_id:id});
 const feed=await api('stream_list',{room_id:id});
 room=next;stream=feed;selected=null;updateHeading();renderRoom();
}
function memberRow(m){
 const label=`${esc(m.name)} · ${m.owner?'Lehrkraft · Ersteller':m.role==='teacher'?'Lehrkraft':'Teilnehmer'}${m.blocked?' · entfernt':''}`;
 if(m.own)return `<details class="cr-member cr-member-menu cr-own-member"><summary title="Deinen Namen ändern">${label} · Du <small>(Name ändern)</small></summary><form data-cr-form="rename"><label>Dein Name in diesem Klassenraum<input name="display_name" required maxlength="80" autocomplete="name" value="${esc(m.name)}"></label><p class="cr-note">Gilt nur hier. Dein Login-Benutzername bleibt unverändert.</p><div class="cr-member-actions"><button type="submit" class="primary">Namen speichern</button>${b('Abbrechen','cancel_name')}</div></form></details>`;
 if(!room.owner||m.owner||m.blocked||room.archived)return `<div class="cr-member"><span>${label}</span></div>`;
 return `<details class="cr-member cr-member-menu"><summary title="Mitglied verwalten">${label}</summary><div class="cr-member-actions">${b(m.role==='teacher'?'Lehrkraftrolle entziehen':'Zur Lehrkraft machen','set_role',`data-id="${m.id}" data-role="${m.role==='teacher'?'student':'teacher'}"`)}${b('Entfernen','remove',`data-id="${m.id}"`)}</div></details>`;
}
function renderRoom(){
 dirty=false;
 const assignments=room.assignments;
 $('classrooms-content').innerHTML=`<div class="cr-stream-layout"><div class="cr-stream-main"><div id="cr-composer"></div>
 ${room.archived?'<p class="cr-note">Dieser Raum ist archiviert. Ihr könnt alle bisherigen Beiträge lesen.</p>':streamComposer()}
 <div class="cr-toolbar cr-feed-filters" role="group" aria-label="Klassenstream filtern">${Object.entries({all:'Alles',assignment:'Aufgaben',question:'Fragen',announcement:'Ankündigungen'}).map(([id,label])=>`<button type="button" class="quiet" data-cr="stream_filter" data-filter="${id}" aria-pressed="${streamFilter===id}">${label}</button>`).join('')}</div>
 <div id="cr-stream-feed"></div>${stream.has_more?b('Weitere Beiträge laden','stream_more'):''}</div>
 <aside class="cr-stream-sidebar" aria-label="Klassenübersicht"><section class="cr-card cr-today"><div class="eyebrow">IM BLICK</div><h3>Heute &amp; demnächst</h3>${room.teacher&&!room.archived?b('Aufgabe erstellen','new_assignment'):''}${upcomingAssignments()}<p class="cr-note">${stream.open_questions||0} Fragen warten auf eine Antwort.</p></section>
 <details class="cr-card cr-sidebar-disclosure"><summary>Unsere Klasse</summary><div class="cr-sidebar-disclosure-content"><details class="cr-card cr-roster" open><summary>Mitglieder · ${room.members.filter(m=>!m.blocked).length}</summary>${room.members.map(memberRow).join('')}</details>${room.owner&&!room.archived?'<p class="cr-note">Lehrkräfte können Aufgaben erstellen, Abgaben einsehen und den Austausch betreuen. Nur du als Ersteller verwaltest Rollen und den Raum.</p>':''} ${room.owner?`<details class="cr-card"><summary>Einladung &amp; Mitglieder verwalten</summary><p>Einladungscode: <strong class="cr-code">${esc(room.code)}</strong></p><div class="cr-toolbar">${b('Code kopieren','copy')}${!room.archived?b('Code erneuern','rotate')+b('Raum archivieren','archive'):''}${b('Klassenraum löschen','delete_room','data-danger="true"')}</div><form id="cr-delete-confirm" data-cr-form="delete_room" class="cr-delete-warning" hidden><h3>Klassenraum endgültig löschen</h3><p>Alle Aufgaben, Abgaben, Fragen, Reaktionen und Mitgliedschaften dieses Raums werden unwiderruflich gelöscht. Nutzerkonten und persönliche Lernstände bleiben erhalten.</p><label>Zur Bestätigung den Raumnamen „${esc(room.name)}“ eingeben<input name="confirm_name" required maxlength="80" autocomplete="off"></label><div class="cr-toolbar"><button class="quiet cr-danger" type="submit">Endgültig löschen</button>${b('Abbrechen','cancel_delete')}</div></form><p class="cr-note">Entfernte Mitglieder können mit diesem Konto nicht erneut beitreten. Archivierte Räume bleiben lesbar.</p></details>`:`<p class="cr-note">Deine Abgaben sehen die Lehrkräfte. Nach der Freigabe sieht die Klasse Antworten ohne Nutzernamen; dies ist keine Garantie gegen Wiedererkennung. Fragen erscheinen mit deinem Klassenraumnamen.</p>${b('Raum verlassen','leave')}`}</div></details>
 <details class="cr-card cr-sidebar-disclosure"><summary>Klassenfortschritt</summary><div class="cr-sidebar-disclosure-content"><p class="cr-note">Gemeinsamer Abgabestand der Aufgaben. Persönliche Lernstände bleiben privat.</p>${assignments.slice(0,5).map(a=>`<div class="cr-progress-item"><strong>${esc(a.title)}</strong><label>${a.submitted_count} / ${room.member_count} Abgaben<progress max="${Math.max(room.member_count,1)}" value="${a.submitted_count}"></progress></label></div>`).join('')||'<p>Noch keine Aufgaben.</p>'}</div></details></aside></div>`;
 renderFeed();restoreStreamDraft();
}
async function composer(){
 if(!deck||!grammar){
   const [sentencesResponse,grammarResponse]=await Promise.all([fetch('./sentences.json'),fetch('./grammar.json')]);
   if(!sentencesResponse.ok||!grammarResponse.ok)throw new Error('Sätze und Grammatikthemen konnten nicht geladen werden.');
   deck=(await sentencesResponse.json()).sentences;grammar=(await grammarResponse.json()).sentences;
 }
 selected=new Map();customItems=[{de:'',fi:'',added:false}];
 const customSection=title=>`<section class="cr-assignment-source"><div class="cr-section-heading"><div><h4>${title}</h4><p class="cr-note">Diese Sätze gelten nur für diese Aufgabe und erscheinen später nicht als gespeicherte Auswahl.</p></div>${b('＋ Weiteren Satz eingeben','add_custom')}</div><div data-custom-host></div></section>`;
 $('cr-composer').scrollIntoView?.({block:'start',behavior:'smooth'});
 $('cr-composer').innerHTML=`<form data-cr-form="assign" class="cr-card"><h3>Neue Aufgabe</h3><div class="cr-tabs" role="tablist" aria-label="Art der Sätze"><button type="button" role="tab" aria-selected="true" data-cr="tab_custom">Eigene Sätze</button><button type="button" role="tab" aria-selected="false" data-cr="tab_existing">Vorhandene Sätze</button></div><label>Titel<input name="title" required minlength="3" maxlength="100" placeholder="Unsere erste Übersetzungsrunde"></label><label>Abgabetermin (optional)<input name="due" type="datetime-local"></label><div id="cr-tab-custom" role="tabpanel">${customSection('Eigene Sätze erstellen')}</div><div id="cr-tab-existing" role="tabpanel" hidden><section class="cr-assignment-source"><h4>Vorhandene Sätze auswählen</h4><div class="cr-grid"><label>Level<select id="cr-level">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></label><label>Grammatikthema<select id="cr-topic"></select></label></div><p id="cr-topic-hint" class="cr-note"></p><div id="cr-sentence-picker"></div></section>${customSection('Eigene Sätze ergänzen')}</div><p>Insgesamt sind 1–20 hinzugefügte oder ausgewählte Sätze möglich.</p><p id="cr-selection-count">0 Sätze ausgewählt</p><button class="primary">Aufgabe veröffentlichen</button></form>`;
 renderTopicOptions();picker();renderCustomItems();updateSelectionCount();
}
const addedCustomItems=()=>customItems.filter(item=>item.added);
const selectionSize=()=>selected.size+addedCustomItems().length;
function updateSelectionCount(){if($('cr-selection-count'))$('cr-selection-count').textContent=`${selectionSize()} ${selectionSize()===1?'Satz':'Sätze'} ausgewählt`;}
function setComposerTab(name){
 renderCustomItems();
 const custom=name==='custom';$('cr-tab-custom').hidden=!custom;$('cr-tab-existing').hidden=custom;
 document.querySelectorAll('.cr-tabs [role=tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.cr===(custom?'tab_custom':'tab_existing'))));
}
function renderTopicOptions(){
 const select=$('cr-topic'),level=Number($('cr-level').value),current=select.value;
 select.innerHTML=GRAMMAR_TOPICS.map(t=>{const count=deck.filter(s=>s.level===level&&s.translations?.length&&topicNotes(s,grammar,t.id).length).length;return `<option value="${t.id}">${esc(t.label)} (${count})</option>`;}).join('');
 if(GRAMMAR_TOPICS.some(t=>t.id===current))select.value=current;
}
function picker(){
 const level=Number($('cr-level').value),topicId=$('cr-topic').value,topic=GRAMMAR_TOPICS.find(t=>t.id===topicId);
 const matches=deck.filter(s=>s.level===level&&s.translations?.length&&topicNotes(s,grammar,topicId).length);
 $('cr-topic-hint').textContent=topic?.hint||'';
 $('cr-sentence-picker').innerHTML=matches.slice(0,80).map(s=>`<label class="cr-pick"><input type="checkbox" data-sentence="${s.id}" ${selected.has(s.id)?'checked':''}><span>${esc(s.translations[0].text)}<small lang="fi">${esc(s.text)}</small></span></label>`).join('')||'<p>Keine passenden Sätze.</p>';
 if(matches.length>80)$('cr-sentence-picker').insertAdjacentHTML('beforeend','<p>Die ersten 80 Treffer. Wähle bei Bedarf ein anderes Level oder Thema.</p>');
}
function renderCustomItems(){
 const html=customItems.map((item,i)=>`<fieldset class="cr-custom-item ${item.added?'cr-custom-added':''}"><legend>Eigener Satz ${i+1}${item.added?' · ✓ Hinzugefügt':''}</legend>${item.added?`<p class="cr-added" role="status">✓ Hinzugefügt – dieser Satz ist Teil der Aufgabe.</p><p class="cr-custom-text" lang="de"><strong>Deutscher Satz</strong><br>${esc(item.de)}</p><p class="cr-custom-text" lang="fi"><strong>Richtige finnische Übersetzung</strong><br>${esc(item.fi)}</p>`:`<label>Deutscher Satz<textarea data-custom-index="${i}" data-custom-field="de" maxlength="500" rows="2" lang="de" placeholder="Welchen Satz sollen die Schüler übersetzen?">${esc(item.de)}</textarea></label><label>Richtige finnische Übersetzung<textarea data-custom-index="${i}" data-custom-field="fi" maxlength="500" rows="2" lang="fi" placeholder="Die richtige Lösung auf Finnisch">${esc(item.fi)}</textarea></label>`}<div class="cr-toolbar">${item.added?b('Satz bearbeiten','edit_custom',`data-index="${i}"`):b('Satz hinzufügen','confirm_custom',`data-index="${i}"`)}${b('Satz entfernen','remove_custom',`data-index="${i}"`)}</div></fieldset>`).join('')||'<p class="cr-note">Noch keine eigenen Sätze eingegeben.</p>';
 document.querySelectorAll('[data-custom-host]').forEach(host=>host.innerHTML=html);
}
function assignment(id){
 const a=room.assignments.find(x=>x.id===id);if(!a)throw new Error('Aufgabe nicht mehr verfügbar.');
 selected=id;dirty=false;
 const own=a.submissions.find(s=>s.own),closed=room.archived||a.released||(a.due_at&&new Date(a.due_at)<new Date());
 const isCreator=a.own_assignment===undefined?room.teacher:a.own_assignment===true,showOverview=room.teacher&&(isCreator||Boolean(own)||a.released);
 const canSubmit=!isCreator&&!own&&!closed,answers=drafts.get(id)||[],statusText=a.released?'Vergleich freigegeben':own?'Abgegeben':closed?'Geschlossen':'Offen';
 $('classrooms-content').innerHTML=`<div class="cr-toolbar cr-assignment-nav">${b('← Zum Klassenraum','back')}</div><section class="cr-assignment-hero"><span class="cr-assignment-kicker">Klassenaufgabe</span><h2>${esc(a.title)}</h2><div class="cr-assignment-meta"><span><strong>Frist</strong>${esc(date(a.due_at))}</span><span><strong>Abgaben</strong>${a.submitted_count} von ${room.member_count}</span><span class="cr-assignment-status">${esc(statusText)}</span></div></section><div class="cr-assignment-intro"><span aria-hidden="true">✦</span><p><strong>Deutsch → Finnisch</strong><br>Andere Formulierungen können ebenfalls richtig sein. Es gibt keine automatische Benotung; die Satzvorlagen dienen zum gemeinsamen Üben.</p></div>${room.teacher&&!a.released&&!room.archived?`<p>${b('Abgaben schließen & Vergleich freigeben','release')}</p><p class="cr-note">Danach sind keine weiteren Abgaben möglich. Die Klasse sieht die Antworten ohne Nutzernamen.</p>`:''}${canSubmit?'<form data-cr-form="submit">':''}${a.items.map((s,i)=>`<article class="cr-card cr-assignment-item"><div class="cr-assignment-number" aria-hidden="true">${i+1}</div><div class="cr-assignment-item-body"><span class="cr-assignment-language">Deutscher Satz</span><h3>${esc(s.translations[0].text)}</h3>${canSubmit?`<label for="cr-answer-${i}">Deine finnische Übersetzung</label><textarea id="cr-answer-${i}" name="answer-${i}" data-answer="${i}" required maxlength="2000" rows="2" lang="fi">${esc(answers[i]||'')}</textarea>`:own?`<p lang="fi">Deine Antwort: ${esc(own.answers[i])}</p>`:''}${isCreator||own||a.released?`<p lang="fi"><strong>${s.origin==='teacher_created'?'Richtige Lösung':'Finnische Vorlage'}:</strong> ${esc(s.text)}</p>`:''}${sources(s)}</div></article>`).join('')}${canSubmit?'<p class="cr-note">Abgabe ist verbindlich. Entwürfe bleiben nur in dieser geöffneten Seite erhalten und gehen beim Neuladen verloren.</p><button class="primary">Alle Antworten verbindlich abgeben</button></form>':`<p>${own?'Deine Antworten sind gespeichert.':isCreator?'Hier siehst du die eingereichten Antworten.':'Abgabe ist geschlossen.'}</p>`}
 ${showOverview||a.released?`<div class="cr-assignment-section-title"><span aria-hidden="true">✓</span><div><span class="cr-assignment-language">Auswertung</span><h3>${room.teacher?'Abgabenübersicht':'Gemeinsamer Lösungsvergleich'}</h3></div></div>${room.teacher?`<p>Noch ohne Abgabe: ${room.members.filter(m=>m.role!=='teacher'&&!m.blocked&&!a.submissions.some(s=>s.author_id===m.id)).map(m=>esc(m.name)).join(', ')||'niemand'}</p>`:''}${a.submissions.map((s,i)=>`<article class="cr-card cr-submission-card"><h4>${room.teacher?esc(s.author):s.own?'Deine Lösung':`Lösung ${i+1}`}</h4>${s.answers.map((v,j)=>`<p><strong>${j+1}.</strong> <span lang="fi">${esc(v)}</span></p>`).join('')}${a.released&&!room.archived?`<div class="cr-toolbar">${Object.entries({helpful:'Hilfreich',interesting:'Interessant',encouraging:'Gut gemacht'}).map(([k,label])=>b(`${label} · ${s.reactions[k]||0}`,'react',`data-id="${s.id}" data-kind="${k}"`)).join('')}</div>`:''}</article>`).join('')||'<p>Noch keine Abgaben.</p>'}`:'<p>Der gemeinsame Lösungsvergleich wird von der Lehrkraft freigegeben.</p>'}
 <div class="cr-assignment-section-title cr-discussion-title"><span aria-hidden="true">?</span><div><span class="cr-assignment-language">Gemeinsam klären</span><h3>Fragen &amp; Austausch</h3></div></div><p class="cr-note cr-discussion-note">Für alle im Raum sichtbar, mit deinem Klassenraumnamen. Keine persönlichen Daten posten. Die Lehrkraft kann Beiträge entfernen.</p>${discussion(a)}${!room.archived?`<form data-cr-form="message" class="cr-card"><h4>Neue Diskussion starten</h4><label>Zu welchem Satz?<select name="item_index">${a.items.map((s,i)=>`<option value="${i}">${i+1}. ${esc(s.translations[0].text)}</option>`).join('')}</select></label><label>Frage oder Diskussionsbeitrag<textarea name="body" required maxlength="1500" rows="3"></textarea></label><button class="primary">Beitrag senden</button></form>`:''}`;
}
function discussion(a){
 const messages=a.messages.filter(m=>!m.deleted);
 if(!messages.length)return '<p>Noch keine Fragen – starte eine Diskussion zu einem Satz.</p>';
 const ids=new Set(messages.map(m=>m.id)),children=new Map();
 for(const m of messages){
   const parent=m.parent_id&&ids.has(m.parent_id)?m.parent_id:null;
   if(!children.has(parent))children.set(parent,[]);children.get(parent).push(m);
 }
 const seen=new Set();
 function render(parent,depth=0){
   return (children.get(parent)||[]).map(m=>{
     if(seen.has(m.id))return '';seen.add(m.id);
     const parentMessage=messages.find(x=>x.id===m.parent_id);
     return `<li class="cr-thread-node"><article class="cr-message" id="cr-message-${m.id}" data-message-id="${m.id}"><div class="cr-message-meta"><strong>${esc(m.author)}</strong>${m.teacher?' · Lehrkraft':''} · Satz ${m.item_index+1}${m.created_at?` · <time datetime="${esc(m.created_at)}">${esc(date(m.created_at))}</time>`:''}</div>${parentMessage?`<small class="cr-note">Antwort an ${esc(parentMessage.author)}</small>`:''}<p>${esc(m.body)}</p><div class="cr-toolbar">${!room.archived?b('Antworten','reply',`data-id="${m.id}"`):''}${(room.teacher||m.own)&&!room.archived?b('Beitrag entfernen','delete_message',`data-id="${m.id}"`):''}</div><div id="cr-reply-${m.id}"></div></article>${children.has(m.id)?`<ul class="cr-replies ${depth>=3?'cr-replies-deep':''}" aria-label="Antworten auf den Beitrag von ${esc(m.author)}">${render(m.id,depth+1)}</ul>`:''}</li>`;
   }).join('');
 }
 return `<ul class="cr-discussions" aria-label="Diskussionen">${render(null)}</ul>`;
}
async function refreshAssignment(){const id=selected;room=await api('room',{room_id:room.id});assignment(id);}
function canNavigate(){return !dirty||confirm('Ungespeicherte Eingaben verlassen? Antwortentwürfe bleiben bis zum Neuladen dieser Seite erhalten.');}
function openClassrooms(){
 document.querySelectorAll('.app-view').forEach(view=>{view.hidden=true;});
 $('classrooms-view').hidden=false;
 document.querySelectorAll('.header-nav [data-view]').forEach(item=>{const active=item===button;item.classList.toggle('selected',active);if(active)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
 window.scrollTo?.({top:0,behavior:'smooth'});
 run(home);
}
button.onclick=openClassrooms;
$('classrooms-refresh').onclick=()=>{if(room&&canNavigate())run(()=>open(room.id));};
$('classrooms-content').addEventListener('input',e=>{
 dirty=true;
 if(e.target.closest('[data-cr-form=stream_post]'))saveStreamDraft();
 if(e.target.matches('[data-stream-reply]'))replyDrafts.set('stream-'+e.target.dataset.streamReply,e.target.value);
 if(e.target.matches('[data-answer]')){const v=drafts.get(selected)||[];v[Number(e.target.dataset.answer)]=e.target.value;drafts.set(selected,v);}
 if(e.target.matches('[data-reply-id]'))replyDrafts.set(e.target.dataset.replyId,e.target.value);
 if(e.target.matches('[data-custom-field]'))customItems[Number(e.target.dataset.customIndex)][e.target.dataset.customField]=e.target.value;
});
$('classrooms-content').addEventListener('change',e=>{
 if(e.target.closest('[data-cr-form=stream_post]'))saveStreamDraft();
 if(e.target.id==='cr-level'){renderTopicOptions();picker();}
 if(e.target.id==='cr-topic')picker();
 if(e.target.matches('[data-sentence]')){const id=Number(e.target.dataset.sentence);if(e.target.checked){if(selectionSize()>=20){e.target.checked=false;status('Maximal 20 Sätze pro Aufgabe.',true);return;}selected.set(id,deck.find(s=>s.id===id));}else selected.delete(id);updateSelectionCount();}
});
$('classrooms-content').addEventListener('click',e=>{
 const el=e.target.closest('[data-cr]');if(!el)return;
 const action=el.dataset.cr;
 run(async()=>{
   if(['home','back','refresh','refresh_assignment','assignment'].includes(action)&&!canNavigate())return;
   if(action.startsWith('stream_'))return streamAction(action,el);
   if(action==='login'){$('account-button').click();return;}
   if(action==='home')return home();if(action==='open')return open(el.dataset.id);
   if(action==='back'||action==='refresh')return open(room.id);
   if(action==='assignment')return assignment(el.dataset.id);
   if(action==='refresh_assignment')return refreshAssignment();
   if(action==='new_assignment')return composer();
   if(action==='tab_custom')return setComposerTab('custom');
   if(action==='tab_existing')return setComposerTab('existing');
   if(action==='add_custom'){
     if(selectionSize()>=20)throw new Error('Maximal 20 Sätze pro Aufgabe.');
     if(customItems.length>=20)throw new Error('Bitte zuerst einen nicht benötigten Satz entfernen.');
     customItems.push({de:'',fi:'',added:false});renderCustomItems();updateSelectionCount();
     const panel=el.closest('[role=tabpanel]');panel?.querySelector('[data-custom-host]')?.lastElementChild?.querySelector('textarea')?.focus();return;
   }
   if(action==='confirm_custom'){
     const index=Number(el.dataset.index),item=customItems[index];if(!item)throw new Error('Satz nicht gefunden.');
     if(item.added)return;
     if(!item.de.trim()||!item.fi.trim())throw new Error('Bitte zuerst den deutschen Satz und die richtige finnische Übersetzung eingeben.');
     if(selectionSize()>=20)throw new Error('Maximal 20 Sätze pro Aufgabe.');
     const panel=el.closest('[role=tabpanel]');
     item.de=item.de.trim();item.fi=item.fi.trim();item.added=true;dirty=true;
     const next=customItems[index+1];
     if(selectionSize()<20&&customItems.length<20&&(!next||next.added||next.de.trim()||next.fi.trim()))customItems.splice(index+1,0,{de:'',fi:'',added:false});
     renderCustomItems();updateSelectionCount();
     panel?.querySelector('[data-custom-index="'+(index+1)+'"][data-custom-field="de"]')?.focus();return;
   }
   if(action==='edit_custom'){
     const index=Number(el.dataset.index),item=customItems[index];if(!item)return;
     const panel=el.closest('[role=tabpanel]');item.added=false;dirty=true;renderCustomItems();updateSelectionCount();
     panel?.querySelector('[data-custom-index="'+index+'"][data-custom-field="de"]')?.focus();return;
   }
   if(action==='remove_custom'){
     customItems.splice(Number(el.dataset.index),1);renderCustomItems();updateSelectionCount();return;
   }
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
   if(action==='set_role'){
     const member=room.members.find(m=>m.id===el.dataset.id);
     if(!room.owner||!member||member.owner||member.blocked||room.archived)throw new Error('Diese Rolle kann gerade nicht geändert werden.');
     const promote=el.dataset.role==='teacher';
     if(!confirm(promote?`${member.name} zur Lehrkraft machen? Diese Person kann in diesem Raum Aufgaben erstellen, Abgaben einsehen und Beiträge betreuen.`:`${member.name} die Lehrkraftrolle entziehen? Die Person bleibt als Teilnehmer im Raum.`))return;
     await api('set_role',{room_id:room.id,user_id:member.id,role:promote?'teacher':'student'});
     await open(room.id);return;
   }
   if(action==='cancel_name'){el.closest('form').reset();el.closest('details').open=false;dirty=false;return;}
   if(action==='copy'){await navigator.clipboard.writeText(room.code);el.textContent='Kopiert ✓';return;}
   if(['rotate','archive','remove','leave','release','delete_message'].includes(action)&&!confirm({rotate:'Bisherigen Einladungscode ungültig machen?',archive:'Raum archivieren? Er bleibt lesbar, neue Beiträge und Beitritte werden geschlossen.',remove:'Dieses Mitglied entfernen und erneuten Beitritt sperren?',leave:'Raum verlassen? Deine bisherigen Beiträge und Abgaben bleiben im Raum.',release:'Alle Abgaben schließen und Antworten für die Klasse freigeben?',delete_message:'Den Inhalt dieses Beitrags entfernen? Antworten darauf bleiben erhalten.'}[action]))return;
   await api(action,{room_id:room.id,assignment_id:typeof selected==='string'?selected:null,user_id:el.dataset.id,submission_id:el.dataset.id,message_id:el.dataset.id,kind:el.dataset.kind});
   if(action==='leave'){streamDrafts.delete(room.id);return home();}
   if(['release','react','delete_message'].includes(action))return refreshAssignment();
   return open(room.id);
 });
});
$('classrooms-content').addEventListener('submit',e=>{
 const form=e.target;e.preventDefault();const data=new FormData(form),action=form.dataset.crForm;
 run(async()=>{
   if(action==='stream_post'||action==='stream_reply')return sendStream(form,data,action);
   let payload=Object.fromEntries(data);
   if(['create','join','rename'].includes(action)){
     payload.display_name=String(data.get('display_name')||'').trim();
     if(!payload.display_name||[...payload.display_name].length>80)throw new Error('Bitte deinen Namen für diesen Klassenraum eingeben (1–80 Zeichen).');
   }
   if(action==='assign'){
     if(!selectionSize())throw new Error('Bitte mindestens einen Satz auswählen oder erstellen.');
     if(selectionSize()>20)throw new Error('Maximal 20 Sätze pro Aufgabe.');
     const teacher=room.members.find(m=>m.own)?.name||'Lehrkraft';
     const own=addedCustomItems().map((item,i)=>{
       const de=item.de.trim(),fi=item.fi.trim();
       if(!de||!fi)throw new Error(`Bitte deutschen Satz und finnische Lösung für eigenen Satz ${i+1} eingeben.`);
       const uid=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${i}`;
       return {id:`teacher-${uid}`,lang:'fin',text:fi,owner:teacher,origin:'teacher_created',translations:[{id:`teacher-de-${uid}`,lang:'deu',text:de,owner:teacher,origin:'teacher_created'}],audios:[]};
     });
     payload={title:data.get('title'),items:[...selected.values(),...own],due_at:data.get('due')?new Date(data.get('due')).toISOString():null};
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
   if(action==='delete_room'){streamDrafts.delete(room.id);for(const a of room.assignments)drafts.delete(a.id);await home();$('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Klassenraum und zugehörige Inhalte wurden endgültig gelöscht.</p>');return;}
   if(action==='rename'){await open(room.id);$('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Dein Name wurde für diesen Klassenraum geändert.</p>');return;}
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

// Feed drafts and downloaded attachments stay in memory only.
let stream={posts:[],has_more:false},streamFilter='all';
const streamDrafts=new Map(),attachmentURLs=new Set();
const fileTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',pdf:'application/pdf',txt:'text/plain',csv:'text/csv',zip:'application/zip',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'};
const streamPosts=()=>Array.isArray(stream.posts)?stream.posts:[];
const fileSize=n=>n<1048576?`${Math.ceil(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
function richText(value){return String(value??'').split(/(https?:\/\/[^\s<>]+)/g).map(part=>/^https?:\/\//.test(part)?`<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`:esc(part)).join('');}
function streamComposer(){return `<details class="cr-card cr-stream-compose" id="cr-stream-compose"><summary><span><strong>Was möchtest du mit der Klasse teilen?</strong><small class="cr-compose-closed">Frage oder Beitrag erstellen · Aufklappen</small><small class="cr-compose-open">Beitragsbox einklappen</small></span></summary><form data-cr-form="stream_post"><label>Beitragsart<select name="kind"><option value="question">Frage stellen</option><option value="post">Beitrag teilen</option>${room.teacher?'<option value="announcement">Ankündigung</option>':''}</select></label><label class="cr-compose-label">Dein Text<textarea name="body" required maxlength="3000" rows="3" placeholder="Eine Frage, ein Gedanke oder etwas Hilfreiches …"></textarea></label><div class="cr-toolbar"><label class="cr-file-picker">＋ Bilder &amp; Dateien<input type="file" name="files" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx"></label><button class="primary">Veröffentlichen →</button></div><p class="cr-note">Bis zu 3 Dateien, je 10 MB · nur für diese Klasse sichtbar</p><div id="cr-draft-files" aria-live="polite"></div></form></details>`;}
function saveStreamDraft(){
 const form=document.querySelector('[data-cr-form=stream_post]');if(!form||!room)return;
 const draft=streamDrafts.get(room.id)||{files:[],id:crypto.randomUUID()};draft.body=form.elements.body.value;draft.kind=form.elements.kind.value;
 const input=form.elements.files;
 if(input.files?.length){
  const picked=[...input.files];
  const invalid=picked.find(f=>!fileTypes[f.name.split('.').pop().toLowerCase()]||f.size<1||f.size>10485760||f.name.length>180);
  if(invalid)status('Bitte PNG, JPG, WebP, PDF, Text, CSV, ZIP oder Office-Dateien mit höchstens 10 MB auswählen.',true);
  else if(draft.files.length+picked.length>3)status('Maximal drei Anhänge pro Beitrag.',true);
  else draft.files.push(...picked.map(file=>({file,mime:fileTypes[file.name.split('.').pop().toLowerCase()]})));
  input.value='';
 }
 streamDrafts.set(room.id,draft);renderDraftFiles(draft);
}
function renderDraftFiles(draft){if($('cr-draft-files'))$('cr-draft-files').innerHTML=draft.files.map((f,i)=>`<div class="cr-attachment"><span>${esc(f.file.name)} · ${fileSize(f.file.size)}${f.uploaded?' · Hochgeladen ✓':''}</span>${b('Entfernen','stream_remove_file',`data-index="${i}"`)}</div>`).join('');}
function restoreStreamDraft(){
 const draft=streamDrafts.get(room.id),form=document.querySelector('[data-cr-form=stream_post]');if(!draft||!form)return;
 form.elements.body.value=draft.body||'';form.elements.kind.value=draft.kind||'question';renderDraftFiles(draft);
 dirty=!!(draft.body||draft.files.length);
}
function upcomingAssignments(){
 const items=room.assignments.filter(a=>!a.released&&(!a.due_at||new Date(a.due_at)>=new Date())).sort((a,b)=>(a.due_at||'9999').localeCompare(b.due_at||'9999')).slice(0,4);
 return items.map(a=>`<div class="cr-upcoming"><strong>${esc(a.title)}</strong><p class="cr-note">${esc(date(a.due_at))}</p>${b('Zur Aufgabe →','assignment',`data-id="${a.id}"`)}</div>`).join('')||'<p>Im Moment steht keine Aufgabe an.</p>';
}
function renderFeed(){
 const preview=$('cr-image-dialog');if(preview?.open)preview.close();
 for(const url of attachmentURLs)URL.revokeObjectURL(url);attachmentURLs.clear();
 const entries=[...streamPosts(),...room.assignments.map(a=>({...a,kind:'assignment',created_at:stream.assignment_dates?.[a.id]}))]
 .filter(p=>(p.kind==='assignment'||!p.deleted)&&(streamFilter==='all'||p.kind===streamFilter)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||String(b.id).localeCompare(String(a.id)));
 $('cr-stream-feed').innerHTML=entries.map(p=>{
  if(p.kind==='assignment')return `<article class="cr-card cr-feed-card cr-feed-assignment"><span class="cr-feed-type">NEUE AUFGABE</span>${p.created_at?`<time>${esc(date(p.created_at))}</time>`:''}<h3>${esc(p.title)}</h3><p>${p.items.length} Sätze · ${esc(date(p.due_at))}</p><div class="cr-toolbar">${b('Aufgabe öffnen →','assignment',`data-id="${p.id}"`)}<span class="cr-state">${p.released?'Vergleich freigegeben':p.submissions.some(s=>s.own)?'Abgegeben':p.due_at&&new Date(p.due_at)<new Date()?'Frist abgelaufen':'Offen'}</span></div></article>`;
  const writable=!room.archived&&!p.deleted;
  return `<article class="cr-card cr-feed-card cr-feed-${p.kind}" id="cr-post-${p.id}"><div class="cr-feed-meta"><span class="cr-feed-type">${p.pinned?'ANGEHEFTET · ':''}${{question:'FRAGE',post:'BEITRAG',announcement:'ANKÜNDIGUNG'}[p.kind]||'BEITRAG'}</span>${p.kind==='question'&&!p.deleted?`<span class="cr-state ${p.resolved?'cr-resolved':''}">${p.resolved?'✓ Beantwortet':'Offen'}</span>`:''}</div><div class="cr-author"><strong>${esc(p.author)}</strong>${p.teacher?' · Lehrkraft':''} <time datetime="${esc(p.created_at)}">${esc(date(p.created_at))}</time></div><p class="cr-post-body">${richText(p.body)}</p>
 ${!p.deleted?(p.files||[]).map(f=>f.mime.startsWith('image/')?`<div class="cr-attachment cr-image-attachment" data-attachment="${f.id}"><button type="button" class="cr-image-thumb" data-cr="stream_preview" data-id="${f.id}" aria-label="Bild vergrößern"><span>Vorschau wird geladen …</span></button>${b('Herunterladen','stream_download',`data-id="${f.id}"`)}</div>`:`<div class="cr-attachment" data-attachment="${f.id}"><div><strong>${esc(f.name)}</strong><small>${fileSize(f.size)}</small></div>${b('Herunterladen','stream_download',`data-id="${f.id}"`)}</div>`).join(''):''}
 <div class="cr-toolbar">${writable?b('Antworten','stream_reply',`data-id="${p.id}"`):''}${writable&&p.kind==='question'&&(room.teacher||p.own)?b(p.resolved?'Wieder öffnen':'Als beantwortet markieren','stream_resolve',`data-id="${p.id}" data-value="${!p.resolved}"`):''}${writable&&room.teacher?b(p.pinned?'Lösen':'Anpinnen','stream_pin',`data-id="${p.id}" data-value="${!p.pinned}"`):''}${writable&&(room.teacher||p.own)?b('Entfernen','stream_delete',`data-id="${p.id}"`):''}</div>
 ${(p.replies||[]).length?`<details class="cr-feed-replies"><summary>${p.replies.length} ${p.replies.length===1?'Antwort':'Antworten'}</summary>${renderStreamReplies(p)}</details>`:''}<div id="cr-stream-reply-${p.id}"></div></article>`;
 }).join('')||'<div class="cr-card"><h3>Hier beginnt euer Austausch.</h3><p>Noch keine Beiträge in dieser Ansicht. Stellt eine Frage oder teilt etwas mit der Klasse.</p></div>';
 loadImageThumbs();
}
const attachmentFile=id=>streamPosts().flatMap(p=>p.files||[]).find(f=>f.id===id);
async function loadImageThumb(button,file){
 const response=await accountRequest('/storage/v1/object/authenticated/classroom-stream/'+encodeURIComponent(file.id));
 if(!response.ok)throw new Error('Vorschau nicht verfügbar.');
 const raw=await response.blob();if(!button.isConnected)return;
 const url=URL.createObjectURL(new Blob([raw],{type:file.mime}));attachmentURLs.add(url);
 const img=document.createElement('img');img.src=url;img.alt='Angehängtes Bild';img.loading='lazy';button.replaceChildren(img);
}
function loadImageThumbs(){
 document.querySelectorAll('.cr-image-thumb[data-id]').forEach(button=>{const file=attachmentFile(button.dataset.id);if(!file)return;loadImageThumb(button,file).catch(()=>{if(button.isConnected)button.innerHTML='<span>Vorschau nicht verfügbar</span>';});});
}
function showImagePreview(url){
 let dialog=$('cr-image-dialog');
 if(!dialog){
  document.body.insertAdjacentHTML('beforeend','<dialog id="cr-image-dialog" class="cr-image-dialog" aria-label="Bildansicht"><button type="button" class="cr-image-dialog-close" aria-label="Bildansicht schließen">✕</button><img alt="Angehängtes Bild"></dialog>');dialog=$('cr-image-dialog');
  dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});dialog.addEventListener('close',()=>dialog.querySelector('img').removeAttribute('src'));
 }
 dialog.querySelector('img').src=url;dialog.showModal();
}
function renderStreamReplies(post){
 const replies=(post.replies||[]).filter(m=>!m.deleted),byId=new Map(replies.map(m=>[m.id,m])),children=new Map(),seen=new Set();
 for(const m of replies){const target=byId.has(m.reply_to_id)?m.reply_to_id:null;if(!children.has(target))children.set(target,[]);children.get(target).push(m);}
 function render(target,depth=0){return (children.get(target)||[]).map(m=>{
  if(seen.has(m.id))return '';seen.add(m.id);
  const parent=byId.get(m.reply_to_id);
  return `<div class="cr-stream-thread"><article class="cr-message" id="cr-stream-message-${m.id}"><div class="cr-author"><strong>${esc(m.author)}</strong>${m.teacher?' · Lehrkraft':''}<time>${esc(date(m.created_at))}</time></div>${parent?`<small class="cr-note">Antwort an ${esc(parent.author)}</small>`:''}<p>${richText(m.body)}</p><div class="cr-toolbar">${!room.archived?b('Antworten','stream_reply',`data-id="${m.id}"`):''}${!room.archived&&(room.teacher||m.own)?b('Entfernen','stream_delete',`data-id="${m.id}"`):''}</div><div id="cr-stream-reply-${m.id}"></div></article>${children.has(m.id)?`<div class="cr-stream-children ${depth>=2?'cr-stream-children-flat':''}">${render(m.id,depth+1)}</div>`:''}</div>`;
 }).join('');}
 return render(null);
}
async function reloadStream(){stream=await api('stream_list',{room_id:room.id});renderRoom();}
async function streamAction(action,el){
 const id=el.dataset.id;
 if(action==='stream_filter'){
  streamFilter=el.dataset.filter;document.querySelectorAll('[data-cr=stream_filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===el)));renderFeed();return;
 }
 if(action==='stream_more'){
  const next=await api('stream_list',{room_id:room.id,offset:streamPosts().length});
  stream={...next,posts:[...new Map([...streamPosts(),...next.posts].map(p=>[p.id,p])).values()]};renderFeed();if(!stream.has_more)el.remove();return;
 }
 if(action==='stream_reply'){
  const target=streamPosts().flatMap(p=>[p,...(p.replies||[])]).find(p=>p.id===id);
  if(!target||target.deleted||room.archived)throw new Error('Auf diesen Beitrag kann gerade nicht geantwortet werden.');
  const slot=$('cr-stream-reply-'+id);
  if(!slot.querySelector('form'))slot.innerHTML=`<form data-cr-form="stream_reply" class="cr-reply-form"><input type="hidden" name="post_id" value="${id}"><input type="hidden" name="request_id" value="${crypto.randomUUID()}"><label>Antwort an ${esc(target.author)}<textarea name="body" data-stream-reply="${id}" required maxlength="3000" rows="3">${esc(replyDrafts.get('stream-'+id)||'')}</textarea></label><div class="cr-toolbar"><button class="primary">Antwort senden</button>${b('Abbrechen','stream_cancel_reply',`data-id="${id}"`)}</div></form>`;
  slot.querySelector('textarea').focus();return;
 }
 if(action==='stream_cancel_reply'){$('cr-stream-reply-'+id).innerHTML='';return;}
 if(action==='stream_remove_file'){
  const draft=streamDrafts.get(room.id),i=Number(el.dataset.index),f=draft.files[i];
  if(f.id){
   if(f.uploaded){const res=await accountRequest('/storage/v1/object/classroom-stream',{method:'DELETE',body:JSON.stringify({prefixes:[f.id]})});if(!res.ok)throw new Error('Anhang konnte nicht entfernt werden. Bitte erneut versuchen.');}
   await api('stream_discard',{room_id:room.id,file_id:f.id});
  }
  draft.files.splice(i,1);renderDraftFiles(draft);return;
 }
 if(action==='stream_download'||action==='stream_preview'){
  const file=attachmentFile(id);if(!file)throw new Error('Anhang nicht gefunden.');
  if(action==='stream_preview'){
   const image=el.querySelector('img');if(image?.src){showImagePreview(image.src);return;}
  }
  const response=await accountRequest('/storage/v1/object/authenticated/classroom-stream/'+encodeURIComponent(id));
  if(!response.ok)throw new Error('Die Datei konnte nicht geladen werden. Bitte aktualisieren und erneut versuchen.');
  const raw=await response.blob(),blob=new Blob([raw],{type:action==='stream_preview'?file.mime:'application/octet-stream'}),url=URL.createObjectURL(blob);attachmentURLs.add(url);
  if(action==='stream_preview')showImagePreview(url);
  else{const a=document.createElement('a');a.href=url;a.download=file.name;document.body.append(a);a.click();a.remove();}
  return;
 }
 if(action==='stream_delete'&&!confirm('Beitrag entfernen? Antworten bleiben erhalten.'))return;
 if(!['stream_resolve','stream_pin','stream_delete'].includes(action))return;
 await api(action,{room_id:room.id,post_id:id,resolved:el.dataset.value==='true',pinned:el.dataset.value==='true'});await reloadStream();
}
async function sendStream(form,data,action){
 if(action==='stream_reply'){
  const root=streamPosts().find(p=>p.id===data.get('post_id')||(p.replies||[]).some(m=>m.id===data.get('post_id')));
  await api(action,{room_id:room.id,post_id:data.get('post_id'),request_id:data.get('request_id'),body:String(data.get('body')||'').trim()});
  replyDrafts.delete('stream-'+data.get('post_id'));await reloadStream();
  const post=$('cr-post-'+(root?.id||data.get('post_id')));if(post){const replies=post.querySelector('details');if(replies)replies.open=true;post.scrollIntoView?.({block:'nearest'});}return;
 }
 saveStreamDraft();const draft=streamDrafts.get(room.id);
 if(!draft.body?.trim())throw new Error('Bitte einen Text zu deinem Beitrag eingeben.');
 for(const f of draft.files){
  if(!f.id){const reserved=await api('stream_reserve',{room_id:room.id,name:f.file.name,mime:f.mime,size:f.file.size});f.id=reserved.id;}
  if(!f.uploaded){
   status('Anhang wird hochgeladen: '+f.file.name);
   const response=await accountRequest('/storage/v1/object/classroom-stream/'+encodeURIComponent(f.id),{method:'POST',headers:{'Content-Type':f.mime,'x-upsert':'false'},body:f.file});
   if(!response.ok){
    // A previous upload may have succeeded while its response was lost.
    const existing=await accountRequest('/storage/v1/object/authenticated/classroom-stream/'+encodeURIComponent(f.id));
    if(!existing.ok||(await existing.blob()).size!==f.file.size)throw new Error('Upload fehlgeschlagen. Dein Entwurf bleibt erhalten; bitte erneut versuchen.');
   }
   f.uploaded=true;renderDraftFiles(draft);
  }
 }
 const value=await api('stream_post',{room_id:room.id,request_id:draft.id,kind:draft.kind,body:draft.body.trim(),file_ids:draft.files.map(f=>f.id)});
 streamDrafts.delete(room.id);dirty=false;streamFilter='all';await reloadStream();$('cr-post-'+value.id)?.scrollIntoView?.({block:'nearest'});
}
