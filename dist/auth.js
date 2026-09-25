import {uiLocale} from './i18n.mjs?v=1';
import {mergeVerbProgress} from './verb-practice.mjs';
import {mergePerformanceEvents} from './learning-insights.mjs';
import {mergeGames} from './games-progress.mjs';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js';

const STORE='suomi-learning-v1';
const SESSION='suomi-auth-session-v1';
const $=id=>document.getElementById(id);
let session=null,lastSnapshot='',timer=null,syncInFlight=null,syncQueued=false,syncReady=false,deletionManifest=null;

const configured=()=>/^https:\/\/.+\.supabase\.co$/.test(SUPABASE_URL)&&SUPABASE_PUBLISHABLE_KEY.length>20;
const normalizeUsername=v=>{
  const s=String(v||'').trim().toLowerCase();
  if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(s)) throw new Error('Benutzername: 3–32 Zeichen, nur a–z, 0–9, Punkt, Unterstrich und Bindestrich.');
  return s;
};
const checkPassword=v=>{
  const s=String(v||'');
  if(s.length<8||s.length>200) throw new Error('Das Passwort muss 8–200 Zeichen lang sein.');
};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hex=s=>Array.from(new TextEncoder().encode(s)).map(b=>b.toString(16).padStart(2,'0')).join('');
const technicalEmail=u=>`u${hex(u)}@users.suomi.invalid`;
const api=(path,options={})=>fetch(`${SUPABASE_URL}${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(options.headers||{})}});
const authHeaders=()=>session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{};
const status=(t,error=false)=>{const el=$('account-status');if(el){el.textContent=t;el.classList.toggle('error',error);}};
const syncState=(t,error=false)=>{
  const detail=$('account-sync');if(detail){detail.textContent=t;detail.classList.toggle('error',error);}
  const home=$('storage-note');if(home){home.textContent=`Konto verbunden · ${t}`;home.classList.toggle('error',error);}
};
const stableJSON=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item).sort().reduce((out,key)=>(out[key]=item[key],out),{}):item);
const localLearning=()=>{try{return JSON.parse(localStorage.getItem(STORE))||null}catch{return null}};
const currentLearning=()=>window.suomiLearningState?.snapshot?.()||localLearning();
function saveSession(v){session=v;if(v)localStorage.setItem(SESSION,JSON.stringify(v));else localStorage.removeItem(SESSION);renderAccount();}
function loadSession(){try{const v=JSON.parse(localStorage.getItem(SESSION));if(v?.access_token&&v?.refresh_token)session=v}catch{}}

// Only an explicitly rejected refresh token ends the session. Server errors (5xx),
// rate limits (429) and network failures keep the session and the local learning
// state, so answers that are not synchronized yet are never thrown away.
let refreshInFlight=null;
async function refreshSession(){
  if(!session?.refresh_token)return false;
  if(refreshInFlight)return refreshInFlight;
  refreshInFlight=(async()=>{
    const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});
    if(r.status===400||r.status===401){localStorage.removeItem(STORE);saveSession(null);location.reload();return false}
    if(!r.ok){syncState('Server gerade nicht erreichbar. Dein Lernstand bleibt auf diesem Gerät gespeichert.',true);return false}
    saveSession(await r.json());return true;
  })();
  try{return await refreshInFlight}finally{refreshInFlight=null}
}
async function request(path,options={}){
  let r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
  if(r.status===401&&await refreshSession())r=await api(path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
  return r;
}
function mergeLearning(local,cloud){
  if(!local)return cloud;if(!cloud)return local;
  const out={...cloud,...local,reviews:{...(cloud.reviews||{})},daily:{...(cloud.daily||{})},reports:{...(cloud.reports||{})},writingRatings:{...(cloud.writingRatings||{})},performanceEvents:mergePerformanceEvents(cloud.performanceEvents||[],local.performanceEvents||[])};
  out.favorites=[...new Set([...(cloud.favorites||[]),...(local.favorites||[])])];
  for(const [k,v] of Object.entries(local.reviews||{})){const old=out.reviews[k],a=Number(v.updatedAt)||0,b=Number(old?.updatedAt)||0;if(!old||a>b||(a===b&&(Number(v.repetitions)||0)>(Number(old.repetitions)||0)))out.reviews[k]=v}
  for(const [d,n] of Object.entries(local.daily||{}))out.daily[d]=Math.max(Number(out.daily[d])||0,Number(n)||0);
  for(const f of ['reports','writingRatings'])for(const [k,v] of Object.entries(local[f]||{}))if(!out[f][k]||(Number(v.updatedAt)||0)>(Number(out[f][k].updatedAt)||0))out[f][k]=v;
  out.verbProgress=mergeVerbProgress(cloud.verbProgress,local.verbProgress);
  out.games=mergeGames(cloud.games,local.games);
  out.prefs={...(cloud.prefs||{}),...(local.prefs||{})};
  return out;
}
async function cloudLearning(){
  const r=await request('/rest/v1/learning_state?select=state,updated_at&limit=1');
  if(!r.ok)throw new Error('Der Online-Lernstand konnte nicht geladen werden.');
  const rows=await r.json();return rows[0]?.state||null;
}
async function synchronizeLearning(state=currentLearning(),reloadIfChanged=true,silent=false){
  if(!session?.user||!state)return;
  if(syncInFlight)return syncInFlight;
  clearTimeout(timer);syncQueued=false;
  let succeeded=false;
  syncInFlight=(async()=>{
    if(!silent)syncState('Synchronisierung läuft …');
    // Merge before writing so another device's newer answers are retained.
    const cloud=await cloudLearning();
    const merged=mergeLearning(mergeLearning(currentLearning(),state),cloud);
    const changed=stableJSON(merged)!==stableJSON(currentLearning());
    // Apply before the upload: answers made while POST is pending must remain
    // in memory and local storage and be sent by the queued follow-up.
    localStorage.setItem(STORE,JSON.stringify(merged));
    let applied=false;
    if(changed&&reloadIfChanged)applied=!!window.suomiLearningState?.applyCloud?.(merged);
    const acceptedSnapshot=stableJSON(currentLearning());
    const r=await request('/rest/v1/learning_state?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:session.user.id,state:merged,updated_at:new Date().toISOString()})});
    if(!r.ok)throw new Error('Der Lernstand konnte nicht synchronisiert werden.');
    // The app can normalize fields/order when applying cloud data. Compare
    // future edits with that accepted app snapshot, not the raw cloud object.
    lastSnapshot=acceptedSnapshot;succeeded=true;
    if(!silent)syncState(`Synchronisiert · ${new Date().toLocaleTimeString(uiLocale,{hour:'2-digit',minute:'2-digit'})}`);
    if(changed&&reloadIfChanged&&!applied)location.reload();
    return merged;
  })();
  try{return await syncInFlight}finally{
    syncInFlight=null;
    if(succeeded&&syncQueued)scheduleSync();
  }
}
async function uploadLearning(state=currentLearning()){return synchronizeLearning(state,false)}
async function pullAndMerge(){return synchronizeLearning(currentLearning(),true)}
function syncError(){syncState('Synchronisierung fehlgeschlagen. Bitte erneut versuchen.',true)}
function syncChangedNow(){
  clearTimeout(timer);
  if(!session?.user||!syncReady||syncInFlight)return;
  syncQueued=false;
  const current=currentLearning(),snapshot=stableJSON(current);
  if(snapshot!==lastSnapshot)synchronizeLearning(current,true,false).catch(syncError);
}
function scheduleSync(){
  if(!session?.user)return;
  syncQueued=true;
  clearTimeout(timer);
  if(syncReady&&!syncInFlight)timer=setTimeout(syncChangedNow,500);
}
function renderAccount(){
  const logged=!!session?.user;
  $('account-logged-out')?.toggleAttribute('hidden',logged);
  $('account-logged-in')?.toggleAttribute('hidden',!logged);
  if(logged&&$('account-name'))$('account-name').textContent=session.user.user_metadata?.username||'Nutzer';
  document.body.dataset.account=logged?'authenticated':'guest';
  if($('account-button'))$('account-button').textContent=logged?'Konto':'Anmelden / Registrieren';
  if($('progress-nav'))$('progress-nav').hidden=!logged;
  if(logged)syncState('Synchronisierung wird geprüft …');else if($('storage-note'))$('storage-note').classList.remove('error');
}
async function login(username,password,syncCloud=true,seedState=null){
  username=normalizeUsername(username);checkPassword(password);
  const r=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:technicalEmail(username),password})});
  if(!r.ok)throw new Error('Benutzername oder Passwort ist falsch.');
  if(syncCloud)localStorage.removeItem(STORE);
  saveSession(await r.json());
  if(seedState)localStorage.setItem(STORE,JSON.stringify(seedState));
  if(syncCloud)await pullAndMerge();else await uploadLearning(seedState||localLearning());
}
async function register(username,password){
  username=normalizeUsername(username);checkPassword(password);
  const r=await api('/functions/v1/register',{method:'POST',body:JSON.stringify({username,password})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Registrierung fehlgeschlagen.');
  const guestState=currentLearning();await login(username,password,false,guestState);return result.recoveryCode;
}
async function recover(username,recoveryCode,newPassword){
  username=normalizeUsername(username);checkPassword(newPassword);
  const r=await api('/functions/v1/recover',{method:'POST',body:JSON.stringify({username,recoveryCode:String(recoveryCode||'').trim().toUpperCase(),newPassword})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Wiederherstellung fehlgeschlagen.');
  await login(username,newPassword,true);return result.recoveryCode;
}
async function loadDeletionManifest(){
  const r=await request('/rest/v1/rpc/account_deletion_manifest',{method:'POST',body:'{}'});
  const result=await r.json().catch(()=>null);
  if(!r.ok||!result)throw new Error('Die Kontodaten konnten nicht geladen werden.');
  deletionManifest=result;return result;
}
function renderDeletionRooms(manifest){
  const rooms=Array.isArray(manifest.rooms)?manifest.rooms:[];
  $('delete-account-rooms').innerHTML=rooms.length?rooms.map(room=>{
    const teachers=Array.isArray(room.teachers)?room.teachers:[];
    if(!teachers.length)return `<section class="account-delete-room"><strong>${escapeHTML(room.name)}</strong><p>Keine weitere Lehrkraft vorhanden: Dieser Klassenraum wird vollständig gelöscht.</p><input type="hidden" data-delete-room="${escapeHTML(room.id)}" value=""></section>`;
    return `<section class="account-delete-room"><label>${escapeHTML(room.name)}<select data-delete-room="${escapeHTML(room.id)}" required><option value="">Bitte auswählen</option>${teachers.map(teacher=>`<option value="${escapeHTML(teacher.id)}">An ${escapeHTML(teacher.name)} übertragen</option>`).join('')}<option value="delete">Klassenraum vollständig löschen</option></select></label></section>`;
  }).join(''):'<p>Du besitzt keine Klassenräume. Es ist keine Übergabe erforderlich.</p>';
}
function deletionDecisions(){
  if(!deletionManifest)throw new Error('Die Klassenraum-Auswahl wurde noch nicht geladen.');
  return [...document.querySelectorAll('[data-delete-room]')].map(input=>{
    if(input.tagName==='SELECT'&&!input.value)throw new Error('Bitte entscheide für jeden eigenen Klassenraum.');
    return {room_id:input.dataset.deleteRoom,new_owner_id:input.value&&input.value!=='delete'?input.value:null};
  });
}
async function deleteAccount(username,password,decisions){
  username=normalizeUsername(username);checkPassword(password);
  const r=await request('/functions/v1/delete-account',{method:'POST',body:JSON.stringify({username,password,decisions})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Das Konto konnte nicht gelöscht werden.');
  clearTimeout(timer);syncQueued=false;syncReady=false;
  localStorage.removeItem(STORE);localStorage.removeItem(SESSION);
  try{sessionStorage.removeItem('suomi-guest-exercise-accepted')}catch{}
  session=null;location.reload();
}
async function logout(){
  clearTimeout(timer);
  // Send pending answers before the local copy is removed (at most 5 seconds).
  const current=currentLearning();
  if(session?.user&&current&&stableJSON(current)!==lastSnapshot){
    syncState('Letzte Änderungen werden gespeichert …');
    await Promise.race([(syncInFlight||Promise.resolve()).then(()=>synchronizeLearning(currentLearning(),false,true)).catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);
  }
  if(session?.access_token)await api('/auth/v1/logout',{method:'POST',headers:authHeaders()}).catch(()=>{});
  localStorage.removeItem(STORE);
  saveSession(null);
  location.reload();
}
function addDialog(){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="account-dialog" aria-labelledby="account-title"><div class="dialog-top"><h2 id="account-title">Dein Konto</h2><button id="close-account" class="quiet" aria-label="Schließen">✕</button></div><div id="account-unconfigured" hidden><p>Die Kontofunktion ist vorbereitet, aber die Serververbindung ist noch nicht aktiviert.</p></div><div id="account-logged-out"><div class="account-tabs"><button type="button" data-account-tab="login" class="selected">Anmelden</button><button type="button" data-account-tab="register">Registrieren</button><button type="button" data-account-tab="recover">Passwort vergessen</button></div><form id="login-form" class="account-form"><label>Benutzername<input id="login-name" autocomplete="username" required></label><label>Passwort<input id="login-password" type="password" autocomplete="current-password" required minlength="8"></label><button class="primary" type="submit">Anmelden</button></form><form id="register-form" class="account-form" hidden><label>Benutzername<input id="register-name" autocomplete="username" required></label><label>Passwort<input id="register-password" type="password" autocomplete="new-password" required minlength="8"></label><button class="primary" type="submit">Konto erstellen</button><p class="account-hint">Keine E-Mail nötig. Danach erhältst du einmalig einen Wiederherstellungscode.</p></form><form id="recover-form" class="account-form" hidden><label>Benutzername<input id="recover-name" autocomplete="username" required></label><label>Wiederherstellungscode<input id="recover-code" autocomplete="off" required></label><label>Neues Passwort<input id="recover-password" type="password" autocomplete="new-password" required minlength="8"></label><button class="primary" type="submit">Passwort neu setzen</button></form></div><div id="account-logged-in" hidden><p>Angemeldet als <strong id="account-name"></strong></p><p id="account-sync">Synchronisierung wird geprüft …</p><button id="sync-now" class="quiet" type="button">Jetzt synchronisieren</button><button id="logout" class="quiet" type="button">Abmelden</button><button id="delete-account-open" class="quiet account-danger" type="button">Konto löschen</button><form id="delete-account-form" class="account-form account-delete-form" hidden><h3>Konto endgültig löschen</h3><p>Dein Konto, Lernstand, Beiträge, Abgaben, Meldungen und Mitgliedschaften werden unwiderruflich gelöscht. Eigene Klassenräume kannst du an eine dort aktive Lehrkraft übergeben; ohne Übergabe werden sie mitsamt allen Inhalten gelöscht.</p><div id="delete-account-rooms"></div><label>Benutzername zur Bestätigung<input id="delete-account-name" autocomplete="off" required></label><label>Aktuelles Passwort<input id="delete-account-password" type="password" autocomplete="current-password" required minlength="8"></label><div class="account-delete-actions"><button id="delete-account-confirm" class="account-danger" type="submit">Konto endgültig löschen</button><button id="delete-account-cancel" class="quiet" type="button">Abbrechen</button></div></form></div><div id="recovery-result" class="recovery-result" hidden><h3>Wiederherstellungscode</h3><p>Speichere diesen Code sicher. Er wird nicht noch einmal angezeigt.</p><code id="recovery-code-result"></code><button id="copy-recovery" class="quiet" type="button">Code kopieren</button></div><p id="account-status" role="status"></p></dialog>`);
}
function showRecovery(code){$('recovery-code-result').textContent=code;$('recovery-result').hidden=false}
function selectAccountTab(tab='login'){
  const selected=document.querySelector(`[data-account-tab="${tab}"]`)||document.querySelector('[data-account-tab="login"]');
  if(selected)selected.click();
}
function openAccount(tab='login'){
  const ok=configured();$('account-unconfigured').hidden=ok;$('account-logged-out').hidden=!!session||!ok;$('account-logged-in').hidden=!session;
  if(!session&&ok)selectAccountTab(tab);
  if(!$('account-dialog').open)$('account-dialog').showModal();
}
function bind(){
  addDialog();
  window.suomiOpenAccount=openAccount;
  $('account-button').onclick=()=>openAccount('login');
  if($('storage-account-link'))$('storage-account-link').onclick=()=>openAccount('login');
  $('close-account').onclick=()=>$('account-dialog').close();
  document.querySelectorAll('[data-account-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-account-tab]').forEach(x=>x.classList.toggle('selected',x===b));for(const n of ['login','register','recover'])$(n+'-form').hidden=b.dataset.accountTab!==n;$('recovery-result').hidden=true;status('')});
  $('login-form').onsubmit=async e=>{e.preventDefault();try{status('Anmeldung …');await login($('login-name').value,$('login-password').value)}catch(err){status(err.message,true)}};
  $('register-form').onsubmit=async e=>{e.preventDefault();try{status('Konto wird erstellt …');showRecovery(await register($('register-name').value,$('register-password').value));status('Konto erstellt und angemeldet.')}catch(err){status(err.message,true)}};
  $('recover-form').onsubmit=async e=>{e.preventDefault();try{status('Konto wird wiederhergestellt …');showRecovery(await recover($('recover-name').value,$('recover-code').value,$('recover-password').value));status('Passwort geändert. Der alte Wiederherstellungscode ist ungültig.')}catch(err){status(err.message,true)}};
  $('logout').onclick=async()=>{await logout()};
  $('delete-account-open').onclick=async()=>{try{status('Klassenräume werden geprüft …');$('delete-account-open').disabled=true;renderDeletionRooms(await loadDeletionManifest());$('delete-account-form').hidden=false;$('delete-account-name').focus();status('')}catch(err){status(err.message,true)}finally{$('delete-account-open').disabled=false}};
  $('delete-account-cancel').onclick=()=>{$('delete-account-form').reset();$('delete-account-form').hidden=true;deletionManifest=null;status('')};
  $('delete-account-form').onsubmit=async e=>{e.preventDefault();const submit=$('delete-account-confirm');try{submit.disabled=true;status('Konto und gespeicherte Daten werden gelöscht …');await deleteAccount($('delete-account-name').value,$('delete-account-password').value,deletionDecisions())}catch(err){submit.disabled=false;status(err.message,true)}};
  $('sync-now').onclick=async()=>{try{status('');await pullAndMerge()}catch(err){syncState('Synchronisierung fehlgeschlagen. Bitte erneut versuchen.',true);status(err.message,true)}};
  $('copy-recovery').onclick=async()=>{try{await navigator.clipboard.writeText($('recovery-code-result').textContent);status('Code kopiert.')}catch{status('Bitte kopiere den Code manuell.',true)}};
  window.addEventListener('suomi-learning-changed',scheduleSync);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncChangedNow()});
  window.addEventListener('focus',syncChangedNow);window.addEventListener('online',syncChangedNow);
  renderAccount();
}
loadSession();bind();
export const accountUser=()=>session?.user||null;
export {request as accountRequest};
window.suomiAccountUser=()=>session?.user||null;
window.suomiAccountRequest=request;
import('./classrooms.js?v=73').catch(()=>{});
import('./quality-review.js?v=2').catch(()=>{});
if(session?.user&&configured())refreshSession().then(async ok=>{if(!ok)return;try{await pullAndMerge();}catch(err){syncState('Synchronisierung fehlgeschlagen. Bitte erneut versuchen.',true);status(err.message,true);}}).catch(syncError).finally(()=>{syncReady=true;if(syncQueued)scheduleSync()});
else syncReady=true;
