// Vanamo – Satzkarte auf der Startseite für Besucher ohne Konto.
//
// Drei Schritte pro Satz:
//   1. Lesen: der finnische Satz, unter jedem Wort die Bedeutung, darunter die Übersetzung.
//   2. Satz bauen: aus vorgegebenen deutschen Wörtern die Übersetzung zusammensetzen.
//   3. Wort merken: ein Wort des Satzes als Karte, die man zum deutschen Wort umdreht.
// Wechsel zwischen Sätzen und Schritten: die alte Karte gleitet nach links hinaus, die neue kommt
// von rechts; Satz, Wortbedeutungen und Übersetzung laufen in eigenen Tempi (siehe style.css).
// Nutzt die Wortanalyse (lexicon.json) und die Satzbausteine der Wortübung.
import {loadLexicon,lookupForSentence,splitSentence} from './word-lookup.mjs?v=2';
import {createWordExercise,wordAnswerMatches,sentenceWords} from './word-practice.mjs?v=59';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEPS=['Lesen','Satz bauen','Wort merken'];
const OUT_MS=640,IN_MS=820;
const ICON_AUDIO='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></svg>';
const ICON_SHUFFLE='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';

// Bedeutung im Satz, kurz: „bei mir → ich habe“ wird zu „ich habe“.
export function shortGloss(info){
 let text=String(info?.here||info?.meaning||'').trim();
 if(text.includes('→'))text=text.split('→').pop().trim();
 // Grammatik-Zusätze wie „(nach Zahlwort: Partitiv Sg.)“ gehören nicht auf die Karte.
 text=text.replace(/\s*\([^)]*:[^)]*\)/g,'').trim();
 // Namen: „Tomi (Name)“ → „Name“
 return /\(Name\)$/.test(text)?'Name':text;
}

// Geeignete Sätze: erstes Level, 3–6 Wörter, jede Wortbedeutung vorhanden, kurze Übersetzung.
export function guestPool(sentences,level){
 const fits=sentences.filter(s=>s.level===level&&s.translations?.length&&!s.hidden).filter(s=>{
  const words=sentenceWords(s.text);if(words.length<3||words.length>6)return false;
  if(sentenceWords(s.translations[0].text).length>8)return false;
  if(words.some(w=>w.length>13))return false;
  const infos=lookupForSentence(s.text);return !!infos&&infos.length===words.length&&infos.every(i=>i&&shortGloss(i)&&shortGloss(i).length<=22);
 });
 const withAudio=fits.filter(s=>s.audios?.length);
 return withAudio.length>=20?withAudio:fits;
}

// Wort für Schritt 3: lieber Nomen, dann Adjektive, Verben, Adverbien; keine Namen.
export function flipWordIndex(infos,used=new Set()){
 const rank=info=>{
  if(!info||/Name/.test(info.meaning||''))return 9;
  const kind=(info.form||'').split('·')[0].trim();
  return ({Nomen:0,Adjektiv:1,Verb:2,Adverb:3}[kind]??5)+(used.has(info.lemma)?4:0);
 };
 let best=0;infos.forEach((info,i)=>{if(rank(info)<rank(infos[best]))best=i;});
 return best;
}

