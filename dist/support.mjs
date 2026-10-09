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
export const DONORBOX_URL='https://donorbox.org/vanamo';
export const MONTH_GOAL=10;
export const MONTH_RECEIVED=0;

export const AMOUNTS={jahr:[12,24,36,60],monat:[3,5,10],einmal:[3,5,10,20]};
export const DEFAULT_AMOUNT={jahr:12,monat:3,einmal:5};

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
/** Hinweiszeile unter den Beträgen. */
export function hintText(mode,amount){
 if(mode==='jahr')return `${euro(amount)} im Jahr – das ist ${euro(Math.round(amount/12*100)/100)} im Monat.`;
 if(mode==='monat')return 'Für 1 € im Monat: wähle „Jährlich“. So geht weniger an Gebühren verloren.';
 return '';
}

if(typeof document!=='undefined'){
 const $=id=>document.getElementById(id);
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
  cta.addEventListener('click',()=>{window.open(donateUrl(DONORBOX_URL,mode,amount),'_blank','noopener');});
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
