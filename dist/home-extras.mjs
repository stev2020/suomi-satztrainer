// Vanamo – lebendigere Startseite für angemeldete Nutzer.
//
// - Begrüßung je nach Tageszeit: steht zuerst auf Deutsch und dreht sich zwei Sekunden nachdem
//   die Startseite fertig zu sehen ist auf Finnisch um (antippen dreht sie wieder zurück)
// - „heute geübt“ als Ring zum Tagesziel, Wochenreihe Mo–So und Serie in Tagen
// - „Satz des Tages“: ein Satz aus den eigenen Sätzen mit Wortbedeutungen und Übersetzung, zum Anhören
// - kleine Animationen (Hochzählen, Ring füllen); bei „reduzierter Bewegung“ entfallen sie
// Gäste sehen weiterhin die ursprüngliche Startseite mit Intro und Satzkarte.
import {loadLexicon,lookupForSentence,splitSentence} from './word-lookup.mjs?v=2';
import {shortGloss} from './guest-card.mjs?v=12';
const audioURL=a=>a?.download_url||(a?.id?`https://api.tatoeba.org/v1/audios/${encodeURIComponent(a.id)}/file`:'');

export const DAILY_GOAL=20;
const WEEKDAYS=[['Mo','Montag'],['Di','Dienstag'],['Mi','Mittwoch'],['Do','Donnerstag'],['Fr','Freitag'],['Sa','Samstag'],['So','Sonntag']];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
// Gleiches Datumsformat wie der Lernstand (memory.daily): YYYY-MM-DD in lokaler Zeit.
export const dayKey=date=>date.toLocaleDateString('sv-SE');

// ---------- Begrüßung ----------
export function finnishGreeting(date=new Date()){
 const h=date.getHours(),wd=date.getDay();
 if(h<5||h>=22)return {fi:'Moi, yökyöpeli',de:'Hallo, Nachteule'};
 if(wd===1&&h<12)return {fi:'Hyvää alkavaa viikkoa',de:'Einen guten Start in die Woche'};
 if(h<10)return {fi:'Hyvää huomenta',de:'Guten Morgen'};
 if(wd===5&&h>=12&&h<22)return {fi:'Hyvää perjantaita',de:'Schönen Freitag'};
 if(h<17)return (wd===0||wd===6)?{fi:'Hyvää viikonloppua',de:'Schönes Wochenende'}:{fi:'Hyvää päivää',de:'Guten Tag'};
 return {fi:'Hyvää iltaa',de:'Guten Abend'};
}
export function displayName(raw){const name=String(raw||'').trim();return name?name[0].toLocaleUpperCase('de')+name.slice(1):'';}

// Tauscht die Überschrift für Angemeldete gegen die Begrüßung; für Gäste bleibt das Original (Intro-Animation).
export function renderGreeting(h1,{account,name,date=new Date()}){
 if(!h1)return;
 if(!h1.dataset.original)h1.dataset.original=h1.innerHTML;
 if(!account){if(h1.classList.contains('is-greeting')){h1.innerHTML=h1.dataset.original;h1.classList.remove('is-greeting');}return;}
 const g=finnishGreeting(date),who=displayName(name),key=g.fi+'|'+who;
 if(h1.dataset.greeting===key)return;
 h1.dataset.greeting=key;h1.classList.add('is-greeting');
 const tail=who?`<span translate="no">${esc(who)}</span>!`:'Mukava nähdä!';
 const tailDe=who?`<span translate="no">${esc(who)}</span>!`:'Schön, dich zu sehen!';
 // Einmal umgedreht bleibt es Finnisch, auch wenn die Begrüßung neu aufgebaut wird (z. B. Name kommt später).
 const german=h1.dataset.flipped!=='1';
 h1.innerHTML=`<button type="button" class="greeting" aria-pressed="${german}" title="Übersetzung zeigen"><span class="greeting-face greeting-fi" lang="fi"${german?' aria-hidden="true"':''}><span class="intro-lead">${esc(g.fi)},</span><br><span class="intro-tail">${tail}</span></span><span class="greeting-face greeting-de" lang="de"${german?'':' aria-hidden="true"'}><span class="intro-lead">${esc(g.de)},</span><br><span class="intro-tail">${tailDe}</span></span></button>`;
 const button=h1.querySelector('.greeting');
 button.onclick=()=>{h1.dataset.flipped='1';showGerman(h1,button.getAttribute('aria-pressed')!=='true');};
 if(german)flipWhenShown(h1,()=>{if(h1.dataset.flipped==='1')return;h1.dataset.flipped='1';showGerman(h1,false);});
}
function showGerman(h1,on){
 const button=h1.querySelector('.greeting');if(!button)return;
 button.setAttribute('aria-pressed',String(on));
 button.querySelector('.greeting-fi').setAttribute('aria-hidden',String(on));
 button.querySelector('.greeting-de').setAttribute('aria-hidden',String(!on));
}

