// Vanamo – Anmeldung für die Verwaltungsseite.
// Die Verwaltung hat eine eigene Anmeldung, getrennt von der App: eigenes Konto, Passwort und ein Code aus einer
// Authenticator-App (zweiter Faktor, TOTP). Die Sitzung liegt nur im sessionStorage dieses Tabs – Tab zu, Sitzung weg –
// und endet nach 30 Minuten ohne Bedienung. Ob jemand Admin ist und den zweiten Faktor benutzt hat, entscheidet
// die Datenbank bei jeder Anfrage (Anmeldestufe „aal2“ im Zugangstoken).
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js?v=2';

export const SESSION_KEY='vanamo-admin-session-v1';
export const IDLE_MINUTES=30;

const store={
 get(){try{const v=JSON.parse(sessionStorage.getItem(SESSION_KEY));return v?.access_token&&v?.refresh_token?v:null;}catch{return null;}},
 set(v){try{if(v)sessionStorage.setItem(SESSION_KEY,JSON.stringify(v));else sessionStorage.removeItem(SESSION_KEY);}catch{}},
};
let session=null,refreshing=null;
const api=(path,options={})=>fetch(`${SUPABASE_URL}${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(options.headers||{})}});
const authHeaders=()=>session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{};
const hex=s=>Array.from(new TextEncoder().encode(s)).map(b=>b.toString(16).padStart(2,'0')).join('');
const errorText=async(r,fallback)=>{const v=await r.json().catch(()=>({}));return v.msg||v.message||v.error_description||v.error||fallback;};

/** Benutzername wie in der App (Kleinbuchstaben, 3–32 Zeichen). */
export function normalizeUsername(v){
 const s=String(v||'').trim().toLowerCase();
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(s))throw new Error('Benutzername: 3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.');
 return s;
}
/** Die technische Adresse, unter der Supabase das Konto führt (aus dem Benutzernamen gebildet). */
export const technicalEmail=u=>`u${hex(u)}@users.suomi.invalid`;
/** Anmeldestufe aus dem Zugangstoken lesen: "aal1" (nur Passwort) oder "aal2" (mit Code). */
export function tokenLevel(token){
 try{const part=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(part+'='.repeat((4-part.length%4)%4))).aal||'aal1';}catch{return 'aal1';}
}

export function currentSession(){session=session||store.get();return session;}
export const level=()=>currentSession()?tokenLevel(session.access_token):null;
function save(v){session=v;store.set(v);}

async function refresh(){
 if(!session?.refresh_token)return false;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!r.ok){save(null);return false;}
  save(await r.json());return true;
 })();
 try{return await refreshing;}finally{refreshing=null;}
}
export async function request(path,options={}){
 currentSession();
 let r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
 if(r.status===401&&await refresh())r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
 return r;
}

export async function login(username,password){
 const name=normalizeUsername(username);
 if(!password)throw new Error('Bitte das Passwort eingeben.');
 const r=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:technicalEmail(name),password})});
 if(r.status===400||r.status===401)throw new Error('Benutzername oder Passwort stimmt nicht.');
 if(r.status===429)throw new Error('Zu viele Versuche. Bitte warte ein paar Minuten.');
 if(!r.ok)throw new Error(await errorText(r,'Anmeldung gerade nicht möglich.'));
 save(await r.json());
}
export async function logout(){
 if(session?.access_token)await api('/auth/v1/logout',{method:'POST',headers:authHeaders()}).catch(()=>{});
 save(null);
}

/** Eingerichtete Authenticator-Codes dieses Kontos. */
export async function factors(){
 const r=await request('/auth/v1/user');
 if(!r.ok)throw new Error(await errorText(r,'Konto konnte nicht geladen werden.'));
 return ((await r.json()).factors||[]).filter(f=>f.factor_type==='totp');
}
/** Neuen Authenticator einrichten: liefert QR-Code und Schlüssel zum Abtippen. Halb eingerichtete werden vorher entfernt. */
export async function enroll(){
 for(const f of (await factors()).filter(f=>f.status!=='verified'))await request(`/auth/v1/factors/${encodeURIComponent(f.id)}`,{method:'DELETE'}).catch(()=>{});
 const r=await request('/auth/v1/factors',{method:'POST',body:JSON.stringify({factor_type:'totp',friendly_name:'Vanamo Verwaltung',issuer:'Vanamo'})});
 if(!r.ok)throw new Error(await errorText(r,'Der zweite Faktor konnte nicht eingerichtet werden.'));
 const v=await r.json();
 return {id:v.id,qr:v.totp?.qr_code||'',secret:v.totp?.secret||''};
}
/** Code aus der App prüfen; danach gilt die Sitzung als „aal2“. */
export async function verify(factorId,code){
 const clean=String(code||'').replace(/\s+/g,'');
 if(!/^\d{6}$/.test(clean))throw new Error('Bitte den 6-stelligen Code aus der App eingeben.');
 const c=await request(`/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`,{method:'POST',body:'{}'});
 if(!c.ok)throw new Error(await errorText(c,'Code konnte nicht geprüft werden.'));
 const {id}=await c.json();
 const r=await request(`/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,{method:'POST',body:JSON.stringify({challenge_id:id,code:clean})});
 if(r.status===422||r.status===400)throw new Error('Der Code stimmt nicht. Bitte den aktuellen Code eingeben.');
 if(r.status===429)throw new Error('Zu viele Versuche. Bitte warte ein paar Minuten.');
 if(!r.ok)throw new Error(await errorText(r,'Code konnte nicht geprüft werden.'));
 save(await r.json());
}

const rpcError=async r=>new Error(await errorText(r,`Fehler ${r.status}`));
export async function adminApi(action,payload={}){
 const r=await request('/rest/v1/rpc/admin_api',{method:'POST',body:JSON.stringify({action,payload})});
 if(!r.ok)throw await rpcError(r);
 return r.json();
}
export async function reviewApi(action,payload={}){
 const r=await request('/rest/v1/rpc/sentence_quality_review_api',{method:'POST',body:JSON.stringify({action,payload})});
 if(!r.ok)throw await rpcError(r);
 return r.json();
}
export async function syncPaypal(){
 const r=await request('/functions/v1/paypal-sync',{method:'POST',body:'{}'});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(v.error||`Fehler ${r.status}`);
 return v;
}

/** Dateien entfernter Beiträge und gelöschter Räume aus dem Speicher räumen (nur Dateien ohne Eintrag). */
export async function sweepFiles(){
 const r=await request('/functions/v1/storage-sweep',{method:'POST',body:'{}'});
 if(!r.ok)throw new Error(await errorText(r,'Dateien konnten nicht aufgeräumt werden.'));
 return r.json();
}

/** Nach IDLE_MINUTES ohne Bedienung abmelden. */
export function watchIdle(onTimeout){
 let timer=null;
 const reset=()=>{clearTimeout(timer);timer=setTimeout(async()=>{await logout();onTimeout();},IDLE_MINUTES*60000);};
 for(const ev of ['pointerdown','keydown','scroll'])addEventListener(ev,reset,{passive:true});
 reset();
}
