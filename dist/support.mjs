// Vanamo – Seite „Unterstützen“.
//
// Drei Werte werden hier von Hand gepflegt:
//  DONORBOX_URL    Adresse des Donorbox-Formulars (z. B. https://donorbox.org/vanamo). Solange sie leer ist,
//                  bleibt der Knopf gesperrt und die Seite sagt offen, dass die Zahlung noch eingerichtet wird.
//                  Betrag und Rhythmus werden in der Adresse mitgegeben (amount, default_interval a/m);
//                  „Einmalig“ ist die Grundeinstellung des Formulars bei Donorbox.
//                  Die Seite lädt nichts von Donorbox – erst der Klick öffnet das Formular in einem neuen Tab.
//  MONTH_GOAL      Monatsziel in Euro (Balken ist dann voll).
//  MONTH_RECEIVED  In diesem Monat eingegangener Betrag in Euro.
import {createSwarm,cleanName} from './support-swarm.mjs?v=2';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js?v=2';

export const DONORBOX_URL='https://donorbox.org/vanamo';
export const MONTH_GOAL=10;
export const MONTH_RECEIVED=0;

// Je drei Beträge wie im Donorbox-Formular, der mittlere ist vorausgewählt.
export const AMOUNTS={einmal:[5,10,20],monat:[3,5,10],jahr:[12,24,36]};
export const DEFAULT_AMOUNT={einmal:10,monat:5,jahr:24};

/** Füllstand des Monatsziels in Prozent (0–100). */
export function goalPercent(received=MONTH_RECEIVED,goal=MONTH_GOAL){
 if(!(goal>0)||!(received>0))return 0;
 return Math.min(100,Math.round(received/goal*100));
}
const euro=n=>String(n).replace('.',',')+' €';
/** Beschriftung des Hauptknopfs. */
export function ctaLabel(mode,amount){
 if(mode==='jahr')return `Mit ${euro(amount)} im Jahr unterstützen`;
 if(mode==='monat')return `Mit ${euro(amount)} im Monat unterstützen`;
 return `Einmalig ${euro(amount)} geben`;
}
/** Adresse des Donorbox-Formulars mit vorausgewähltem Betrag und Rhythmus. */
export function donateUrl(base,mode,amount){
 if(!base)return '';
 const u=new URL(base);
 u.searchParams.set('amount',String(amount));
 if(mode==='jahr')u.searchParams.set('default_interval','a');
 else if(mode==='monat')u.searchParams.set('default_interval','m');
 u.searchParams.set('language','de');
 return u.href;
}
// Schwarm: Wer das Häkchen setzt, bekommt einen Zufallsschlüssel; der Vorname wartet damit in Supabase.
// Donorbox leitet nach der Zahlung auf unterstuetzen.html?danke=1 zurück – erst dann wird der Name sichtbar.
export const PENDING_KEY='vanamo-support-name';
export const PENDING_DAYS=3;
/** Liegt ein vorgemerkter Name noch innerhalb der Frist? */
export function pendingValid(entry,now=Date.now()){
 return !!entry&&/^[0-9a-f]{64}$/.test(entry.token||'')&&!!cleanName(entry.name)&&Number.isFinite(entry.at)&&now-entry.at>=0&&now-entry.at<PENDING_DAYS*86400000;
}
/** Text für Screenreader: wer gerade im Schwarm fliegt. */
export function swarmListText(names=[],former=0){
 const list=names.map(n=>n.name);
 if(!list.length&&!former)return 'Im Schwarm ist noch kein Name.';
 let text=list.length?'Im Schwarm: '+list.join(', ')+'.':'';
 if(former)text+=(text?' ':'')+(former===1?'Dazu 1 frühere Unterstützung.':`Dazu ${former} frühere Unterstützungen.`);
 return text;
}
/** Danke-Zeile nach der Rückkehr von Donorbox. */
export function thanksText(name){
 return name?`Danke, ${name}! Dein Name fliegt jetzt im Schwarm mit.`:'Danke für deine Unterstützung!';
}

/** Hinweiszeile unter den Beträgen. */
export function hintText(mode,amount){
 if(mode==='monat')return 'Für 1 € im Monat: wähle „Jährlich“. So geht weniger an Gebühren verloren.';
 return '';
}

