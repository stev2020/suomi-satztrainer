// Vanamo – kleine Helfer für alle Seiten:
//  * Hinweisband (aus der Verwaltung, z. B. „Heute Wartung“)
//  * Rückmeldung an Vanamo (anonym, ohne Absender)
//  * Seitenfehler melden (anonym: nur bereinigter Fehlertext, Datei und Zeile, Seitenpfad, Browser- und Systemfamilie –
//    kein Konto, keine Eingaben, keine vollständige Adresse; höchstens 5 je Seitenaufruf, nur auf vanamo.app)
//  * Punkt „Verwaltung“ im Kontomenü – nur für Admins (die Datenbank entscheidet das)
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js?v=2';

const REPORT_HOSTS=['vanamo.app','www.vanamo.app','stev2020.github.io'];
const MAX_REPORTS=5;

/** Browserfamilie mit Hauptversion, z. B. "Chrome 129" – nie der ganze User-Agent. */
export function browserFamily(ua=''){
 for(const [token,name] of [['Edg','Edge'],['OPR','Opera'],['SamsungBrowser','Samsung'],['FxiOS','Firefox'],['Firefox','Firefox'],['CriOS','Chrome'],['Chrome','Chrome']]){
  const m=ua.match(new RegExp(token+'/(\\d+)'));if(m)return `${name} ${m[1]}`;
 }
 const safari=/Safari/.test(ua)&&ua.match(/Version\/(\d+)/);
 return safari?`Safari ${safari[1]}`:'Anderer';
}
/** Systemfamilie ohne Version. */
export function osFamily(ua=''){
 if(/Android/.test(ua))return 'Android';
 if(/iPhone|iPad|iPod/.test(ua))return 'iOS';
 if(/Windows/.test(ua))return 'Windows';
 if(/Mac OS X|Macintosh/.test(ua))return 'macOS';
 if(/CrOS/.test(ua))return 'ChromeOS';
 if(/Linux/.test(ua))return 'Linux';
 return 'Anderes';
}
/** Nur Dateiname, Zeile und Spalte einer Quelle („app.js:120:5“); fremde Skripte (Erweiterungen) → null. */
export function shortSource(file,line,col,origin){
 if(!file)return '';
 let u;try{u=new URL(file,origin);}catch{return null;}
 if(u.origin!==origin)return null;
 const name=u.pathname.split('/').pop()||'';
 return [name,line,col].filter(v=>v!==undefined&&v!==null&&v!=='').join(':');
}
/** Fehlertext ohne E-Mail-Adressen, Adressen-Parameter, lange Zahlen und Kennungen. */
export function cleanMessage(text=''){
 return String(text)
  .replace(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/gi,'[E-Mail]')
  .replace(/([?#])[^\s)'"]*/g,'')
  .replace(/[A-Za-z0-9_-]{24,}/g,'…')
  .replace(/\d{6,}/g,'#')
  .replace(/\s+/g,' ').trim().slice(0,300);
}
/** Lohnt sich die Meldung? (Browser-Rauschen und Erweiterungen weglassen.) */
export function worthReporting(message,source){
 if(!message||source===null)return false;
 if(/^Script error\.?$/i.test(message))return false;
 if(/ResizeObserver loop|extension:\/\/|NetworkError when attempting|Failed to fetch|Load failed|AbortError/i.test(message))return false;
 return true;
}

if(typeof document!=='undefined'){
 const rpc=(name,body,extra={})=>fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(extra.headers||{})},body:JSON.stringify(body),keepalive:!!extra.keepalive})
  .then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)));
 const $=id=>document.getElementById(id);
 const page=location.pathname.replace(/[^A-Za-z0-9._/-]/g,'').slice(0,58)||'/';
 const hosts=Array.isArray(globalThis.VANAMO_REPORT_HOSTS)?globalThis.VANAMO_REPORT_HOSTS:REPORT_HOSTS;

 // ---- Seitenfehler ----
 if(hosts.includes(location.hostname)){
  const sent=new Set();
  const report=(message,file,line,col)=>{
   const source=shortSource(file,line,col,location.origin),msg=cleanMessage(message);
   if(!worthReporting(msg,source)||sent.size>=MAX_REPORTS||sent.has(msg+source))return;
   sent.add(msg+source);
   const ua=navigator.userAgent||'';
   rpc('report_client_error',{p:{message:msg,source:source||'',page,browser:browserFamily(ua),os:osFamily(ua)}},{keepalive:true}).catch(()=>{});
  };
  addEventListener('error',e=>{const x=e.error,msg=x instanceof Error?`${x.name}: ${x.message}`:String(e.message||x||'').replace(/^Uncaught /,'');if(msg)report(msg,e.filename,e.lineno,e.colno);});
  addEventListener('unhandledrejection',e=>{
   const r=e.reason,msg=r instanceof Error?`${r.name}: ${r.message}`:String(r??'');
   const at=r?.stack?String(r.stack).match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/):null;
   report(msg,at?.[1]||'',at?.[2],at?.[3]);
  });
 }

 // ---- Hinweisband ----
 const NOTICE_SEEN='vanamo-notice-closed';
 rpc('app_settings',{}).then(s=>{
  window.vanamoSettings=s;
  try{dispatchEvent(new CustomEvent('vanamo:settings',{detail:s}));}catch{}
  const n=s?.notice;if(!n?.text)return;
  try{if(sessionStorage.getItem(NOTICE_SEEN)===n.text)return;}catch{}
  const band=document.createElement('div');
  band.className='site-notice'+(n.kind==='warn'?' warn':'');band.setAttribute('role',n.kind==='warn'?'alert':'status');
  const text=document.createElement('span');text.textContent=n.text;
  const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Hinweis schließen');
  close.addEventListener('click',()=>{band.remove();try{sessionStorage.setItem(NOTICE_SEEN,n.text);}catch{}});
  band.append(text,close);document.body.prepend(band);
 }).catch(()=>{});

 // ---- Rückmeldung ----
 function openFeedback(){
  let d=$('feedback-dialog');
  if(!d){
   document.body.insertAdjacentHTML('beforeend',`<dialog id="feedback-dialog" class="feedback-dialog" aria-labelledby="feedback-title"><div class="dialog-top"><h2 id="feedback-title">Rückmeldung an Vanamo</h2><button id="feedback-close" class="quiet" type="button" aria-label="Schließen">✕</button></div>
    <form id="feedback-form"><label for="feedback-text">Was möchtest du uns sagen?</label><textarea id="feedback-text" maxlength="1000" rows="5" placeholder="Ein Wunsch, eine Idee, etwas, das nicht klappt …"></textarea>
    <p class="feedback-hint">Anonym: ohne Namen und ohne E-Mail-Adresse – wir können dir deshalb nicht antworten. Bitte schreib keine persönlichen Daten hinein. Für eine Antwort schreib an <a href="mailto:hallo@vanamo.app">hallo@vanamo.app</a>.</p>
    <button class="primary" type="submit">Senden</button></form><p id="feedback-status" role="status"></p></dialog>`);
   d=$('feedback-dialog');
   $('feedback-close').addEventListener('click',()=>d.close());
   $('feedback-form').addEventListener('submit',async e=>{
    e.preventDefault();
    const text=$('feedback-text').value.trim(),button=e.target.querySelector('button[type=submit]'),status=$('feedback-status');
    if(text.length<3){status.textContent='Bitte schreib ein paar Worte mehr.';return;}
    button.disabled=true;status.textContent='Wird gesendet …';
    try{
     const r=await rpc('send_feedback',{p_message:text,p_page:page});
     if(r?.ok){e.target.hidden=true;status.textContent='Danke! Deine Rückmeldung ist angekommen.';}
     else{status.textContent='Gerade kommen sehr viele Rückmeldungen an. Bitte versuch es später noch einmal.';button.disabled=false;}
    }catch{status.textContent='Das hat nicht geklappt. Bitte versuch es später noch einmal.';button.disabled=false;}
   });
  }else{$('feedback-form').hidden=false;$('feedback-form').reset();$('feedback-status').textContent='';$('feedback-form').querySelector('button[type=submit]').disabled=false;}
  d.showModal();$('feedback-text').focus();
 }
 document.addEventListener('click',e=>{const a=e.target.closest('[data-feedback-open]');if(!a)return;e.preventDefault();openFeedback();});

 // ---- „Verwaltung“ im Kontomenü (nur für Admins) ----
 const ADMIN_KEY='vanamo-admin-check';
 async function adminEntry(){
  const items=$('account-menu-items');if(!items)return;
  let session=null;try{session=JSON.parse(localStorage.getItem('suomi-auth-session-v1'));}catch{}
  const old=$('account-admin');
  const drop=()=>{if(!old)return;const logout=$('logout');if(logout)logout.style.setProperty('--i',old.style.getPropertyValue('--i'));old.remove();};
  if(!session?.access_token||!session?.user?.id){drop();return;}
  let admin=null;
  try{const c=JSON.parse(sessionStorage.getItem(ADMIN_KEY)||'null');if(c?.user===session.user.id)admin=c.admin;}catch{}
  if(admin===null){
   try{
    const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_api`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action:'status',payload:{}})});
    if(!r.ok)return;
    admin=(await r.json())?.admin===true;
    try{sessionStorage.setItem(ADMIN_KEY,JSON.stringify({user:session.user.id,admin}));}catch{}
   }catch{return;}
  }
  if(!admin){drop();return;}
  if(old)return;
  const logout=$('logout');
  const b=document.createElement('button');b.id='account-admin';b.type='button';b.setAttribute('role','menuitem');
  b.innerHTML='<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg><span>Verwaltung</span>';
  b.style.setProperty('--i',logout?.style.getPropertyValue('--i')||'3');
  if(logout){logout.style.setProperty('--i',String(Number(b.style.getPropertyValue('--i'))+1));logout.before(b);}else items.append(b);
  b.addEventListener('click',()=>{location.href='admin.html';});
 }
 const later=()=>setTimeout(adminEntry,0);
 addEventListener('vanamo:session',()=>{try{sessionStorage.removeItem(ADMIN_KEY);}catch{}later();});
 if(document.readyState==='complete')later();else addEventListener('load',later);
}