// Wartet, bis die Startseite komplett zu sehen ist (Intro vorbei, Daten geladen, Startseite aktiv),
// und dreht die Begrüßung dann nach zwei Sekunden auf Finnisch.
export const GREETING_FLIP_MS=2000;
function flipWhenShown(h1,flip){
 if(h1._flipWait)return;
 const html=document.documentElement,view=h1.closest('.app-view');
 const shown=()=>!html.classList.contains('intro-pending')&&!html.classList.contains('intro-running')&&!view?.hidden&&!view?.classList.contains('is-loading')&&!document.hidden;
 h1._flipWait=true;
 const check=()=>{
  if(h1.dataset.flipped==='1'){h1._flipWait=false;return;}
  if(!shown()){setTimeout(check,120);return;}
  setTimeout(()=>{h1._flipWait=false;if(shown())flip();else flipWhenShown(h1,flip);},GREETING_FLIP_MS);
 };
 check();
}

// ---------- Tagesziel, Woche, Serie ----------
export function weekActivity(daily={},date=new Date()){
 const monday=new Date(date);monday.setHours(12,0,0,0);monday.setDate(monday.getDate()-((monday.getDay()+6)%7));
 const today=dayKey(date);
 return WEEKDAYS.map(([short,long],i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const key=dayKey(d);return {short,long,key,count:Number(daily[key])||0,today:key===today,future:key>today};});
}
// Tage in Folge mit Übung; heute zählt mit, ein noch leerer heutiger Tag bricht die Serie nicht.
export function practiceStreak(daily={},date=new Date()){
 const d=new Date(date);d.setHours(12,0,0,0);
 if(!(Number(daily[dayKey(d)])>0))d.setDate(d.getDate()-1);
 let n=0;while(Number(daily[dayKey(d)])>0&&n<3660){n++;d.setDate(d.getDate()-1);}
 return n;
}

