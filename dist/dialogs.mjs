// Dialoge: short everyday conversations per level and learning-path topic.
// Read line by line (words tappable via word lookup) or take over one role.
import {translationFeedbackMarkup} from './translation-feedback.mjs?v=1';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DONE_KEY='suomi-dialogs-read';

export function loadDialogs(fetcher=fetch){
 return fetcher('dialogs.json').then(r=>{if(!r.ok)throw new Error('dialogs');return r.json();}).then(data=>Array.isArray(data?.dialogs)?data.dialogs:[]);
}
export const dialogsForLevel=(dialogs,level)=>dialogs.filter(d=>d.level===level);
export const dialogForTopic=(dialogs,level,topic)=>dialogs.find(d=>d.level===level&&d.topic===topic)||null;

function readSet(){try{return new Set(JSON.parse(localStorage.getItem(DONE_KEY)||'[]'));}catch{return new Set();}}
function markRead(id){try{const done=readSet();done.add(id);localStorage.setItem(DONE_KEY,JSON.stringify([...done]));}catch{}}

// Browser speech only when a Finnish voice exists; clearly labelled as synthetic.
function finnishVoice(){
 try{return window.speechSynthesis?.getVoices().find(v=>/^fi(-|_|$)/i.test(v.lang))||null;}catch{return null;}
}
function speak(text){
 const voice=finnishVoice();if(!voice)return;
 try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang;u.rate=.9;window.speechSynthesis.speak(u);}catch{}
}

export function createDialogSession(dialog,role=null){
 return {dialog,role,position:role?0:1,revealed:new Set(),draft:'',checked:false,answers:{}};
}

// Lines visible so far; in role mode own lines stay German until checked.
function lineMarkup(session,line,i){
 const {dialog,role}=session,speaker=dialog.speakers[line.s],mine=role===line.s,current=i===session.position;
 const side=Object.keys(dialog.speakers).indexOf(line.s)%2?'right':'left';
 const speakButton=finnishVoice()?`<button type="button" class="dialog-speak quiet" data-dialog-speak="${i}" aria-label="Zeile vorlesen (Computerstimme)" title="Vorlesen · Computerstimme">🔊</button>`:'';
 if(mine&&current&&!session.checked){
  return `<li class="dialog-line ${side} mine current"><span class="dialog-speaker">${escape(speaker.name)} · du</span><p class="dialog-prompt" lang="de">${escape(line.de)}</p><form id="dialog-form"><label for="dialog-input">Sag es auf Finnisch (tippen ist optional)</label><textarea id="dialog-input" lang="fi" rows="2" maxlength="400" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="Sprich laut oder schreibe …">${escape(session.draft)}</textarea><div class="letter-buttons"><button type="button" data-dialog-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-dialog-letter="ö" aria-label="ö einfügen">ö</button></div><button class="primary" type="submit">Aufdecken</button></form></li>`;
 }
 const showDe=session.revealed.has(i)||mine;
 const feedback=mine&&session.answers[i]?translationFeedbackMarkup({answer:session.answers[i],templates:[line.fi],language:'fi',sentenceText:line.fi,compact:true}):'';
 return `<li class="dialog-line ${side}${mine?' mine':''}"><span class="dialog-speaker">${escape(speaker.name)}${mine?' · du':''}</span><p class="dialog-fi" lang="fi">${escape(line.fi)}</p>${speakButton}${showDe?`<p class="dialog-de" lang="de">${escape(line.de)}</p>`:`<button type="button" class="dialog-translate quiet" data-dialog-translate="${i}">Übersetzung</button>`}${feedback}</li>`;
}

