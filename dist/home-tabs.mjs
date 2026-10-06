// Startseite für Angemeldete: drei Reiter statt einer langen Seite.
//   „Willkommen“  – Begrüßung, Satz des Tages, zwei Knöpfe (Wiederholen, Neue Sätze)
//   „Üben“        – die Wiederholung und darunter alle Übungen als Kacheln
//   „Neue Sätze“  – der Lernpfad mit der ganzen Route
// Die Abschnitte der Startseite tragen data-home-panel="welcome|practice|new"; welcher zu sehen ist,
// regelt style.css über #home-view[data-home-tab]. Gäste behalten die eine Seite ohne Reiter.
// Auf dem Handy liegt die Reiterleiste fest am unteren Rand (style.css).

export const HOME_TABS=['welcome','practice','new'];
const TAB_KEY='vanamo-home-tab',DAY_KEY='vanamo-home-tab-day';
export const localDay=(date=new Date())=>date.toLocaleDateString('sv-SE');

// Womit die Startseite aufgeht: mit dem Intro immer „Willkommen“ (dort wird der Satz des Tages geschrieben);
// wer in diesem Browser-Tab schon einen Reiter gewählt hat, bleibt dort; sonst beim ersten Öffnen am Tag
// „Willkommen“ und danach direkt „Üben“.
export function initialHomeTab({intro=false,sessionTab='',lastDay='',day=localDay()}={}){
 if(intro)return 'welcome';
 if(HOME_TABS.includes(sessionTab))return sessionTab;
 return lastDay===day?'practice':'welcome';
}

const read=(store,key)=>{try{return store.getItem(key)||'';}catch{return '';}};
const write=(store,key,value)=>{try{store.setItem(key,value);}catch{}};

export function createHomeTabs({home,nav,isAccount,startReview,startNew}){
 const html=document.documentElement;
 const buttons=[...nav.querySelectorAll('[data-home-tab-button]')];
 const forcedOpen=[...home.querySelectorAll('#more-exercises,.path-details')];
 let current=initialHomeTab({intro:html.classList.contains('intro-pending')||html.classList.contains('intro-running'),sessionTab:read(sessionStorage,TAB_KEY),lastDay:read(localStorage,DAY_KEY)});
 let active=null;
 const fixed=()=>getComputedStyle(nav).position==='fixed';

 function paint(){
  for(const b of buttons){const on=b.dataset.homeTabButton===current;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;b.classList.toggle('selected',on);}
  if(active)home.dataset.homeTab=current;else delete home.dataset.homeTab;
 }
 function select(tab,{focus=false,scroll=true}={}){
  if(!HOME_TABS.includes(tab))return;
  const changed=tab!==current;current=tab;
  write(sessionStorage,TAB_KEY,tab);
  paint();
  if(focus)buttons.find(b=>b.dataset.homeTabButton===tab)?.focus();
  // Am Handy liegt die Leiste unten: Der neue Reiter beginnt oben, nicht mitten in der alten Scrollposition.
  if(changed&&scroll&&active&&fixed()&&window.scrollY>0)window.scrollTo({top:0});
 }
 // Reiter gibt es nur mit Konto. „Weitere Übungen“ und die Route stehen dort offen da (keine Aufklapper).
 function sync(){
  const now=!!isAccount();
  if(now!==active){
   active=now;nav.hidden=!now;html.classList.toggle('has-home-tabs',now);
   for(const d of forcedOpen)d.open=now;
   // Verbformen haben für Gäste eine eigene Karte; mit Reitern sind sie eine Kachel wie die anderen.
   const verbs=home.querySelector('[data-home-activity="verbs"]');if(verbs)verbs.hidden=!now;
   // In diesem Browser-Tab bleibt der Reiter auch beim Neuladen; „heute schon geöffnet“ gilt erst für den nächsten Tab.
   if(now){write(localStorage,DAY_KEY,localDay());write(sessionStorage,TAB_KEY,current);}
  }
  paint();
 }
 for(const d of forcedOpen)d.addEventListener('toggle',()=>{if(active&&!d.open)d.open=true;});
 for(const b of buttons)b.addEventListener('click',()=>select(b.dataset.homeTabButton));
 nav.addEventListener('keydown',e=>{
  const step=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!step)return;
  e.preventDefault();select(HOME_TABS[(HOME_TABS.indexOf(current)+step+HOME_TABS.length)%HOME_TABS.length],{focus:true});
 });
 // „Willkommen“: Die zwei Knöpfe starten direkt; gibt es gerade nichts zu starten, führen sie zum Reiter.
 home.querySelector('#welcome-review')?.addEventListener('click',()=>{if(!startReview())select('practice');});
 home.querySelector('#welcome-new')?.addEventListener('click',()=>{if(!startNew())select('new');});
 // Nach dem Antippen einer Kachel steht die gewählte Übung darunter – dorthin gleiten, falls sie nicht im Bild ist.
 home.querySelector('.home-exercises')?.addEventListener('click',e=>{
  if(!active||!e.target.closest?.('[data-home-activity]'))return;
  const session=home.querySelector('#home-session');if(!session)return;
  requestAnimationFrame(()=>{
   const r=session.getBoundingClientRect(),room=innerHeight-(fixed()?nav.offsetHeight:0);
   if(r.bottom>room||r.top<0)session.scrollIntoView({block:r.height>room?'start':'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  });
 });
 sync();
 return {sync,select,get current(){return current;},get active(){return !!active;}};
}