const RING_C=2*Math.PI*19;
export const GOAL_CHOICES=[5,10,20,30,50];
const CHEVRON='<svg class="today-chevron" viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let shownCount=null;
// Angemeldete: „heute geübt“ sitzt als kleine Pille im Header (auf allen Seiten sichtbar). Ein Klick klappt
// darunter Woche und Serie auf, ein Klick auf die Zahl öffnet die Auswahl fürs Tagesziel. Gäste: Kasten neben der Überschrift.
export function renderToday(box,{count,daily,account,date=new Date(),goal=DAILY_GOAL,onGoalChange}){
 if(!box)return;
 const counter=box.querySelector('#today-count');
 box.classList.toggle('is-account',account);
 const header=document.querySelector('header'),intro=document.querySelector('#home-view .intro');
 if(account&&header&&box.parentElement!==header)header.insertBefore(box,header.querySelector('.header-nav'));
 else if(!account&&intro&&box.parentElement!==intro)intro.append(box);
 if(!account){if(counter)counter.textContent=count;shownCount=null;return;}
 box._onGoalChange=onGoalChange;
 if(!box.querySelector('.today-ring')){
  const label=box.querySelector(':scope>div');
  box.insertAdjacentHTML('afterbegin',`<button type="button" class="today-ring" aria-haspopup="true" aria-expanded="false"><svg viewBox="0 0 44 44" aria-hidden="true"><circle class="today-ring-track" cx="22" cy="22" r="19"/><circle class="today-ring-fill" cx="22" cy="22" r="19" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${RING_C.toFixed(2)}"/></svg></button>`);
  box.querySelector('.today-ring').append(counter);
  if(label){label.classList.add('today-label');label.innerHTML=`<button type="button" class="today-toggle" aria-expanded="false" aria-controls="today-details">heute geübt${CHEVRON}</button>`;}
  box.insertAdjacentHTML('beforeend',`<div class="today-details" id="today-details" hidden><ol class="today-week" aria-label="Diese Woche"></ol><p class="today-streak"></p></div><div class="today-goal-picker" role="group" aria-label="Tagesziel wählen" hidden><p>Tagesziel</p><div>${GOAL_CHOICES.map(n=>`<button type="button" data-goal="${n}">${n}</button>`).join('')}</div></div>`);
  const ring=box.querySelector('.today-ring'),picker=box.querySelector('.today-goal-picker'),toggle=box.querySelector('.today-toggle'),details=box.querySelector('.today-details');
  const setOpen=on=>{details.hidden=!on;toggle?.setAttribute('aria-expanded',String(on));box.classList.toggle('details-open',on);};
  const setPicker=on=>{picker.hidden=!on;ring.setAttribute('aria-expanded',String(on));if(on)picker.querySelector('[aria-pressed="true"]')?.focus();};
  setOpen(false);
  box.addEventListener('click',e=>{
   const choice=e.target.closest('[data-goal]');
   if(choice){const n=Number(choice.dataset.goal);setPicker(false);ring.focus();box._onGoalChange?.(n);return;}
   if(e.target.closest('.today-goal-picker'))return;
   if(e.target.closest('.today-ring')){setOpen(false);setPicker(picker.hidden);return;}
   if(e.target.closest('.today-details'))return;
   setPicker(false);setOpen(details.hidden);
  });
  box.addEventListener('keydown',e=>{if(e.key!=='Escape')return;if(!picker.hidden){setPicker(false);ring.focus();}else if(!details.hidden){setOpen(false);toggle?.focus();}});
  document.addEventListener('click',e=>{if(box.contains(e.target))return;if(!picker.hidden)setPicker(false);if(!details.hidden)setOpen(false);});
 }
 const reached=count>=goal,fill=box.querySelector('.today-ring-fill');
 box.classList.toggle('goal-reached',reached);
 box.querySelector('.today-ring').setAttribute('aria-label',`${count} heute geübt, Tagesziel ${goal}${reached?' erreicht':''}. Tagesziel ändern`);
 box.querySelectorAll('[data-goal]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.goal)===goal)));
 const offset=(RING_C*(1-Math.min(1,count/goal))).toFixed(2);
 requestAnimationFrame(()=>requestAnimationFrame(()=>fill.setAttribute('stroke-dashoffset',offset)));
 box.querySelector('.today-week').innerHTML=weekActivity(daily,date).map(d=>`<li class="${d.count?'done':''}${d.today?' is-today':''}${d.future?' future':''}" title="${d.long}${d.count?`: ${d.count} geübt`:''}"><span aria-hidden="true">${d.short}</span><span class="sr-only">${d.long}${d.count?': geübt':d.future?'':': nicht geübt'}</span></li>`).join('');
 const streak=practiceStreak(daily,date);
 box.querySelector('.today-streak').innerHTML=streak?`<span class="today-flame" aria-hidden="true"></span>${streak===1?'1 Tag in Folge':`${streak} Tage in Folge`}`:'Starte heute deine Serie';
 countUp(counter,shownCount??0,count);shownCount=count;
}

export function countUp(el,from,to){
 if(!el)return;
 if(reducedMotion()||from===to){el.textContent=to;return;}
 const start=performance.now(),dur=Math.min(900,300+Math.abs(to-from)*40),token={};el._count=token;
 const step=now=>{if(el._count!==token)return;const t=Math.min(1,(now-start)/dur),e=1-Math.pow(1-t,3);el.textContent=Math.round(from+(to-from)*e);if(t<1)requestAnimationFrame(step);};
 requestAnimationFrame(step);
}

// Fortschrittsbalken sanft von 0 bzw. vom alten Wert füllen.
export function animateProgress(el,value){
 if(!el)return;
 const from=el._shown??0;el._shown=value;
 if(reducedMotion()||from===value){el.value=value;return;}
 const start=performance.now(),dur=700,token={};el._anim=token;
 const step=now=>{if(el._anim!==token)return;const t=Math.min(1,(now-start)/dur),e=1-Math.pow(1-t,3);el.value=from+(value-from)*e;if(t<1)requestAnimationFrame(step);};
 requestAnimationFrame(step);
}

// ---------- Satz des Tages ----------
const DAILY_KEY='vanamo-daily-sentence';
const hash=text=>{let h=2166136261;for(const c of text){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};
function fits(s){
 if(!s?.translations?.length||s.hidden)return false;
 const infos=lookupForSentence(s.text),words=splitSentence(s.text).filter(p=>p.index!==undefined);
 if(words.length<3||words.length>9||!infos||infos.length!==words.length)return false;
 return infos.every(i=>i&&shortGloss(i)&&shortGloss(i).length<=24);
}

// userKey: Konto-ID – jedes Konto bekommt seinen eigenen Satz, auf allen Geräten derselbe.
export function createDailySentence(root,{sentences,learnedIds,fallbackLevel=()=>1,sourceIcon=()=>'',userKey=()=>''}){
 let lexicon=null,sentence=null,cols=[],audio=null,poolKey='',pool=[],own=false;
 const storeKey=()=>{const user=String(userKey()||'');return user?`${DAILY_KEY}:${user}`:DAILY_KEY;};
 if(!root)return {render(){}};
 const stopAudio=()=>{if(audio){audio.pause();audio=null;}root.querySelector('.daily-audio')?.classList.remove('playing');};
 function buildPool(){
  const all=sentences()||[],ids=learnedIds();
  const key=all.length+':'+ids.size;if(key===poolKey)return;poolKey=key;
  const mine=all.filter(s=>ids.has(s.id)).filter(fits);
  own=mine.length>0;
  pool=own?mine:all.filter(s=>s.level===fallbackLevel()).filter(fits).slice(0,400);
 }
 // Ein Satz pro Tag und Konto: beim ersten Anzeigen festgehalten, damit er sich nicht ändert,
 // wenn im Laufe des Tages neue Sätze dazukommen. Am nächsten Tag wird neu gewählt.
 function pick(){
  const today=dayKey(new Date());
  const user=String(userKey()||'');
  let saved=null;try{saved=JSON.parse(localStorage.getItem(storeKey())||'null');}catch{}
  if(saved?.day===today){
   const kept=(sentences()||[]).find(s=>s.id===saved.id);
   if(kept&&fits(kept)){own=!!saved.own;return kept;}
  }
  if(!pool.length)return null;
  const chosen=pool[hash(user+'|'+today+(own?'m':'f'))%pool.length];
  try{localStorage.setItem(storeKey(),JSON.stringify({day:today,id:chosen.id,own}));}catch{}
  return chosen;
 }
 // Wörter und ihre Kurzbedeutungen; braucht die Wortanalyse.
 function columns(of=sentence){
  const infos=lookupForSentence(of.text)||[],list=[];
  for(const p of splitSentence(of.text)){
   if(p.index!==undefined)list.push({fi:p.text,gloss:shortGloss(infos[p.index])||''});
   else if(p.text.trim()&&list.length)list[list.length-1].fi+=p.text;
   else if(p.text.trim())list.push({fi:p.text,gloss:''});
  }
  return list;
 }
 // Die fertige Karte des Tages bleibt auf dem Gerät: Beim nächsten Öffnen steht sie sofort da,
 // ohne auf Sätze und Wortanalyse (zusammen mehrere hundert KB) zu warten.
 const validCard=entry=>{
  const card=entry?.card;
  return Boolean(card)&&card.sentence?.id===entry.id&&typeof card.sentence.text==='string'&&typeof card.sentence.translations?.[0]?.text==='string'
   &&Array.isArray(card.cols)&&card.cols.length>0&&card.cols.every(c=>typeof c?.fi==='string'&&typeof c?.gloss==='string');
 };
 const readStore=()=>{try{return JSON.parse(localStorage.getItem(storeKey())||'null');}catch{return null;}};
 // Mit der Karte von heute wird die von morgen gleich mit vorbereitet (gleiche Auswahlregel),
 // damit auch der erste Besuch des nächsten Tages nicht warten muss.
 function keepCard(){
  const today=dayKey(new Date()),tomorrow=dayKey(new Date(Date.now()+864e5)),user=String(userKey()||'');
  let next=null;
  if(pool.length){const s=pool[hash(user+'|'+tomorrow+(own?'m':'f'))%pool.length];next={day:tomorrow,id:s.id,own,card:{sentence:s,cols:columns(s)}};}
  try{localStorage.setItem(storeKey(),JSON.stringify({day:today,id:sentence.id,own,card:{sentence,cols},next}));}catch{}
 }
 function keptCard(){
  const saved=readStore(),today=dayKey(new Date());
  if(saved?.day===today&&validCard(saved))return saved;
  if(saved?.next?.day===today&&validCard(saved.next))return saved.next;
  return null;
 }
 // Wurde die Karte aus dem Vorrat gezeigt, fehlt die für morgen noch: in Ruhe nachholen.
 let preparing=false;
 function prepareTomorrow(){
  const saved=readStore(),tomorrow=dayKey(new Date(Date.now()+864e5));
  if(preparing||(saved?.day===dayKey(new Date())&&saved.next?.day===tomorrow))return;
  preparing=true;
  setTimeout(async()=>{
   try{await (lexicon||(lexicon=loadLexicon()));buildPool();if(sentence)keepCard();}catch{lexicon=null;}
   preparing=false;
  },3000);
 }
 function markup(){
  // Wie die Satzkarte der Gäste: der Satz groß, unter jedem Wort die Kurzbedeutung, darunter immer die Übersetzung.
  // Das Quellen-Symbol gehört zum Satz: es hängt am letzten Wort und bricht nie allein um.
  const words=cols.map((c,i)=>`<span class="guest-word" style="--i:${i}"><span class="guest-fi">${esc(c.fi)}${i===cols.length-1?`<span class="daily-source">${sourceIcon(sentence)}</span>`:''}</span><span class="guest-gloss"${c.gloss?' lang="de"':''}>${esc(c.gloss)}</span></span>`).join('');
  const t=sentence.translations[0];
  return `<div class="daily-sentence-top"><h2 id="daily-sentence-title">Satz des Tages</h2>${sentence.audios?.length?'<span class="daily-sentence-tools"><button type="button" class="daily-audio" aria-label="Anhören"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></svg></button></span>':''}</div>
<div class="guest-words daily-words" lang="fi">${words}</div>
<p id="daily-translation" class="daily-translation" lang="de">${esc(t.text)}${sourceIcon(t)}</p>`;
 }
 function paint(animate){
  root.innerHTML=markup();root.classList.toggle('is-entering',!!animate&&!reducedMotion());
  // Die Wörter blenden nacheinander ein.
  if(animate)setTimeout(()=>root.classList.remove('is-entering'),700+cols.length*70);
  const a=root.querySelector('.daily-audio');
  if(a)a.onclick=()=>{if(audio){stopAudio();return;}const url=audioURL(sentence?.audios?.[0]);if(!url)return;audio=new Audio(url);a.classList.add('playing');audio.onended=stopAudio;audio.onerror=stopAudio;audio.play().catch(stopAudio);};
 }
 return {
  // Zeigt die Karte nur für Angemeldete, sobald Sätze und Wortanalyse geladen sind.
  async render({account,ready}){
   if(!account){root.hidden=true;stopAudio();return;}
   // Karte von heute schon auf dem Gerät: sofort zeigen. Sind die Sätze geladen, muss es den Satz noch geben.
   const kept=keptCard();
   if(kept&&(!ready||(sentences()||[]).some(s=>s.id===kept.id))){
    if(sentence?.id!==kept.id||root.hidden||!root.firstChild){sentence=kept.card.sentence;cols=kept.card.cols;own=!!kept.own;root.hidden=false;paint(true);}
    if(ready)prepareTomorrow();
    return;
   }
   // Erster Besuch des Tages: die Wortanalyse schon holen, während die Sätze noch laden.
   if(!lexicon){lexicon=loadLexicon();lexicon.catch(()=>{});}
   if(!ready){root.hidden=true;stopAudio();return;}
   try{await lexicon;}catch{lexicon=null;root.hidden=true;return;}
   buildPool();
   const next=pick();
   if(!next){root.hidden=true;return;}
   if(sentence?.id!==next.id||root.hidden||!root.firstChild){sentence=next;cols=columns();root.hidden=false;paint(true);keepCard();}
  },
  stop:stopAudio
 };
}
