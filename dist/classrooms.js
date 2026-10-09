import {uiLocale} from './i18n.mjs?v=26';
import {accountUser,accountRequest} from './auth.js?v=128';
import {avatarMarkup,cleanNickname} from './avatars.mjs?v=2';
import {GRAMMAR_TOPICS,topicNotes} from './grammar-topics.mjs';
import {translationFeedbackMarkup,compareTranslation} from './translation-feedback.mjs?v=1';
import {loadLexicon} from './word-lookup.mjs?v=2';
import {VERBS} from './verbs-data.mjs';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $=id=>document.getElementById(id);
const date=v=>v?new Date(v).toLocaleString(uiLocale,{dateStyle:'short',timeStyle:'short'}):'Ohne Abgabetermin';
let room=null,selected=null,deck=null,grammar=null,customItems=[],busy=false,dirty=false;
let classroomHidden=new Map(),globalQuality={sentence_ids:[],translations:[]};
const replyDrafts=new Map();
// Answer drafts stay on this device (localStorage, one entry per account) until
// they are submitted; they never go to the server or the service-worker cache.
const drafts=new Map(),draftTimes=new Map(),DRAFT_KEY='vanamo-classroom-drafts:';
function loadDrafts(){
 drafts.clear();draftTimes.clear();
 const id=accountUser()?.id;if(!id)return;
 try{
  const saved=JSON.parse(localStorage.getItem(DRAFT_KEY+id)||'{}'),oldest=Date.now()-60*864e5;
  for(const [aid,d] of Object.entries(saved&&typeof saved==='object'?saved:{})){
   if(!d||!Array.isArray(d.answers)||!(d.at>oldest))continue;
   drafts.set(aid,d.answers.slice(0,20).map(v=>String(v||'').slice(0,2000)));draftTimes.set(aid,d.at);
  }
 }catch{}
}
function storeDrafts(){
 const id=accountUser()?.id;if(!id)return;
 try{
  const kept=[...drafts].filter(([,answers])=>answers.some(v=>v&&v.trim())).sort((x,y)=>(draftTimes.get(y[0])||0)-(draftTimes.get(x[0])||0)).slice(0,40);
  if(!kept.length)return localStorage.removeItem(DRAFT_KEY+id);
  localStorage.setItem(DRAFT_KEY+id,JSON.stringify(Object.fromEntries(kept.map(([aid,answers])=>[aid,{answers,at:draftTimes.get(aid)||Date.now()}]))));
 }catch{}
}
function dropDraft(id){if(drafts.delete(id)){draftTimes.delete(id);storeDrafts();}}
let editItems=[],lexiconReady=false;
// Translation direction of an assignment; packages from before this choice are German → Finnish.
const DIRECTIONS={'de-fi':'Deutsch → Finnisch','fi-de':'Finnisch → Deutsch',cloze:'Lückentext',verbs:'Verbformen'};
const directionOf=a=>DIRECTIONS[a.direction]?a.direction:'de-fi';
// While an assignment is being put together: the sentence the class will see stands first.
const composingFiDe=()=>document.querySelector('[data-cr-form=assign] [name=direction]')?.value==='fi-de';
const directionSelect=value=>`<label>Richtung<select name="direction">${['de-fi','fi-de'].map(key=>`<option value="${key}"${key===value?' selected':''}>${DIRECTIONS[key]}</option>`).join('')}</select></label>`;
const TYPE_HINTS={'de-fi':'Die Klasse sieht den deutschen Satz und übersetzt ihn ins Finnische.','fi-de':'Die Klasse sieht den finnischen Satz und übersetzt ihn ins Deutsche.',cloze:'Die Klasse sieht den finnischen Satz mit einer Lücke und ergänzt das fehlende Wort. Du wählst unten, welches Wort fehlt.',verbs:'Die Klasse bildet zu Verb und Person die Präsensform. Du wählst Verben und Personen.'};
// Lückentext and Verbformen have exactly one right answer per entry, so they are checked.
const isExact=a=>['cloze','verbs'].includes(directionOf(a));
const PRONOUNS=['minä','sinä','hän','me','te','he'];
const wordsOf=text=>String(text??'').split(/\s+/u).filter(Boolean);
const bare=word=>String(word??'').normalize('NFC').replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu,'');
const fold=word=>bare(word).toLocaleLowerCase('fi').replace(/\s+/g,' ');
const defaultGap=text=>{const list=wordsOf(text).map(bare);let best=0;list.forEach((w,i)=>{if([...w].length>[...list[best]].length)best=i;});return best;};
const gapIndex=s=>{const n=wordsOf(s.text).length;return Number.isInteger(s.gap)&&s.gap>=0&&s.gap<n?s.gap:defaultGap(s.text);};
const solutionOf=(a,s)=>directionOf(a)==='cloze'?bare(wordsOf(s.text)[gapIndex(s)]):s.text;
const isRight=(a,s,answer)=>fold(answer)===fold(solutionOf(a,s))||(directionOf(a)==='verbs'&&fold(answer)===fold(`${PRONOUNS[s.person]} ${s.text}`));
const gapSentence=(s,shown)=>wordsOf(s.text).map((w,i)=>i===gapIndex(s)?(shown?`<strong class="cr-gap-filled">${esc(w)}</strong>`:`<span class="cr-gap" aria-label="Lücke">${esc(w.slice(0,w.indexOf(bare(w))))}_____${esc(w.slice(w.indexOf(bare(w))+bare(w).length))}</span>`):esc(w)).join(' ');
const itemLabel=(a,s)=>{const type=directionOf(a);return type==='verbs'?`${s.lemma} · ${PRONOUNS[s.person]}`:type==='fi-de'?s.text:s.translations[0].text;};
const scoreOf=(a,answers)=>a.items.filter((s,i)=>isRight(a,s,answers?.[i])).length;
const verdict=(a,s,answer)=>isRight(a,s,answer)?'<p class="cr-verdict cr-verdict-right">✓ Richtig</p>':`<p class="cr-verdict cr-verdict-wrong">✗ Richtig ist: <strong lang="fi">${esc(solutionOf(a,s))}</strong></p>`;
function exactItem(a,s,i,{canSubmit,own,answers,reveal}){
 const verbs=directionOf(a)==='verbs';
 const prompt=verbs?`<span class="cr-assignment-language">Verbform im Präsens</span><h3><span lang="fi">${esc(s.lemma)}</span> · <span lang="fi">${PRONOUNS[s.person]}</span></h3><p class="cr-prompt-help" lang="de">${esc(s.translations[0].text)}</p>`
  :`<span class="cr-assignment-language">Lückentext</span><h3 lang="fi">${gapSentence(s,false)}</h3><p class="cr-prompt-help" lang="de">${esc(s.translations[0].text)}${sentenceSourceIcon(s.translations[0])}</p>`;
 const field=canSubmit?`<label for="cr-answer-${i}">${verbs?'Die passende Form':'Das fehlende Wort'}</label><input id="cr-answer-${i}" name="answer-${i}" data-answer="${i}" required maxlength="80" lang="fi" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(answers[i]||'')}">`:own?`<p lang="fi">Deine Antwort: ${esc(own.answers[i])}</p>`:'';
 const solution=reveal?`<p lang="fi"><strong>Lösung:</strong> ${verbs?`${PRONOUNS[s.person]} <strong class="cr-gap-filled">${esc(s.text)}</strong>`:gapSentence(s,true)}</p>`:'';
 return prompt+field+solution+(own?verdict(a,s,own.answers[i])+teacherNote(own,i):'');
}
// What is new: `list` reports the newest thing somebody else did in each room and
// how far this account has already looked (`seen`, shared by all its devices). The
// device keeps a copy (localStorage) for offline use and older servers, and marks
// the rest – a number on the header button, "Neu" on rooms, posts and tasks.
const SEEN_KEY='vanamo-classroom-seen:';
let newSince=null,roomList=null,lastNewsCheck=0,lastRefresh=0;
const stampOf=v=>Date.parse(v)||0;
function seenMap(){try{const v=JSON.parse(localStorage.getItem(SEEN_KEY+accountUser()?.id)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
function storeSeen(map){const id=accountUser()?.id;if(!id)return;try{localStorage.setItem(SEEN_KEY+id,JSON.stringify(map));}catch{}}
function showNews(count){
 if(count>0){button.dataset.news=String(count);button.title=count===1?'Neues in 1 Klassenraum':`Neues in ${count} Klassenräumen`;}
 else{delete button.dataset.news;button.removeAttribute('title');}
}
// Rooms this device meets for the first time count as seen, so nobody starts with a pile of hints.
function applyNews(rooms){
 roomList=rooms;
 const seen=seenMap(),next={};let count=0;
 for(const r of rooms){
  const local=r.id in seen?seen[r.id]:null,known=r.seen&&stampOf(r.seen)>stampOf(local)?r.seen:local;
  next[r.id]=known===null?(r.activity||''):known;
  r.news=Boolean(r.activity)&&stampOf(r.activity)>stampOf(next[r.id]);
  if(r.news)count++;
 }
 storeSeen(next);showNews(count);
}
async function checkNews(force=false){
 if(!accountUser()){roomList=null;showNews(0);return;}
 if(!force&&Date.now()-lastNewsCheck<60000)return;
 lastNewsCheck=Date.now();
 try{applyNews(await api('list'));}catch{}
}
function markRoomSeen(){
 const stamps=[newSince,roomList?.find(r=>r.id===room.id)?.activity];
 for(const a of room.assignments){stamps.push(a.created_at,stream.assignment_dates?.[a.id]);for(const m of a.messages||[])stamps.push(m.created_at);for(const x of a.submissions||[]){stamps.push(x.created_at);for(const f of x.feedback||[])stamps.push(f.updated_at);}}
 for(const post of stream.posts||[]){stamps.push(post.created_at);for(const reply of post.replies||[])stamps.push(reply.created_at);}
 const latest=stamps.filter(Boolean).sort((x,y)=>stampOf(y)-stampOf(x))[0]||'';
 const seen=seenMap();seen[room.id]=latest;storeSeen(seen);
 // Tell the account, so the other devices do not show the same things as new again.
 const entry=roomList?.find(r=>r.id===room.id);
 if(latest&&stampOf(latest)>stampOf(entry?.seen)){api('seen',{room_id:room.id,at:latest}).catch(()=>{});if(entry)entry.seen=latest;}
 if(roomList)applyNews(roomList);
}
const isNew=v=>newSince!==null&&stampOf(v)>stampOf(newSince);
const postNews=p=>(!p.own&&isNew(p.created_at))||(p.replies||[]).some(reply=>!reply.own&&isNew(reply.created_at));
const assignmentNews=a=>(!a.own_assignment&&isNew(a.created_at||stream.assignment_dates?.[a.id]))||(a.messages||[]).some(m=>!m.own&&isNew(m.created_at))||(a.submissions||[]).some(x=>x.own?(x.feedback||[]).some(f=>isNew(f.updated_at)):Boolean(a.can_manage)&&isNew(x.created_at));
const newPill=on=>on?'<span class="cr-new">Neu</span>':'';
// After handing in: sentences from Vanamo's own stock can go into the personal review plan.
// The teacher's own sentences are not part of that stock and stay in the classroom.
const stockItems=a=>a.items.filter(s=>s.origin!=='teacher_created'&&Number.isInteger(s.id));
function reviewOffer(a){
 const stock=stockItems(a).length,own=a.items.length-stock;
 if(!stock)return '<div class="cr-review-offer"><p class="cr-note">Diese Aufgabe besteht aus eigenen Sätzen der Lehrkraft. Sie lassen sich nicht ins Wiederholen übernehmen.</p></div>';
 return `<div class="cr-review-offer"><h4>Weiterüben</h4><p>${stock===1?'Den vorhandenen Satz dieser Aufgabe kannst du in dein Wiederholen übernehmen.':`Die ${stock} vorhandenen Sätze dieser Aufgabe kannst du in dein Wiederholen übernehmen.`}</p>${b(stock===1?'Satz ins Wiederholen übernehmen':'Sätze ins Wiederholen übernehmen','add_reviews')}<p id="cr-review-result" class="cr-note" role="status"></p>${own?`<p class="cr-note">${own===1?'1 eigener Satz der Lehrkraft bleibt im Klassenraum.':`${own} eigene Sätze der Lehrkraft bleiben im Klassenraum.`}</p>`:''}</div>`;
}
const replyNews=p=>(p.replies||[]).some(reply=>!reply.own&&isNew(reply.created_at));
// Automatic comparison with the template (never a grade) and the teacher's comment per sentence.
const autoFeedback=(answer,s,fiDe=false)=>translationFeedbackMarkup({answer,templates:fiDe?s.translations.map(t=>t.text):[s.text],language:fiDe?'de':'fi',sentenceText:s.text,compact:true})||'<p class="cr-note cr-auto-different">Anders formuliert als die Vorlage – das kann trotzdem richtig sein.</p>';
// Overview for whoever manages the assignment: per sentence, how many answers match
// the template and at which words the class differs most often. Not a grade.
function classOverview(a,fiDe){
 const subs=a.submissions||[];if(subs.length<2)return '';
 if(isExact(a)){
  const rows=a.items.map((s,i)=>{
   let right=0;const wrong=new Map();
   for(const sub of subs){const v=sub.answers?.[i];if(isRight(a,s,v)){right++;continue;}const key=fold(v);wrong.set(key,{text:bare(v)||String(v??''),n:(wrong.get(key)?.n||0)+1});}
   const variants=[...wrong.values()].sort((x,y)=>y.n-x.n).slice(0,3);
   return `<li class="cr-overview-row"><p class="cr-overview-sentence"><strong>${i+1}.</strong> <span lang="fi">${directionOf(a)==='verbs'?esc(itemLabel(a,s)):gapSentence(s,false)}</span></p><p class="cr-overview-tally"><span><strong>${right}</strong> von ${subs.length} richtig</span></p>${variants.length?`<ul class="cr-overview-spots"><li><strong lang="fi">${esc(solutionOf(a,s))}</strong> <span>stattdessen geschrieben</span><span class="cr-overview-variants">${variants.map(v=>`<span lang="fi">${esc(v.text)}</span> ${v.n}×`).join(' · ')}</span></li></ul>`:''}</li>`;
  }).join('');
  return `<details class="cr-card cr-overview" open><summary>Wo die Klasse abweicht</summary><p class="cr-note">Aus ${subs.length} Abgaben.</p><ol class="cr-overview-list">${rows}</ol></details>`;
 }
 const lang=fiDe?'de':'fi',lower=w=>String(w).toLocaleLowerCase(lang);
 const rows=a.items.map((s,i)=>{
  const templates=fiDe?s.translations.map(t=>t.text):[s.text],counts={exact:0,close:0,different:0},spots=new Map();
  for(const sub of subs){
   const r=compareTranslation(sub.answers?.[i],templates,lang);if(!(r.kind in counts))continue;
   counts[r.kind]++;if(r.kind!=='close')continue;
   const seen=new Set();
   for(const d of r.diffs){
    const extra=d.type==='extra',key=(extra?'+':'')+lower(extra?d.typed:d.expected);
    if(seen.has(key))continue;seen.add(key);
    const spot=spots.get(key)||{word:extra?d.typed:d.expected,extra,n:0,missing:0,variants:new Map()};
    spot.n++;if(d.type==='missing')spot.missing++;else if(!extra)spot.variants.set(lower(d.typed),{text:d.typed,n:(spot.variants.get(lower(d.typed))?.n||0)+1});
    spots.set(key,spot);
   }
  }
  const top=[...spots.values()].sort((x,y)=>y.n-x.n||x.word.localeCompare(y.word)).slice(0,3);
  const tally=[[counts.exact,'wie die Vorlage'],[counts.close,'fast wie die Vorlage'],[counts.different,'anders formuliert']].filter(([n])=>n).map(([n,label])=>`<span><strong>${n}</strong> ${label}</span>`).join('');
  return `<li class="cr-overview-row"><p class="cr-overview-sentence"><strong>${i+1}.</strong> <span lang="${fiDe?'fi':'de'}">${esc(fiDe?s.text:s.translations[0].text)}</span></p><p class="cr-overview-tally">${tally||'<span>Noch keine Antworten.</span>'}</p>${top.length?`<ul class="cr-overview-spots">${top.map(spot=>`<li><strong lang="${lang}">${esc(spot.word)}</strong> <span>${spot.extra?`bei ${spot.n} zusätzlich`:`bei ${spot.n} von ${subs.length} anders`}</span>${spot.extra?'':`<span class="cr-overview-variants">${[...[...spot.variants.values()].sort((x,y)=>y.n-x.n).slice(0,3).map(v=>`<span lang="${lang}">${esc(v.text)}</span> ${v.n}×`),...(spot.missing?[`fehlt ${spot.missing}×`]:[])].join(' · ')}</span>`}</li>`).join('')}</ul>`:''}</li>`;
 }).join('');
 return `<details class="cr-card cr-overview" open><summary>Wo die Klasse abweicht</summary><p class="cr-note">Aus ${subs.length} Abgaben. Eine Abweichung von der Vorlage heißt nicht, dass die Antwort falsch ist.</p><ol class="cr-overview-list">${rows}</ol></details>`;
}
const feedbackFor=(submission,i)=>(submission.feedback||[]).find(f=>f.item_index===i);
const teacherNote=(submission,i)=>{const f=feedbackFor(submission,i);return f?`<div class="cr-teacher-note"><strong>Rückmeldung von ${esc(f.author)}</strong><p>${esc(f.body)}</p></div>`:'';};
const feedbackForm=(submission,i)=>{const f=feedbackFor(submission,i);return `<details class="cr-feedback-edit"${f?' open':''}><summary>${f?'Kommentar bearbeiten':'Kommentar schreiben'}</summary><form data-cr-form="feedback"><input type="hidden" name="submission_id" value="${esc(submission.id)}"><input type="hidden" name="item_index" value="${i}"><label>Kommentar zu Satz ${i+1}<textarea name="body" maxlength="1000" rows="2">${esc(f?.body||'')}</textarea></label><div class="cr-toolbar"><button class="primary">Kommentar speichern</button></div><p class="cr-note">Nur wer die Abgabe eingereicht hat, sieht diesen Kommentar. Leer speichern löscht ihn.</p></form></details>`;};
const localInput=v=>{if(!v)return '';const d=new Date(v);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
// Vogel neben dem Namen (ohne gewählten Vogel: Anfangsbuchstabe). Der eigene bewegt sich, die anderen erst beim Darüberfahren.
const bird=(id,name,own=false,size='')=>avatarMarkup(id,{name,live:!!own,size});
// Der Spitzname aus dem Konto wird als Name für neue Klassenräume vorgeschlagen.
const ownNickname=()=>cleanNickname(accountUser()?.user_metadata?.nickname);
const css=document.createElement('link');css.rel='stylesheet';css.href='./classrooms.css?v=85';document.head.append(css);
const button=document.createElement('button');button.id='classrooms-button';button.type='button';button.dataset.view='classrooms';button.textContent='Klassenraum';
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
async function qualityApi(action,payload={}){
 if(!accountUser())throw new Error('Bitte zuerst anmelden.');
 const response=await accountRequest('/rest/v1/rpc/sentence_quality_api',{method:'POST',body:JSON.stringify({action,payload})});
 const value=await response.json().catch(()=>({}));
 if(!response.ok||value.error)throw new Error(value.error||value.message||'Qualitätsprüfung nicht verfügbar. Bitte erneut versuchen.');
 return value;
}
async function loadGlobalQuality(){
 const response=await accountRequest('/rest/v1/rpc/sentence_quality_exclusions',{method:'POST',body:'{}'});
 if(!response.ok)return {sentence_ids:[],translations:[]};
 return response.json();
}
function availableDeck(){
 const blockedSentences=new Set([...(globalQuality.sentence_ids||[]).map(Number),...classroomHidden.keys()]);
 const blockedTranslations=new Set((globalQuality.translations||[]).map(pair=>`${Number(pair.sentence_id)}:${Number(pair.translation_id)}`));
 return (deck||[]).filter(s=>!blockedSentences.has(Number(s.id))).map(s=>({...s,translations:(s.translations||[]).filter(t=>!blockedTranslations.has(`${Number(s.id)}:${Number(t.id)}`))})).filter(s=>s.translations.length);
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
const sentenceSourceIcon=s=>{
 if(!s||!/^\d+$/.test(String(s.id))||['english_bridge','finnish_adaptation','teacher_created'].includes(s.origin))return '';
 const id=Number(s.id),owner=s.owner||'Tatoeba',license=s.license||'CC BY 2.0 FR';
 const label=`Quelle: Tatoeba-Satz #${id} von ${owner}, Lizenz ${license}. Auf Tatoeba öffnen.`;
 return `<button type="button" class="sentence-source-icon" data-i18n-attrs data-source-url="https://tatoeba.org/en/sentences/show/${id}" data-source-label="${esc(label)}" aria-label="${esc(label)}" aria-expanded="false" title="${esc(label)}"></button>`;
};
const sources=s=>s.origin==='teacher_created'?'<details class="cr-sources"><summary>Herkunft</summary><p>Eigener Satz und richtige Übersetzung der Lehrkraft.</p></details>':`<details class="cr-sources"><summary>Quellen &amp; Lizenzen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations?.[0])}</p></details>`;
function updateHeading(){
 $('classrooms-title').textContent=room?.name||'Klassenräume';
 $('classrooms-refresh').hidden=!room;
}
async function home(){
 loadDrafts();
 room=null;selected=null;dirty=false;streamFilter='all';updateHeading();
 if(!accountUser()){$('classrooms-content').innerHTML=`<p>Gemeinsam Finnisch lernen: Erstelle einen Raum oder tritt deiner Klasse per Code bei.</p><p>Zum Beitreten und Speichern brauchst du ein Konto.</p>${b('Anmelden / Registrieren','login')}`;return;}
 const rooms=await api('list');applyNews(rooms);lastNewsCheck=Date.now();
 $('classrooms-content').innerHTML=`<p>Ein Raum für eure Sätze, Fragen und gemeinsamen Fortschritte.</p><h3>Meine Klassenräume</h3><div class="cr-grid">${rooms.length?rooms.map(r=>`<article class="cr-card cr-room-card"><span class="cr-badge">${r.teacher?'Lehrkraft':'Teilnehmer'}${r.archived?' · Archiv':''}</span>${newPill(r.news)}<h3>${esc(r.name)}</h3>${r.open_tasks?`<p class="cr-note cr-open-tasks">${r.open_tasks===1?'1 offene Aufgabe':`${r.open_tasks} offene Aufgaben`}</p>`:''}${b('Raum öffnen','open',`data-id="${r.id}"`)}</article>`).join(''):'<p>Noch keine Klassenräume. Erstelle einen Raum oder gib einen Einladungscode ein.</p>'}</div><div class="cr-grid cr-room-actions"><details class="cr-card cr-room-action"><summary><span><strong>Klassenraum erstellen</strong><small class="cr-room-action-closed">Zum Öffnen anklicken</small><small class="cr-room-action-open">Einklappen</small></span></summary><form data-cr-form="create"><label>Raumname<input name="name" required minlength="3" maxlength="80" placeholder="Finnisch am Mittwoch"></label><label>Dein Name in diesem Klassenraum<input name="display_name" required maxlength="80" autocomplete="name" placeholder="Zum Beispiel Anna Müller" value="${esc(ownNickname())}"></label><p class="cr-note">So sieht dich diese Klasse. Dein Benutzername für den Login bleibt unverändert.</p><p class="cr-note">Du übernimmst die Lehrkraft-Rolle und verwaltest Aufgaben und Mitglieder.</p><button class="primary">Raum erstellen</button></form></details><details class="cr-card cr-room-action"><summary><span><strong>Mit Code beitreten</strong><small class="cr-room-action-closed">Zum Öffnen anklicken</small><small class="cr-room-action-open">Einklappen</small></span></summary><form data-cr-form="join"><label>Einladungscode<input name="code" required maxlength="40" autocomplete="off" placeholder="Code der Lehrkraft"></label><label>Dein Name in diesem Klassenraum<input name="display_name" required maxlength="80" autocomplete="name" placeholder="Zum Beispiel Anna Müller" value="${esc(ownNickname())}"></label><p class="cr-note">So sieht dich diese Klasse. Dein Benutzername für den Login bleibt unverändert.</p><p class="cr-note">Im Raum sind dein Klassenraumname und deine Beiträge sichtbar. Die Lehrkräfte sehen deine Abgaben. Dein privater Lernstand bleibt privat.</p><button class="primary">Klasse beitreten</button></form></details></div>`;
}
async function open(id){
 const next=await api('room',{room_id:id});
 const feed=await api('stream_list',{room_id:id});
 room=next;stream=feed;selected=null;lastRefresh=Date.now();
 const seen=seenMap();newSince=room.id in seen?seen[room.id]:null;markRoomSeen();
 updateHeading();renderRoom();
}
function memberRow(m){
 const label=`${bird(m.avatar,m.name,m.own,'sm')}${esc(m.name)} · ${m.owner?'Lehrkraft · Ersteller':m.role==='teacher'?'Lehrkraft':'Teilnehmer'}${m.blocked?' · entfernt':''}`;
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
 <aside class="cr-stream-sidebar" aria-label="Klassenübersicht"><section class="cr-card cr-today"><div class="eyebrow">IM BLICK</div><h3>Heute &amp; demnächst</h3>${room.teacher&&!room.archived?b('Aufgabe erstellen','new_assignment'):''}${upcomingAssignments()}<p class="cr-note">${stream.open_questions===1?'1 Frage wartet auf eine Antwort.':`${stream.open_questions||0} Fragen warten auf eine Antwort.`}</p></section>
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
 const [quality,hidden]=await Promise.all([loadGlobalQuality(),qualityApi('classroom_list',{room_id:room.id})]);
 globalQuality=quality||{sentence_ids:[],translations:[]};classroomHidden=new Map((hidden||[]).map(item=>[Number(item.sentence_id),item]));
 selected=new Map();customItems=[{de:'',fi:'',added:false}];gaps=new Map();gapRows=[];verbChoice=new Set();personChoice=new Set([0,1,2,3,4,5]);
 const customSection=title=>`<section class="cr-assignment-source"><div class="cr-section-heading"><div><h4>${title}</h4><p class="cr-note">Diese Sätze gelten nur für diese Aufgabe und erscheinen später nicht als gespeicherte Auswahl.</p></div></div><div data-custom-host></div></section>`;
 $('cr-composer').scrollIntoView?.({block:'start',behavior:'smooth'});
 $('cr-composer').innerHTML=`<form data-cr-form="assign" class="cr-card"><h3>Neue Aufgabe</h3><div class="cr-tabs cr-type-tabs" role="tablist" aria-label="Aufgabentyp"><button type="button" role="tab" aria-selected="true" data-cr="type" data-type="translate">Übersetzen</button><button type="button" role="tab" aria-selected="false" data-cr="type" data-type="cloze">Lückentext</button><button type="button" role="tab" aria-selected="false" data-cr="type" data-type="verbs">Verbformen</button></div><input type="hidden" name="direction" value="de-fi"><p class="cr-note" id="cr-type-hint">${TYPE_HINTS['de-fi']}</p><div id="cr-direction-switch" class="cr-switch" role="group" aria-label="Richtung"><button type="button" data-cr="direction" data-value="de-fi" aria-pressed="true">Deutsch → Finnisch</button><button type="button" data-cr="direction" data-value="fi-de" aria-pressed="false">Finnisch → Deutsch</button></div><label>Titel<input name="title" required minlength="3" maxlength="100" placeholder="Unsere erste Übersetzungsrunde"></label><label>Abgabetermin (optional)<input name="due" type="datetime-local"></label><div id="cr-source-switch" class="cr-switch" role="tablist" aria-label="Art der Sätze"><button type="button" role="tab" aria-selected="true" data-cr="tab_custom">Eigene Sätze</button><button type="button" role="tab" aria-selected="false" data-cr="tab_existing">Vorhandene Sätze</button></div><div id="cr-tab-custom" role="tabpanel">${customSection('Eigene Sätze erstellen')}</div><div id="cr-tab-existing" role="tabpanel" hidden><section class="cr-assignment-source"><h4>Vorhandene Sätze auswählen</h4><div class="cr-grid"><label>Level<select id="cr-level">${[1,2,3,4,5,6].map(n=>`<option>${n}</option>`).join('')}</select></label><label>Grammatikthema<select id="cr-topic"></select></label></div><p id="cr-topic-hint" class="cr-note"></p><div id="cr-sentence-picker"></div><details class="cr-hidden-sentences"><summary>Für diesen Klassenraum ausgeblendet · <span id="cr-hidden-count">0</span></summary><div id="cr-hidden-list"></div></details></section>${customSection('Eigene Sätze ergänzen')}</div><section id="cr-gap-panel" class="cr-assignment-source" hidden></section><section id="cr-verb-panel" class="cr-assignment-source" hidden></section><p id="cr-limit-note">Insgesamt sind 1–20 hinzugefügte oder ausgewählte Sätze möglich.</p><p id="cr-selection-count">0 Sätze ausgewählt</p><div class="cr-toolbar"><button class="primary">Aufgabe veröffentlichen</button>${b('Abbrechen','cancel_assignment')}</div></form>`;
 renderTopicOptions();picker();renderHiddenSentences();renderCustomItems();updateSelectionCount();
}
const addedCustomItems=()=>customItems.filter(item=>item.added);
const selectionSize=()=>selected.size+addedCustomItems().length;
function updateSelectionCount(){
 if(!$('cr-selection-count'))return;
 if(composerType()==='verbs'){const n=verbItems(false).length;$('cr-selection-count').textContent=`${n} ${n===1?'Form':'Formen'} ausgewählt`;return;}
 $('cr-selection-count').textContent=`${selectionSize()} ${selectionSize()===1?'Satz':'Sätze'} ausgewählt`;renderGapPanel();
}
// Composer for the checked types. gaps: which word of a chosen sentence is left out
// (keyed by the sentence object, so it survives re-rendering); verbChoice/personChoice:
// which verbs and persons make up a Verbformen assignment.
let gaps=new Map(),gapRows=[],verbChoice=new Set(),personChoice=new Set([0,1,2,3,4,5]);
const composerType=()=>document.querySelector('[data-cr-form=assign] [name=direction]')?.value||'de-fi';
const classVerbs=()=>VERBS.filter(v=>!v.impersonal&&v.forms?.length===6);
const gapOf=(ref,text)=>{const n=wordsOf(text).length,g=gaps.get(ref);return Number.isInteger(g)&&g>=0&&g<n?g:defaultGap(text);};
function renderGapPanel(){
 const panel=$('cr-gap-panel');if(!panel)return;
 panel.hidden=composerType()!=='cloze';if(panel.hidden)return;
 gapRows=[...[...selected.values()].map(s=>({ref:s,fi:s.text,de:s.translations[0].text})),...addedCustomItems().map(item=>({ref:item,fi:item.fi.trim(),de:item.de.trim()}))];
 panel.innerHTML=`<h4>Lücken wählen</h4><p class="cr-note">Tippe in jedem Satz das Wort an, das die Klasse ergänzen soll.</p>${gapRows.length?gapRows.map((row,n)=>`<div class="cr-gap-row"><p class="cr-note" lang="de">${esc(row.de)}</p><div class="cr-gap-words" lang="fi">${wordsOf(row.fi).map((w,i)=>bare(w)?`<button type="button" class="cr-gap-word" data-cr="pick_gap" data-row="${n}" data-index="${i}" aria-pressed="${gapOf(row.ref,row.fi)===i}">${esc(w)}</button>`:`<span>${esc(w)}</span>`).join(' ')}</div></div>`).join(''):'<p class="cr-note">Wähle oben zuerst Sätze aus oder füge eigene hinzu.</p>'}`;
}
function renderVerbPanel(){
 const panel=$('cr-verb-panel');if(!panel)return;
 panel.innerHTML=`<h4>Verben und Personen wählen</h4><fieldset class="cr-verb-persons"><legend>Personen</legend>${PRONOUNS.map((pronoun,i)=>`<label><input type="checkbox" data-person="${i}" ${personChoice.has(i)?'checked':''}><span lang="fi">${pronoun}</span></label>`).join('')}</fieldset><label>Verb suchen<input id="cr-verb-filter" type="search" autocomplete="off" placeholder="olla, sein …"></label><div id="cr-verb-list">${classVerbs().map(v=>`<label class="cr-verb" data-verb-row="${esc(v.id)} ${esc(v.de)}"><input type="checkbox" data-verb="${esc(v.id)}" ${verbChoice.has(v.id)?'checked':''}><span><span lang="fi">${esc(v.id)}</span><small lang="de">${esc(v.de)}</small></span></label>`).join('')}</div><p class="cr-note">Jedes gewählte Verb ergibt eine Aufgabe je gewählter Person, zusammen höchstens 20.</p>`;
}
function verbItems(strict=true){
 const items=classVerbs().filter(v=>verbChoice.has(v.id)).flatMap(v=>[...personChoice].sort().map(person=>({id:`verb-${v.id}-${person}`,lang:'fin',text:v.forms[person],lemma:v.id,person,origin:'verb',translations:[{lang:'deu',text:v.de}],audios:[]})));
 if(strict&&!items.length)throw new Error('Bitte mindestens ein Verb und eine Person wählen.');
 if(strict&&items.length>20)throw new Error(`Das wären ${items.length} Formen – möglich sind höchstens 20. Wähle weniger Verben oder Personen.`);
 return items;
}
function applyComposerType(){
 const form=document.querySelector('[data-cr-form=assign]');if(!form)return;
 const type=composerType(),verbs=type==='verbs',custom=form.querySelector('[data-cr=tab_custom]').getAttribute('aria-selected')==='true';
 $('cr-type-hint').textContent=TYPE_HINTS[type];
 $('cr-source-switch').hidden=verbs;$('cr-direction-switch').hidden=!['de-fi','fi-de'].includes(type);
 form.querySelectorAll('[data-cr=type]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.type===(DIRECTIONS[type]&&!['de-fi','fi-de'].includes(type)?type:'translate'))));
 form.querySelectorAll('[data-cr=direction]').forEach(option=>option.setAttribute('aria-pressed',String(option.dataset.value===type)));$('cr-tab-custom').hidden=verbs||!custom;$('cr-tab-existing').hidden=verbs||custom;
 $('cr-verb-panel').hidden=!verbs;$('cr-limit-note').hidden=verbs;
 if(verbs&&!$('cr-verb-list'))renderVerbPanel();
 form.classList.toggle('cr-fi-first',type==='fi-de');
 updateSelectionCount();if(verbs)$('cr-gap-panel').hidden=true;
}
function setComposerTab(name){
 renderCustomItems();
 const custom=name==='custom';$('cr-tab-custom').hidden=!custom;$('cr-tab-existing').hidden=custom;
 document.querySelectorAll('#cr-source-switch [role=tab]').forEach(tab=>tab.setAttribute('aria-selected',String(tab.dataset.cr===(custom?'tab_custom':'tab_existing'))));
}
function renderTopicOptions(){
 const select=$('cr-topic'),level=Number($('cr-level').value),current=select.value,usable=availableDeck();
 const allCount=usable.filter(s=>s.level===level&&s.translations?.length).length;
 select.innerHTML=`<option value="all">Alle (${allCount})</option>`+GRAMMAR_TOPICS.map(t=>{const count=usable.filter(s=>s.level===level&&s.translations?.length&&topicNotes(s,grammar,t.id).length).length;return `<option value="${t.id}">${esc(t.label)} (${count})</option>`;}).join('');
 if(current==='all'||GRAMMAR_TOPICS.some(t=>t.id===current))select.value=current;
}
function picker(){
 const level=Number($('cr-level').value),topicId=$('cr-topic').value,topic=GRAMMAR_TOPICS.find(t=>t.id===topicId),showAll=topicId==='all';
 const matches=availableDeck().filter(s=>s.level===level&&s.translations?.length&&(showAll||topicNotes(s,grammar,topicId).length));
 $('cr-topic-hint').textContent=showAll?'Alle vorhandenen Sätze dieses Levels.':topic?.hint||'';
 const visible=showAll?matches:matches.slice(0,80);
 $('cr-sentence-picker').innerHTML=visible.map(s=>`<div class="cr-pick-row"><label class="cr-pick"><input type="checkbox" data-sentence="${s.id}" ${selected.has(s.id)?'checked':''}>${composingFiDe()?`<span lang="fi">${esc(s.text)}${sentenceSourceIcon(s)}<small lang="de">${esc(s.translations[0].text)}${sentenceSourceIcon(s.translations[0])}</small></span>`:`<span>${esc(s.translations[0].text)}${sentenceSourceIcon(s.translations[0])}<small lang="fi">${esc(s.text)}${sentenceSourceIcon(s)}</small></span>`}</label>${b('Ausblenden','hide_sentence',`data-id="${s.id}" aria-label="Satz nur in diesem Klassenraum ausblenden"`)}</div>`).join('')||'<p>Keine passenden Sätze.</p>';
 if(!showAll&&matches.length>80)$('cr-sentence-picker').insertAdjacentHTML('beforeend','<p>Die ersten 80 Treffer. Wähle bei Bedarf ein anderes Level oder Thema.</p>');
}
function renderHiddenSentences(){
 if(!$('cr-hidden-list'))return;
 $('cr-hidden-count').textContent=classroomHidden.size;
 $('cr-hidden-list').innerHTML=[...classroomHidden.keys()].map(id=>{const s=deck.find(item=>Number(item.id)===id);return `<div class="cr-hidden-row"><span>${s?composingFiDe()?`<span lang="fi">${esc(s.text)}</span><small lang="de">${esc(s.translations?.[0]?.text||'')}</small>`:`${esc(s.translations?.[0]?.text||'')}<small lang="fi">${esc(s.text)}</small>`:`Satz #${id}`}</span>${b('Wieder einblenden','restore_sentence',`data-id="${id}"`)}</div>`;}).join('')||'<p class="cr-note">Noch keine Sätze ausgeblendet.</p>';
}
function renderCustomItems(){
 const html=customItems.map((item,i)=>`<fieldset class="cr-custom-item ${item.added?'cr-custom-added':''}"><legend>Eigener Satz ${i+1}${item.added?' · ✓ Hinzugefügt':''}</legend>${item.added?`<p class="cr-added" role="status">✓ Hinzugefügt – dieser Satz ist Teil der Aufgabe.</p><p class="cr-custom-text" lang="de"><strong>Deutscher Satz</strong><br>${esc(item.de)}</p><p class="cr-custom-text" lang="fi"><strong>Finnischer Satz</strong><br>${esc(item.fi)}</p>`:`<label>Deutscher Satz<textarea data-custom-index="${i}" data-custom-field="de" maxlength="500" rows="2" lang="de" placeholder="Der Satz auf Deutsch">${esc(item.de)}</textarea></label><label>Finnischer Satz<textarea data-custom-index="${i}" data-custom-field="fi" maxlength="500" rows="2" lang="fi" placeholder="Der Satz auf Finnisch">${esc(item.fi)}</textarea></label>`}<div class="cr-toolbar">${item.added?b('Satz bearbeiten','edit_custom',`data-index="${i}"`):b('Satz hinzufügen','confirm_custom',`data-index="${i}"`)}${b('Satz entfernen','remove_custom',`data-index="${i}"`)}</div></fieldset>`).join('')||'<p class="cr-note">Noch keine eigenen Sätze eingegeben.</p>';
 document.querySelectorAll('[data-custom-host]').forEach(host=>host.innerHTML=html);
}
function assignment(id){
 const a=room.assignments.find(x=>x.id===id);if(!a)throw new Error('Aufgabe nicht mehr verfügbar.');
 selected=id;dirty=false;
 const fiDe=directionOf(a)==='fi-de',answerLang=fiDe?'de':'fi',exact=isExact(a);
 const own=a.submissions.find(s=>s.own),closed=room.archived||a.released||(a.due_at&&new Date(a.due_at)<new Date());
 const isCreator=a.own_assignment===undefined?room.teacher:a.own_assignment===true,showOverview=room.teacher&&(isCreator||Boolean(own)||a.released);
 if(own)dropDraft(id);
 if((own||a.can_manage)&&!lexiconReady)loadLexicon().then(()=>{lexiconReady=true;if(selected===id&&!dirty&&$('classrooms-content').querySelector('.cr-assignment-hero'))assignment(id);}).catch(()=>{});
 const canSubmit=!isCreator&&!own&&!closed,answers=drafts.get(id)||[],statusText=a.released?'Vergleich freigegeben':own?'Abgegeben':closed?'Geschlossen':'Offen';
 $('classrooms-content').innerHTML=`<div class="cr-toolbar cr-assignment-nav">${b('← Zum Klassenraum','back')}</div><section class="cr-assignment-hero"><span class="cr-assignment-kicker">Klassenaufgabe</span><h2>${esc(a.title)}</h2><div class="cr-assignment-meta"><span><strong>Frist</strong>${esc(date(a.due_at))}</span><span><strong>Abgaben</strong>${a.submitted_count} von ${room.member_count}</span><span class="cr-assignment-status">${esc(statusText)}</span></div></section><div class="cr-assignment-intro"><span aria-hidden="true">✦</span><p><strong>${DIRECTIONS[directionOf(a)]}</strong><br>${exact?'Hier gibt es je Aufgabe genau eine richtige Antwort. Nach der Abgabe siehst du, was stimmt.':'Andere Formulierungen können ebenfalls richtig sein. Es gibt keine automatische Benotung; die Satzvorlagen dienen zum gemeinsamen Üben.'}</p></div>${a.can_manage&&!room.archived?`<div class="cr-toolbar cr-assignment-manage">${b('Aufgabe bearbeiten','edit_assignment')}<button type="button" class="quiet cr-danger" data-cr="delete_assignment">Aufgabe löschen</button></div>`:''}${room.teacher&&!a.released&&!room.archived?`<p>${b('Abgaben schließen & Vergleich freigeben','release')}</p><p class="cr-note">Danach sind keine weiteren Abgaben möglich. Die Klasse sieht die Antworten ohne Nutzernamen.</p>`:''}${canSubmit?'<form data-cr-form="submit">':''}${a.items.map((s,i)=>`<article class="cr-card cr-assignment-item"><div class="cr-assignment-number" aria-hidden="true">${i+1}</div><div class="cr-assignment-item-body">${exact?exactItem(a,s,i,{canSubmit,own,answers,reveal:isCreator||own||a.released}):`<span class="cr-assignment-language">${fiDe?'Finnischer Satz':'Deutscher Satz'}</span>${fiDe?`<h3 lang="fi">${esc(s.text)}${sentenceSourceIcon(s)}</h3>`:`<h3>${esc(s.translations[0].text)}${sentenceSourceIcon(s.translations[0])}</h3>`}${canSubmit?`<label for="cr-answer-${i}">${fiDe?'Deine deutsche Übersetzung':'Deine finnische Übersetzung'}</label><textarea id="cr-answer-${i}" name="answer-${i}" data-answer="${i}" required maxlength="2000" rows="2" lang="${answerLang}">${esc(answers[i]||'')}</textarea>`:own?`<p lang="${answerLang}">Deine Antwort: ${esc(own.answers[i])}</p>`:''}${isCreator||own||a.released?(fiDe?`<p lang="de"><strong>${s.origin==='teacher_created'?'Richtige Lösung':'Deutsche Vorlage'}:</strong> ${esc(s.translations[0].text)}${sentenceSourceIcon(s.translations[0])}</p>`:`<p lang="fi"><strong>${s.origin==='teacher_created'?'Richtige Lösung':'Finnische Vorlage'}:</strong> ${esc(s.text)}${sentenceSourceIcon(s)}</p>`):''}${own?autoFeedback(own.answers[i],s,fiDe)+teacherNote(own,i):''}`}${directionOf(a)==='verbs'?'':sources(s)}</div></article>`).join('')}${canSubmit?'<p class="cr-note">Abgabe ist verbindlich. Dein Entwurf wird auf diesem Gerät gespeichert, bis du abgibst.</p><button class="primary">Alle Antworten verbindlich abgeben</button></form>':`${own&&exact?`<p class="cr-score-own"><strong>${scoreOf(a,own.answers)} von ${a.items.length} richtig.</strong></p>`:''}${own&&directionOf(a)!=='verbs'?reviewOffer(a):''}<p>${own?'Deine Antworten sind gespeichert.':isCreator?'Hier siehst du die eingereichten Antworten.':'Abgabe ist geschlossen.'}</p>`}
 ${showOverview||a.released?`<div class="cr-assignment-section-title"><span aria-hidden="true">✓</span><div><span class="cr-assignment-language">Auswertung</span><h3>${room.teacher?'Abgabenübersicht':'Gemeinsamer Lösungsvergleich'}</h3></div></div>${room.teacher?`<p>Noch ohne Abgabe: ${room.members.filter(m=>m.role!=='teacher'&&!m.blocked&&!a.submissions.some(s=>s.author_id===m.id)).map(m=>esc(m.name)).join(', ')||'niemand'}</p>`:''}${a.can_manage?classOverview(a,fiDe):''}${a.submissions.map((s,i)=>`<article class="cr-card cr-submission-card"><h4>${room.teacher?esc(s.author):s.own?'Deine Lösung':`Lösung ${i+1}`}</h4>${exact?`<p class="cr-note cr-score">${scoreOf(a,s.answers)} von ${a.items.length} richtig</p>`:''}${s.answers.map((v,j)=>`<div class="cr-submission-answer"><p><strong>${j+1}.</strong> <span lang="${answerLang}">${esc(v)}</span></p>${a.can_manage?(exact?verdict(a,a.items[j],v):autoFeedback(v,a.items[j],fiDe))+(room.archived?teacherNote(s,j):feedbackForm(s,j)):''}</div>`).join('')}${a.released&&!room.archived?`<div class="cr-toolbar">${Object.entries({helpful:'Hilfreich',interesting:'Interessant',encouraging:'Gut gemacht'}).map(([k,label])=>b(`${label} · ${s.reactions[k]||0}`,'react',`data-id="${s.id}" data-kind="${k}"`)).join('')}</div>`:''}</article>`).join('')||'<p>Noch keine Abgaben.</p>'}`:'<p>Der gemeinsame Lösungsvergleich wird von der Lehrkraft freigegeben.</p>'}
 <div class="cr-assignment-section-title cr-discussion-title"><span aria-hidden="true">?</span><div><span class="cr-assignment-language">Gemeinsam klären</span><h3>Fragen &amp; Austausch</h3></div></div><p class="cr-note cr-discussion-note">Für alle im Raum sichtbar, mit deinem Klassenraumnamen. Keine persönlichen Daten posten. Die Lehrkraft kann Beiträge entfernen.</p>${discussion(a)}${!room.archived?`<form data-cr-form="message" class="cr-card"><h4>Neue Diskussion starten</h4><label>Zu welchem Satz?<select name="item_index">${a.items.map((s,i)=>`<option value="${i}">${i+1}. ${esc(itemLabel(a,s))}</option>`).join('')}</select></label><label>Frage oder Diskussionsbeitrag<textarea name="body" required maxlength="1500" rows="3"></textarea></label><button class="primary">Beitrag senden</button></form>`:''}`;
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
     return `<li class="cr-thread-node"><article class="cr-message" id="cr-message-${m.id}" data-message-id="${m.id}"><div class="cr-message-meta">${bird(m.avatar,m.author,m.own)}<strong>${esc(m.author)}</strong>${m.teacher?' · Lehrkraft':''}${newPill(!m.own&&isNew(m.created_at))} · Satz ${m.item_index+1}${m.created_at?` · <time datetime="${esc(m.created_at)}">${esc(date(m.created_at))}</time>`:''}</div>${parentMessage?`<small class="cr-note">Antwort an ${esc(parentMessage.author)}</small>`:''}<p>${esc(m.body)}</p><div class="cr-toolbar">${!room.archived?b('Antworten','reply',`data-id="${m.id}"`):''}${(room.teacher||m.own)&&!room.archived?b('Beitrag entfernen','delete_message',`data-id="${m.id}"`):''}</div><div id="cr-reply-${m.id}"></div></article>${children.has(m.id)?`<ul class="cr-replies ${depth>=3?'cr-replies-deep':''}" aria-label="Antworten auf den Beitrag von ${esc(m.author)}">${render(m.id,depth+1)}</ul>`:''}</li>`;
   }).join('');
 }
 return `<ul class="cr-discussions" aria-label="Diskussionen">${render(null)}</ul>`;
}
function renderEditItems(){
 const host=$('cr-edit-items');if(!host)return;
 const left=editItems.filter(item=>!item.removed).length;
 host.innerHTML=editItems.map((item,i)=>`<fieldset class="cr-custom-item cr-edit-item ${item.removed?'cr-edit-removed':''}"><legend>Satz ${i+1}${item.removed?' · wird entfernt':''}</legend>${item.custom&&!item.removed?`<label>Deutscher Satz<textarea data-edit-index="${i}" data-edit-field="de" maxlength="500" rows="2" lang="de">${esc(item.de)}</textarea></label><label>Finnischer Satz<textarea data-edit-index="${i}" data-edit-field="fi" maxlength="500" rows="2" lang="fi">${esc(item.fi)}</textarea></label>`:`<p class="cr-custom-text" lang="de">${esc(item.de)}</p><p class="cr-custom-text cr-note" lang="fi">${esc(item.fi)}</p>`}<div class="cr-toolbar">${item.removed?b('Satz behalten','edit_toggle',`data-index="${i}"`):left>1?b('Satz entfernen','edit_toggle',`data-index="${i}"`):''}</div></fieldset>`).join('');
}
function editAssignment(id){
 const a=room.assignments.find(x=>x.id===id);if(!a||!a.can_manage)throw new Error('Aufgabe nicht mehr verfügbar.');
 selected=id;dirty=false;
 editItems=a.items.map(s=>({de:s.translations[0].text,fi:s.text,custom:s.origin==='teacher_created',removed:false}));
 $('classrooms-content').innerHTML=`<div class="cr-toolbar cr-assignment-nav">${b('← Zurück zur Aufgabe','assignment',`data-id="${id}"`)}</div><form data-cr-form="update_assignment" class="cr-card"><h3>Aufgabe bearbeiten</h3><label>Titel<input name="title" required minlength="3" maxlength="100" value="${esc(a.title)}"></label><label>Abgabetermin (optional)<input name="due" type="datetime-local" value="${esc(localInput(a.due_at))}"></label>${a.items_locked||isExact(a)?`<p class="cr-note">Aufgabentyp: ${DIRECTIONS[directionOf(a)]}</p>`:directionSelect(directionOf(a))}<section class="cr-assignment-source"><h4>${directionOf(a)==='verbs'?'Formen':'Sätze'}</h4>${a.items_locked||isExact(a)?`<p class="cr-note">${isExact(a)?'Die Einträge dieser Aufgabe lassen sich nicht einzeln ändern. Für andere Einträge lösche die Aufgabe und lege sie neu an.':'Die Sätze lassen sich nicht mehr ändern, weil es schon Abgaben oder Fragen gibt oder der Vergleich freigegeben ist.'}</p><ol class="cr-edit-locked">${a.items.map(s=>`<li>${directionOf(a)==='cloze'?`<span lang="fi">${gapSentence(s,true)}</span>`:esc(itemLabel(a,s))}</li>`).join('')}</ol>`:'<p class="cr-note">Eigene Sätze kannst du korrigieren, vorhandene Sätze nur entfernen. Das geht, solange es keine Abgaben und keine Fragen gibt.</p><div id="cr-edit-items"></div>'}</section><div class="cr-toolbar"><button class="primary">Änderungen speichern</button>${b('Abbrechen','assignment',`data-id="${id}"`)}</div></form>`;
 renderEditItems();
}
async function refreshAssignment(){const id=selected;room=await api('room',{room_id:room.id});lastRefresh=Date.now();assignment(id);}
function canNavigate(){return !dirty||confirm('Ungespeicherte Eingaben verlassen? Antwortentwürfe bleiben auf diesem Gerät gespeichert.');}
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
 if(!e.target.matches('[data-answer]'))dirty=true;
 if(e.target.closest('[data-cr-form=stream_post]'))saveStreamDraft();
 if(e.target.matches('[data-stream-reply]'))replyDrafts.set('stream-'+e.target.dataset.streamReply,e.target.value);
 if(e.target.matches('[data-answer]')){const v=drafts.get(selected)||[];v[Number(e.target.dataset.answer)]=e.target.value;drafts.set(selected,v);draftTimes.set(selected,Date.now());storeDrafts();}
 if(e.target.id==='cr-verb-filter'){const q=e.target.value.trim().toLocaleLowerCase('fi');document.querySelectorAll('[data-verb-row]').forEach(row=>{row.hidden=Boolean(q)&&!row.dataset.verbRow.toLocaleLowerCase('fi').includes(q);});return;}
 if(e.target.matches('[data-edit-field]'))editItems[Number(e.target.dataset.editIndex)][e.target.dataset.editField]=e.target.value;
 if(e.target.matches('[data-reply-id]'))replyDrafts.set(e.target.dataset.replyId,e.target.value);
 if(e.target.matches('[data-custom-field]'))customItems[Number(e.target.dataset.customIndex)][e.target.dataset.customField]=e.target.value;
});
$('classrooms-content').addEventListener('change',e=>{
 if(e.target.closest('[data-cr-form=stream_post]'))saveStreamDraft();
 if(e.target.id==='cr-level'){renderTopicOptions();picker();}
 if(e.target.id==='cr-topic')picker();
 if(e.target.matches('[data-cr-form=assign] [name=direction]')){picker();renderHiddenSentences();applyComposerType();}
 if(e.target.matches('[data-verb]')){if(e.target.checked)verbChoice.add(e.target.dataset.verb);else verbChoice.delete(e.target.dataset.verb);updateSelectionCount();}
 if(e.target.matches('[data-person]')){const n=Number(e.target.dataset.person);if(e.target.checked)personChoice.add(n);else personChoice.delete(n);updateSelectionCount();}
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
   if(action==='edit_assignment')return editAssignment(selected);
   if(action==='type'||action==='direction'){
     const form=el.closest('form'),field=form.querySelector('[name=direction]');
     // Übersetzen keeps the direction chosen last.
     field.value=action==='direction'?el.dataset.value:el.dataset.type==='translate'?(form.querySelector('[data-cr=direction][aria-pressed=true]')?.dataset.value||'de-fi'):el.dataset.type;
     picker();renderHiddenSentences();applyComposerType();return;
   }
   if(action==='pick_gap'){const row=gapRows[Number(el.dataset.row)];if(row){gaps.set(row.ref,Number(el.dataset.index));dirty=true;renderGapPanel();}return;}
   if(action==='add_reviews'){
     const a=room.assignments.find(x=>x.id===selected),out=$('cr-review-result');
     const result=window.suomiLearningState?.addReviews?.(stockItems(a).map(s=>({id:s.id,direction:directionOf(a)==='fi-de'?'fi-de':'de-fi'})));
     if(!result){out.textContent='Das Wiederholen ist gerade nicht bereit. Bitte gleich noch einmal versuchen.';return;}
     const parts=[];
     if(result.added)parts.push(result.added===1?'1 Satz ist jetzt im Wiederholen fällig.':`${result.added} Sätze sind jetzt im Wiederholen fällig.`);
     if(result.already)parts.push(result.already===1?'1 Satz war dort schon fällig.':`${result.already} Sätze waren dort schon fällig.`);
     if(result.missing)parts.push(result.missing===1?'1 Satz ist nicht mehr im Bestand.':`${result.missing} Sätze sind nicht mehr im Bestand.`);
     out.textContent=parts.join(' ');return;
   }
   if(action==='edit_toggle'){const item=editItems[Number(el.dataset.index)];item.removed=!item.removed;dirty=true;renderEditItems();return;}
   if(action==='delete_assignment'){
     const a=room.assignments.find(x=>x.id===selected);
     if(!confirm(`Aufgabe „${a.title}“ endgültig löschen? Alle Abgaben und Fragen dazu werden mitgelöscht.`))return;
     await api('delete_assignment',{room_id:room.id,assignment_id:selected});dropDraft(selected);await open(room.id);
     $('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Die Aufgabe wurde gelöscht.</p>');return;
   }
   if(action==='cancel_assignment'){if(!canNavigate())return;$('cr-composer').innerHTML='';dirty=false;return;}
   if(action==='hide_sentence'){
     const id=Number(el.dataset.id),sentence=deck?.find(s=>Number(s.id)===id);if(!sentence)throw new Error('Satz nicht gefunden.');
     if(!confirm('Diesen Satz für zukünftige Aufgaben in diesem Klassenraum ausblenden?'))return;
     await qualityApi('classroom_hide',{room_id:room.id,sentence_id:id});classroomHidden.set(id,{sentence_id:id});selected.delete(id);renderTopicOptions();picker();renderHiddenSentences();updateSelectionCount();return;
   }
   if(action==='restore_sentence'){
     const id=Number(el.dataset.id);await qualityApi('classroom_restore',{room_id:room.id,sentence_id:id});classroomHidden.delete(id);renderTopicOptions();picker();renderHiddenSentences();return;
   }
   if(action==='tab_custom')return setComposerTab('custom');
   if(action==='tab_existing')return setComposerTab('existing');
   if(action==='confirm_custom'){
     const index=Number(el.dataset.index),item=customItems[index];if(!item)throw new Error('Satz nicht gefunden.');
     if(item.added)return;
     if(!item.de.trim()||!item.fi.trim())throw new Error('Bitte zuerst den deutschen und den finnischen Satz eingeben.');
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
     customItems.splice(Number(el.dataset.index),1);
     // Ein leeres Feld für den nächsten Satz bleibt immer stehen; einen eigenen Knopf dafür gibt es nicht mehr.
     if(!customItems.some(item=>!item.added)&&selectionSize()<20&&customItems.length<20)customItems.push({de:'',fi:'',added:false});
     renderCustomItems();updateSelectionCount();return;
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
     const type=data.get('direction')||'de-fi',cloze=type==='cloze';
     if(type!=='verbs'&&!selectionSize())throw new Error('Bitte mindestens einen Satz auswählen oder erstellen.');
     if(type!=='verbs'&&selectionSize()>20)throw new Error('Maximal 20 Sätze pro Aufgabe.');
     const teacher=room.members.find(m=>m.own)?.name||'Lehrkraft';
     const own=addedCustomItems().map((item,i)=>{
       const de=item.de.trim(),fi=item.fi.trim();
       if(!de||!fi)throw new Error(`Bitte deutschen Satz und finnische Lösung für eigenen Satz ${i+1} eingeben.`);
       const uid=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${i}`;
       return {id:`teacher-${uid}`,lang:'fin',text:fi,owner:teacher,origin:'teacher_created',translations:[{id:`teacher-de-${uid}`,lang:'deu',text:de,owner:teacher,origin:'teacher_created'}],audios:[]};
     });
     payload={title:data.get('title'),items:type==='verbs'?verbItems():[...[...selected.values()].map(s=>cloze?{...s,gap:gapOf(s,s.text)}:s),...own.map((item,i)=>cloze?{...item,gap:gapOf(addedCustomItems()[i],item.text)}:item)],due_at:data.get('due')?new Date(data.get('due')).toISOString():null,direction:type};
   }
   if(action==='update_assignment'){
     const a=room.assignments.find(x=>x.id===selected);
     payload={assignment_id:selected,title:String(data.get('title')||'').trim(),due_at:data.get('due')?new Date(data.get('due')).toISOString():''};
     if(data.get('direction'))payload.direction=data.get('direction');
     if(!a.items_locked&&!isExact(a)){
       const items=[];
       editItems.forEach((item,i)=>{
         if(item.removed)return;
         if(!item.custom){items.push(a.items[i]);return;}
         const de=item.de.trim(),fi=item.fi.trim();
         if(!de||!fi)throw new Error(`Bitte deutschen Satz und finnische Lösung für Satz ${i+1} eingeben.`);
         items.push({...a.items[i],text:fi,translations:[{...a.items[i].translations[0],text:de},...a.items[i].translations.slice(1)]});
       });
       if(!items.length)throw new Error('Eine Aufgabe braucht mindestens einen Satz.');
       if(JSON.stringify(items)!==JSON.stringify(a.items))payload.items=items;
     }
   }
   if(action==='submit'){
     const a=room.assignments.find(x=>x.id===selected);
     payload={assignment_id:selected,answers:a.items.map((s,i)=>String(data.get(`answer-${i}`)||'').trim())};
     if(!confirm('Antworten jetzt verbindlich abgeben? Danach sind sie nicht mehr änderbar.'))return;
   }
   if(action==='message')payload.assignment_id=selected;
   if(action==='feedback'){payload.assignment_id=selected;payload.item_index=Number(payload.item_index);}
   if(action==='delete_room'&&data.get('confirm_name')!==room.name)throw new Error('Bitte den Raumnamen exakt eingeben.');
   if(room)payload.room_id=room.id;
   const value=await api(action,payload);dirty=false;
   if(action==='delete_room'){accountRequest('/functions/v1/storage-sweep',{method:'POST',body:'{}'}).catch(()=>{});streamDrafts.delete(room.id);for(const a of room.assignments)dropDraft(a.id);await home();$('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Klassenraum und zugehörige Inhalte wurden endgültig gelöscht.</p>');return;}
   if(action==='rename'){await open(room.id);$('classrooms-content').insertAdjacentHTML('afterbegin','<p role="status">Dein Name wurde für diesen Klassenraum geändert.</p>');return;}
   if(action==='create'||action==='join')return open(value.id);
   if(action==='submit'){dropDraft(selected);return refreshAssignment();}
   if(action==='update_assignment'||action==='feedback')return refreshAssignment();
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
// The saved name always ends in the extension of the checked MIME type and
// contains no path or control characters, whatever the uploader called it.
const downloadName=file=>{const ext=Object.keys(fileTypes).find(k=>fileTypes[k]===file.mime)||'bin';const base=String(file.name||'').replace(/\.[^.]*$/,'').replace(/[\u0000-\u001f\u007f\/\\:*?"<>|]+/g,'_').trim().slice(0,150)||'Anhang';return base+'.'+ext;};
const streamPosts=()=>Array.isArray(stream.posts)?stream.posts:[];
const fileSize=n=>n<1048576?`${Math.ceil(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
function richText(value){return String(value??'').split(/(https?:\/\/[^\s<>]+)/g).map(part=>/^https?:\/\//.test(part)?`<a href="${esc(part)}" target="_blank" rel="noopener noreferrer">${esc(part)}</a>`:esc(part)).join('');}
function streamComposer(){return `<details class="cr-card cr-stream-compose" id="cr-stream-compose"><summary><span><strong>Was möchtest du mit der Klasse teilen?</strong><small class="cr-compose-closed">Frage oder Beitrag erstellen · Aufklappen</small><small class="cr-compose-open">Beitragsbox einklappen</small></span></summary><form data-cr-form="stream_post"><label>Beitragsart<select name="kind"><option value="post">Beitrag teilen</option><option value="question">Frage stellen</option>${room.teacher?'<option value="announcement">Ankündigung</option>':''}</select></label><label class="cr-compose-label">Dein Text<textarea name="body" required maxlength="3000" rows="3" placeholder="Eine Frage, ein Gedanke oder etwas Hilfreiches …"></textarea></label><div class="cr-toolbar"><label class="cr-file-picker">＋ Bilder &amp; Dateien<input type="file" name="files" multiple accept=".png,.jpg,.jpeg,.webp,.pdf,.txt,.csv,.zip,.docx,.xlsx,.pptx"></label><button class="primary">Veröffentlichen →</button></div><p class="cr-note">Bis zu 3 Dateien, je 10 MB · nur für diese Klasse sichtbar</p><div id="cr-draft-files" aria-live="polite"></div></form></details>`;}
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
 return items.map(a=>`<div class="cr-upcoming"><strong>${esc(a.title)}</strong>${newPill(assignmentNews(a))}<p class="cr-note">${esc(date(a.due_at))}</p>${b('Zur Aufgabe →','assignment',`data-id="${a.id}"`)}</div>`).join('')||'<p>Im Moment steht keine Aufgabe an.</p>';
}
function renderFeed(){
 const preview=$('cr-image-dialog');if(preview?.open)preview.close();
 for(const url of attachmentURLs)URL.revokeObjectURL(url);attachmentURLs.clear();
 const entries=[...streamPosts(),...room.assignments.map(a=>({...a,kind:'assignment',created_at:stream.assignment_dates?.[a.id]}))]
 .filter(p=>(p.kind==='assignment'||!p.deleted)&&(streamFilter==='all'||p.kind===streamFilter)).sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned)||(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0)||String(b.id).localeCompare(String(a.id)));
 $('cr-stream-feed').innerHTML=entries.map(p=>{
  if(p.kind==='assignment')return `<article class="cr-card cr-feed-card cr-feed-assignment"><span class="cr-feed-type">NEUE AUFGABE</span>${newPill(assignmentNews(p))}${p.created_at?`<time>${esc(date(p.created_at))}</time>`:''}<h3>${esc(p.title)}</h3><p>${p.items.length} ${directionOf(p)==='verbs'?'Formen':'Sätze'} · ${DIRECTIONS[directionOf(p)]} · ${esc(date(p.due_at))}</p><div class="cr-toolbar">${b('Aufgabe öffnen →','assignment',`data-id="${p.id}"`)}<span class="cr-state">${p.released?'Vergleich freigegeben':p.submissions.some(s=>s.own)?'Abgegeben':p.due_at&&new Date(p.due_at)<new Date()?'Frist abgelaufen':'Offen'}</span></div></article>`;
  const writable=!room.archived&&!p.deleted;
  return `<article class="cr-card cr-feed-card cr-feed-${p.kind}" id="cr-post-${p.id}"><div class="cr-feed-meta"><span class="cr-feed-type">${p.pinned?'ANGEHEFTET · ':''}${{question:'FRAGE',post:'BEITRAG',announcement:'ANKÜNDIGUNG'}[p.kind]||'BEITRAG'}</span>${newPill(!p.own&&isNew(p.created_at))}${p.kind==='question'&&!p.deleted?`<span class="cr-state ${p.resolved?'cr-resolved':''}">${p.resolved?'✓ Beantwortet':'Offen'}</span>`:''}</div><div class="cr-author">${bird(p.avatar,p.author,p.own)}<strong>${esc(p.author)}</strong>${p.teacher?' · Lehrkraft':''} <time datetime="${esc(p.created_at)}">${esc(date(p.created_at))}</time></div><p class="cr-post-body">${richText(p.body)}</p>
 ${!p.deleted?(p.files||[]).map(f=>f.mime.startsWith('image/')?`<div class="cr-attachment cr-image-attachment" data-attachment="${f.id}"><button type="button" class="cr-image-thumb" data-cr="stream_preview" data-id="${f.id}" aria-label="Bild vergrößern"><span>Vorschau wird geladen …</span></button>${b('Herunterladen','stream_download',`data-id="${f.id}"`)}</div>`:`<div class="cr-attachment" data-attachment="${f.id}"><div><strong>${esc(f.name)}</strong><small>${fileSize(f.size)}</small></div>${b('Herunterladen','stream_download',`data-id="${f.id}"`)}</div>`).join(''):''}
 <div class="cr-toolbar">${writable?b('Antworten','stream_reply',`data-id="${p.id}"`):''}${writable&&p.kind==='question'&&(room.teacher||p.own)?b(p.resolved?'Wieder öffnen':'Als beantwortet markieren','stream_resolve',`data-id="${p.id}" data-value="${!p.resolved}"`):''}${writable&&room.teacher?b(p.pinned?'Lösen':'Anpinnen','stream_pin',`data-id="${p.id}" data-value="${!p.pinned}"`):''}${writable&&(room.teacher||p.own)?b('Entfernen','stream_delete',`data-id="${p.id}"`):''}</div>
 ${(p.replies||[]).length?`<details class="cr-feed-replies"><summary>${p.replies.length} ${p.replies.length===1?'Antwort':'Antworten'}${newPill(replyNews(p))}</summary>${renderStreamReplies(p)}</details>`:''}<div id="cr-stream-reply-${p.id}"></div></article>`;
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
  return `<div class="cr-stream-thread"><article class="cr-message" id="cr-stream-message-${m.id}"><div class="cr-author">${bird(m.avatar,m.author,m.own)}<strong>${esc(m.author)}</strong>${m.teacher?' · Lehrkraft':''}${newPill(!m.own&&isNew(m.created_at))}<time>${esc(date(m.created_at))}</time></div>${parent?`<small class="cr-note">Antwort an ${esc(parent.author)}</small>`:''}<p>${richText(m.body)}</p><div class="cr-toolbar">${!room.archived?b('Antworten','stream_reply',`data-id="${m.id}"`):''}${!room.archived&&(room.teacher||m.own)?b('Entfernen','stream_delete',`data-id="${m.id}"`):''}</div><div id="cr-stream-reply-${m.id}"></div></article>${children.has(m.id)?`<div class="cr-stream-children ${depth>=2?'cr-stream-children-flat':''}">${render(m.id,depth+1)}</div>`:''}</div>`;
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
  else{const a=document.createElement('a');a.href=url;a.download=downloadName(file);document.body.append(a);a.click();a.remove();}
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
// Coming back to the tab: look for news and reload the open room, unless something is being written.
function autoRefresh(){
 if($('classrooms-view').hidden||!room||busy||dirty||Date.now()-lastRefresh<60000)return;
 const content=$('classrooms-content'),active=document.activeElement;
 if(content.querySelector('[data-cr-form=assign],[data-cr-form=update_assignment],[data-cr-form=stream_reply],.cr-reply-form'))return;
 if(active&&content.contains(active)&&active.matches('textarea,input,select'))return;
 run(()=>typeof selected==='string'?refreshAssignment():open(room.id));
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible')return;checkNews();autoRefresh();});
window.addEventListener('vanamo:session',()=>checkNews(true));
setInterval(()=>{if(document.visibilityState==='visible')checkNews();},5*60*1000);
setTimeout(()=>checkNews(true),2500);
