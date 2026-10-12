// Vanamo – Anmeldung für die Verwaltungsseite.
// Die Verwaltung hat kein eigenes Anmeldeformular: Sie nutzt die Sitzung, mit der man in der App angemeldet ist
// (gleicher Speicherplatz wie auth.js). Läuft das Zugangstoken ab, wird es wie in der App erneuert –
// über Web Locks abgestimmt, damit sich Tabs nicht gegenseitig die Sitzung beenden.
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js?v=2';

export const SESSION_KEY='suomi-auth-session-v1';

export function readSession(storage=globalThis.localStorage){
 try{const v=JSON.parse(storage.getItem(SESSION_KEY));return v?.access_token&&v?.refresh_token?v:null;}catch{return null;}
}

let session=null,refreshing=null;
const api=(path,options={})=>fetch(`${SUPABASE_URL}${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(options.headers||{})}});
const authHeaders=()=>session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{};

export function currentSession(){session=session||readSession();return session;}

async function refresh(){
 if(!session?.refresh_token)return false;
 if(refreshing)return refreshing;
 const used=session.refresh_token;
 const run=async()=>{
  const stored=readSession();
  if(stored&&stored.user?.id===session?.user?.id&&stored.refresh_token!==used){session=stored;return true;}
  const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:used})});
  if(!r.ok)return false;
  session=await r.json();
  try{localStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch{}
  return true;
 };
 const locks=globalThis.navigator?.locks;
 refreshing=locks?.request?locks.request('suomi-auth-refresh',run):run();
 try{return await refreshing;}finally{refreshing=null;}
}

/** Anfrage mit der Sitzung; bei abgelaufenem Token einmal erneuern und wiederholen. */
export async function request(path,options={}){
 currentSession();
 let r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
 if(r.status===401&&await refresh())r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
 return r;
}

const rpcError=async r=>{const v=await r.json().catch(()=>({}));return new Error(v.message||v.error||`Fehler ${r.status}`);};

/** Verwaltungs-API in der Datenbank (prüft dort selbst, ob man Admin ist). */
export async function adminApi(action,payload={}){
 const r=await request('/rest/v1/rpc/admin_api',{method:'POST',body:JSON.stringify({action,payload})});
 if(!r.ok)throw await rpcError(r);
 return r.json();
}
/** Gemeldete Sätze (vorhandene Qualitätsprüfung). */
export async function reviewApi(action,payload={}){
 const r=await request('/rest/v1/rpc/sentence_quality_review_api',{method:'POST',body:JSON.stringify({action,payload})});
 if(!r.ok)throw await rpcError(r);
 return r.json();
}
/** PayPal jetzt abfragen (Edge Function; höchstens alle 2 Minuten). */
export async function syncPaypal(){
 const r=await request('/functions/v1/paypal-sync',{method:'POST',body:'{}'});
 const v=await r.json().catch(()=>({}));
 if(!r.ok)throw new Error(v.error||`Fehler ${r.status}`);
 return v;
}