export function renderDialogs(ctx){
 const {card,actions,notice,level,state}=ctx;
 notice.textContent='';actions.innerHTML='';card.className='card dialogs-card';
 if(!state.dialogs){card.innerHTML=`<span class="card-label">Dialoge · Level ${level}</span><h2>${state.failed?'Die Dialoge konnten nicht geladen werden.':'Dialoge werden geladen …'}</h2>`;return;}
 const session=state.session;
 if(!session){
  const list=dialogsForLevel(state.dialogs,level),done=readSet();
  card.innerHTML=`<span class="card-label">Dialoge · Level ${level}</span><h2>Alltag im Gespräch</h2><p>Kurze Dialoge zu den Themen deines Lernpfads – mit Sätzen, die du dort lernst. Tippe auf Wörter für ihre Bedeutung. Beim Mitspielen sprichst du eine Rolle selbst.</p>${list.length?`<ol class="dialog-list">${list.map(d=>`<li><button type="button" data-dialog-open="${escape(d.id)}"><span class="dialog-list-title"><span lang="de">${escape(d.title)}</span>${done.has(d.id)?' <span class="dialog-done" aria-label="gelesen">✓</span>':''}</span><small>${escape(ctx.topicTitle?.(d.topic)||'')} · ${d.lines.length} Zeilen</small></button></li>`).join('')}</ol>`:'<p>Für dieses Level gibt es noch keine Dialoge.</p>'}<p class="verb-hint">Mit KI geschrieben und gegengelesen, nicht von Muttersprachlern geprüft.</p>`;
  card.querySelectorAll('[data-dialog-open]').forEach(b=>b.onclick=()=>{state.session=createDialogSession(state.dialogs.find(d=>d.id===b.dataset.dialogOpen));ctx.rerender();});
  return;
 }
 const {dialog}=session,lines=dialog.lines,finished=session.position>=lines.length;
 const visible=lines.slice(0,Math.min(session.position+(session.role&&!finished?1:0),lines.length));
 const roles=Object.entries(dialog.speakers);
 card.innerHTML=`<div class="card-top"><span class="card-label">Dialog · Level ${dialog.level}</span><span>${Math.min(session.position,lines.length)} / ${lines.length}</span></div><h2 class="dialog-title" lang="de">${escape(dialog.title)}</h2><p class="dialog-scene" lang="de">${escape(dialog.scene)}</p><p class="dialog-cast" lang="de">${roles.map(([,p])=>`<span><b>${escape(p.name)}</b> · ${escape(p.role)}</span>`).join('')}</p><ol class="dialog-lines">${visible.map((line,i)=>lineMarkup(session,line,i)).join('')}</ol>${finished&&dialog.phrases?.length?`<div class="dialog-phrases"><h3>Wendungen aus dem Dialog</h3>${dialog.phrases.map(p=>`<p><b lang="fi">${escape(p.fi)}</b> – ${escape(p.de)}</p>`).join('')}</div>`:''}`;
 card.querySelectorAll('[data-dialog-translate]').forEach(b=>b.onclick=()=>{session.revealed.add(Number(b.dataset.dialogTranslate));ctx.rerender();});
 card.querySelectorAll('[data-dialog-speak]').forEach(b=>b.onclick=()=>speak(lines[Number(b.dataset.dialogSpeak)].fi));
 const back='<button type="button" class="dialog-back" id="dialog-back">Alle Dialoge</button>';
 if(finished){
  markRead(dialog.id);
  actions.innerHTML=`<div class="dialog-actions">${roles.map(([key,p])=>`<button type="button" class="primary" data-dialog-role="${key}">Als ${escape(p.name)} mitspielen</button>`).join('')}<button type="button" id="dialog-reread">Nochmal lesen</button>${back}</div>`;
  actions.querySelectorAll('[data-dialog-role]').forEach(b=>b.onclick=()=>{state.session=createDialogSession(dialog,b.dataset.dialogRole);ctx.rerender();});
  actions.querySelector('#dialog-reread').onclick=()=>{state.session=createDialogSession(dialog);ctx.rerender();};
 }else if(session.role&&lines[session.position].s===session.role&&!session.checked){
  actions.innerHTML=back;
  const input=card.querySelector('#dialog-input');
  input.oninput=e=>{session.draft=e.target.value;};
  card.querySelectorAll('[data-dialog-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart;input.setRangeText(b.dataset.dialogLetter,pos,input.selectionEnd,'end');session.draft=input.value;input.focus();};});
  card.querySelector('#dialog-form').onsubmit=e=>{e.preventDefault();session.answers[session.position]=session.draft.trim();session.draft='';session.position++;ctx.onLine?.();ctx.rerender();};
  input.focus();
 }else{
  actions.innerHTML=`<button type="button" class="primary" id="dialog-next">${session.position+1>=lines.length&&!session.role?'Dialog beenden':'Weiter'}</button>${back}`;
  const next=actions.querySelector('#dialog-next');
  next.onclick=()=>{session.position++;ctx.onLine?.();ctx.rerender();};
  next.focus({preventScroll:true});
 }
 actions.querySelector('#dialog-back').onclick=()=>{state.session=null;ctx.rerender();};
 card.querySelector('.dialog-line:last-child')?.scrollIntoView?.({block:'nearest'});
}