export function createGuestCard(root,{sentences,level,onUnavailable,sourceIcon=()=>''}){
 if(!root)return {start(){},stop(){},get available(){return false;}};
 let failed=false,pool=[],recent=[],sentence=null,infos=[],step=0,exercise=null,result=null,flipped=false,busy=false,audio=null,started=false;
 root.innerHTML=`<h2 id="guest-card-title" class="sr-only">Ein Satz zum Ausprobieren</h2>
<div class="guest-top"><span class="guest-lang"><span lang="fi">Suomi</span> · Finnisch</span><ol class="guest-steps" aria-label="Schritte"></ol><button type="button" class="guest-audio" hidden>${ICON_AUDIO}<span>Anhören</span></button></div>
<div class="guest-stage" aria-live="polite"></div>
<div class="guest-actions"></div>`;
 const $=sel=>root.querySelector(sel);
 const stage=$('.guest-stage'),actions=$('.guest-actions'),steps=$('.guest-steps'),audioButton=$('.guest-audio');

 function pick(){
  if(!pool.length)return null;
  const fresh=pool.filter(s=>!recent.includes(s.id));
  const list=fresh.length?fresh:pool;
  const next=list[Math.floor(Math.random()*list.length)];
  recent=[next.id,...recent].slice(0,Math.min(12,Math.max(0,pool.length-1)));
  return next;
 }

 function wordsMarkup(){
  // Satzzeichen bleiben am Wort; die Bedeutung steht darunter.
  const parts=splitSentence(sentence.text),cols=[];
  for(const p of parts){
   if(p.index!==undefined)cols.push({fi:p.text,gloss:shortGloss(infos[p.index])});
   else if(p.text.trim()&&cols.length)cols[cols.length-1].fi+=p.text;
   else if(p.text.trim())cols.push({fi:p.text,gloss:''});
  }
  return cols.map((c,i)=>`<span class="guest-word"><span class="guest-fi guest-l1">${esc(c.fi)}${i===cols.length-1?sourceIcon(sentence):''}</span><span class="guest-gloss guest-l2" lang="de">${esc(c.gloss)}</span></span>`).join('');
 }

 function renderSteps(){
  steps.innerHTML=STEPS.map((label,i)=>`<li class="${i===step?'current':i<step?'done':''}" ${i===step?'aria-current="step"':''}><span aria-hidden="true">${i+1}</span>${label}</li>`).join('');
 }

 function renderStage(){
  renderSteps();
  audioButton.hidden=!sentence?.audios?.length;
  if(step===0){
   stage.innerHTML=`<div class="guest-words" lang="fi">${wordsMarkup()}</div><p class="guest-translation guest-l3" lang="de">${esc(sentence.translations[0].text)}${sourceIcon(sentence.translations[0])}</p>`;
   actions.innerHTML=`<button type="button" class="guest-secondary" data-guest="other">${ICON_SHUFFLE}Anderer Satz</button><button type="button" class="guest-next" data-guest="step">Satz selbst bauen →</button>`;
  }else if(step===1){
   stage.innerHTML=`<p class="guest-sentence guest-l1" lang="fi">${esc(sentence.text)}${sourceIcon(sentence)}</p><div class="guest-build guest-l2"></div><p class="guest-feedback guest-l3" aria-live="polite"></p>`;
   renderBuild();
  }else{
   const i=flipWordIndex(infos),info=infos[i],word=sentenceWords(sentence.text)[i];
   const context=splitSentence(sentence.text).map(p=>p.index===i?`<mark>${esc(p.text)}</mark>`:esc(p.text)).join('');
   stage.innerHTML=`<p class="guest-context guest-l1" lang="fi">${context}</p>
<div class="guest-flip-wrap guest-l2"><button type="button" class="guest-flip" aria-pressed="${flipped}" aria-label="${esc(word)} – Karte umdrehen"><span class="guest-flip-inner"><span class="guest-face guest-front" lang="fi">${esc(word)}</span><span class="guest-face guest-back" lang="de">${esc(shortGloss(info))}</span></span></button></div>
<p class="guest-flip-note guest-l3">${flipped?`Grundform <b lang="fi">${esc(info.lemma)}</b> · ${esc(info.meaning)}`:'Weißt du, was das Wort heißt? Tippe auf die Karte, um sie umzudrehen.'}</p>`;
   stage.querySelector('.guest-flip').onclick=flip;
   renderActions();
  }
 }

 function renderBuild(){
  const box=stage.querySelector('.guest-build');if(!box)return;
  const chosen=exercise.selected.map(id=>exercise.tokens.find(t=>t.id===id));
  box.innerHTML=`<div class="word-answer guest-answer ${result===true?'is-right':result===false?'is-wrong':''}" lang="de" aria-label="${result===true?'Richtig':result===false?'Nicht ganz richtig':'Deine Übersetzung'}">${chosen.length?chosen.map(t=>`<button type="button" data-remove="${t.id}" ${result!==null?'disabled':''}>${esc(t.text)}</button>`).join(''):'<span class="guest-placeholder">Tippe die Wörter in der richtigen Reihenfolge an …</span>'}</div>
<div class="word-bank guest-bank" lang="de">${exercise.tokens.map(t=>`<button type="button" data-add="${t.id}" ${exercise.selected.includes(t.id)||result!==null?'disabled':''}>${esc(t.text)}</button>`).join('')}</div>`;
  box.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>{exercise.selected.push(Number(b.dataset.add));renderBuild();renderActions();});
  box.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{exercise.selected=exercise.selected.filter(id=>id!==Number(b.dataset.remove));renderBuild();renderActions();});
  const feedback=stage.querySelector('.guest-feedback');
  if(feedback)feedback.innerHTML=result===true?'<span class="guest-right">Richtig!</span>':result===false?`Leider nicht, richtig ist: <span lang="de">${esc(sentence.translations[0].text)}</span>`:'';
  renderActions();
 }

 function renderActions(){
  if(step===0)return;
  const other=`<button type="button" class="guest-secondary" data-guest="other">${ICON_SHUFFLE}Anderer Satz</button>`;
  if(step===1)actions.innerHTML=other+(result===null?`<button type="button" class="guest-check" data-guest="check" ${exercise.selected.length?'':'disabled'}>Prüfen</button>`:`<button type="button" class="guest-next" data-guest="step">Weiter: Wort merken →</button>`);
  else actions.innerHTML=other+(flipped?`<button type="button" class="guest-next" data-guest="new">Nächster Satz →</button>`:`<button type="button" class="guest-next" data-guest="flip">Umdrehen</button>`);
 }

 function flip(){
  flipped=!flipped;
  const button=stage.querySelector('.guest-flip');button?.setAttribute('aria-pressed',String(flipped));
  const i=flipWordIndex(infos),info=infos[i];
  const note=stage.querySelector('.guest-flip-note');
  if(note)note.innerHTML=flipped?`Grundform <b lang="fi">${esc(info.lemma)}</b> · ${esc(info.meaning)}`:'Weißt du, was das Wort heißt? Tippe auf die Karte, um sie umzudrehen.';
  renderActions();
 }

 // Karte wechseln: alter Inhalt gleitet nach links hinaus, neuer kommt von rechts.
 function swap(change){
  if(busy)return;
  const apply=()=>{change();renderStage();};
  if(reducedMotion()||!stage.children.length){apply();return;}
  busy=true;root.style.setProperty('--travel',`${Math.max(stage.offsetWidth,320)+80}px`);
  stage.classList.add('is-leaving');
  setTimeout(()=>{
   stage.classList.remove('is-leaving');apply();stage.classList.add('is-entering');
   setTimeout(()=>{stage.classList.remove('is-entering');busy=false;},IN_MS);
  },OUT_MS);
 }

 function newSentence(){
  stopAudio();
  const next=pick();if(!next)return;
  sentence=next;infos=lookupForSentence(next.text)||[];step=0;result=null;flipped=false;
  exercise=createWordExercise(next,'de',pool);
 }

 function stopAudio(){if(audio){audio.pause();audio=null;}audioButton.classList.remove('playing');}
 audioButton.onclick=()=>{
  if(audio){stopAudio();return;}
  const url=sentence?.audios?.[0]?.download_url;if(!url)return;
  audio=new Audio(url);audioButton.classList.add('playing');
  audio.onended=stopAudio;audio.onerror=stopAudio;audio.play().catch(stopAudio);
 };

 actions.addEventListener('click',event=>{
  const action=event.target.closest('[data-guest]')?.dataset.guest;if(!action||busy)return;
  if(action==='other'||action==='new')swap(newSentence);
  else if(action==='step')swap(()=>{step++;});
  else if(action==='check'){result=wordAnswerMatches(exercise);renderBuild();}
  else if(action==='flip')flip();
 });

 return {
  // Startet die Karte, sobald Sätze da sind; die Wortanalyse wird dafür nachgeladen.
  async start(){
   if(started)return;started=true;
   try{await loadLexicon();}catch{failed=true;root.classList.remove('is-loading');onUnavailable?.();return;}
   pool=guestPool(sentences(),level());
   if(!pool.length){failed=true;onUnavailable?.();return;}
   newSentence();renderStage();root.classList.remove('is-loading');
  },
  stop:stopAudio,
  get available(){return !failed;}
 };
}