if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
 const rpc=(name,body,opts={})=>fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),...opts})
  .then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)));
 const store={get(){try{return JSON.parse(localStorage.getItem(PENDING_KEY)||'null');}catch{return null;}},
  set(v){try{localStorage.setItem(PENDING_KEY,JSON.stringify(v));}catch{}},clear(){try{localStorage.removeItem(PENDING_KEY);}catch{}}};

 // ---- Schwarm ----
 const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const swarm=createSwarm($('support-swarm'),{reducedMotion:reduced});
 const thanks=$('support-thanks');
 async function loadSwarm(freshName=''){
  try{
   const data=await rpc('support_swarm',{});
   const names=Array.isArray(data?.names)?data.names.filter(n=>cleanName(n?.name)):[],former=Math.max(0,Number(data?.former)||0);
   swarm.setData({names,former},{freshName});
   $('support-swarm-empty').hidden=names.length>0||former>0;
   $('support-swarm-list').textContent=swarmListText(names,former);
   // Das Häkchen gibt es nur, wenn der Schwarm erreichbar ist – sonst würde ein Name nie erscheinen.
   $('support-name-block').hidden=false;
  }catch{swarm.setData({names:[],former:0});}
 }
 (async()=>{
  const params=new URLSearchParams(location.search);
  if(!params.has('danke')){loadSwarm();return;}
  history.replaceState(null,'',location.pathname+location.hash);
  const pending=store.get();let name='';
  if(pendingValid(pending)){
   try{const r=await rpc('support_name_activate',{p_token:pending.token});if(r?.ok)name=cleanName(r.name)||'';store.clear();}catch{}
  }else if(pending)store.clear();
  thanks.textContent=thanksText(name);thanks.hidden=false;
  loadSwarm(name);
 })();

 // ---- Häkchen und Vorname ----
 const ok=$('support-name-ok'),nameInput=$('support-name'),nameError=$('support-name-error');
 ok.addEventListener('change',()=>{nameInput.disabled=!ok.checked;nameError.textContent='';if(ok.checked)nameInput.focus();});
 nameInput.addEventListener('input',()=>{nameError.textContent='';});
 /** true = es darf zu Donorbox weitergehen. */
 function prepareName(){
  if(!ok.checked)return true;
  const name=cleanName(nameInput.value);
  if(!name){nameError.textContent='Bitte gib einen Vornamen mit 2 bis 20 Buchstaben ein – oder nimm das Häkchen weg.';nameInput.focus();return false;}
  const bytes=crypto.getRandomValues(new Uint8Array(32)),token=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  store.set({token,name,at:Date.now()});
  rpc('support_name_submit',{p_name:name,p_token:token},{keepalive:true}).then(r=>{
   if(r?.ok===false&&r.error==='name'){store.clear();nameError.textContent='Dieser Name kann leider nicht im Schwarm erscheinen. Deine Unterstützung zählt natürlich trotzdem.';}
  }).catch(()=>{});
  return true;
 }
 let mode='jahr',amount=DEFAULT_AMOUNT.jahr;
 const amounts=$('support-amounts'),cta=$('support-cta'),hint=$('support-hint');
 function render(){
  document.querySelectorAll('[data-support-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.supportMode===mode)));
  amounts.replaceChildren(...AMOUNTS[mode].map(a=>{
   const b=document.createElement('button');
   b.type='button';b.dataset.supportAmount=String(a);b.textContent=euro(a);
   b.setAttribute('aria-pressed',String(a===amount));
   return b;
  }));
  hint.textContent=hintText(mode,amount);
  cta.textContent=ctaLabel(mode,amount);
 }
 document.querySelectorAll('[data-support-mode]').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.supportMode;amount=DEFAULT_AMOUNT[mode];render();}));
 amounts.addEventListener('click',e=>{const b=e.target.closest('[data-support-amount]');if(!b)return;amount=Number(b.dataset.supportAmount);render();});
 render();

 if(DONORBOX_URL){
  cta.disabled=false;
  cta.addEventListener('click',()=>{if(!prepareName())return;window.open(donateUrl(DONORBOX_URL,mode,amount),'_blank','noopener');});
  $('support-provider').textContent='Sicher bezahlen über Donorbox mit PayPal.';
 }

 const percent=goalPercent(),bar=$('support-goal-bar');
 bar.setAttribute('aria-valuenow',String(percent));
 bar.firstElementChild.style.width=percent+'%';

 const star=$('support-star'),note=$('support-note');
 const showNote=open=>{note.hidden=!open;star.setAttribute('aria-expanded',String(open));};
 star.addEventListener('click',e=>{e.stopPropagation();showNote(note.hidden);});
 $('support-note-close').addEventListener('click',()=>{showNote(false);star.focus();});
 document.addEventListener('click',e=>{if(!note.hidden&&!note.contains(e.target))showNote(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!note.hidden){showNote(false);star.focus();}});

 const copy=$('support-copy'),status=$('support-copy-status'),link='https://vanamo.app/';
 copy.addEventListener('click',async()=>{
  try{await navigator.clipboard.writeText(link);status.textContent='Link kopiert.';}
  catch{status.textContent=link;}
 });
}
