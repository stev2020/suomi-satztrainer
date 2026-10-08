import {uiLocale,uiLanguage} from './i18n.mjs?v=25';
import {mergeVerbProgress} from './verb-practice.mjs';
import {mergeEndingsProgress} from './endings-progress.mjs?v=1';
import {mergePerformanceEvents} from './learning-insights.mjs';
import {mergeGames} from './games-progress.mjs';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,TURNSTILE_SITE_KEY} from './supabase-config.js?v=2';
import {accountProfile,avatarSVG,avatarPickerMarkup,bindAvatarPicker,cleanNickname,isAvatar,randomAvatar,NICKNAME_MAX} from './avatars.mjs?v=1';

const STORE='suomi-learning-v1';
const SESSION='suomi-auth-session-v1';
// Remembers when this device last wrote the cloud copy (and a fingerprint of
// what it wrote). Then a sync only has to read the tiny updated_at field.
const STAMP='suomi-cloud-stamp-v1';
// Answers are collected and uploaded together at most every 15 seconds; hiding
// the tab, going offline→online, logout and "Jetzt synchronisieren" upload at once.
const SYNC_DELAY=15000;
const $=id=>document.getElementById(id);
let session=null,lastSnapshot='',lastUpload=null,timer=null,syncInFlight=null,syncQueued=false,syncReady=false,deletionManifest=null;

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
// New passwords: the server's hash (bcrypt) only uses the first 72 bytes, so
// anything longer would be cut off silently. Existing longer passwords still log in.
const checkNewPassword=v=>{
  const s=String(v||'');
  if(s.length<8||new TextEncoder().encode(s).length>72) throw new Error('Das Passwort muss 8–72 Zeichen lang sein (Umlaute und Sonderzeichen zählen mehrfach).');
};
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hex=s=>Array.from(new TextEncoder().encode(s)).map(b=>b.toString(16).padStart(2,'0')).join('');
const technicalEmail=u=>`u${hex(u)}@users.suomi.invalid`;
const api=(path,options={})=>fetch(`${SUPABASE_URL}${path}`,{...options,headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(options.headers||{})}});
const authHeaders=()=>session?.access_token?{Authorization:`Bearer ${session.access_token}`}:{};
const status=(t,error=false)=>{const el=$('account-status');if(el){el.textContent=t;el.classList.toggle('error',error);if(t)try{el.scrollIntoView({block:'nearest'});}catch{}}};
// Meldung direkt unter dem Formular, zu dem sie gehört – am Ende des Fensters sähe man sie in langen Ansichten nicht.
const statusAt=(anchor,t,error=false)=>{const el=$('account-status');if(el&&anchor)anchor.after(el);status(t,error);};
let syncToast=null;
const syncState=(t,error=false)=>{
  const detail=$('account-sync');if(detail){detail.textContent=t;detail.classList.toggle('error',error);}
  // Auf der Startseite steht dazu nichts mehr – nur wenn etwas schiefläuft, erscheint unten ein Hinweis (bis es wieder klappt oder man ihn schließt).
  if(!error){syncToast?.remove();syncToast=null;return;}
  try{
   if(!syncToast){const toast=document.createElement('div');toast.id='sync-toast';toast.className='sync-toast';toast.setAttribute('role','alert');toast.innerHTML='<span></span><button type="button" aria-label="Schließen">×</button>';toast.querySelector('button').onclick=()=>{toast.remove();if(syncToast===toast)syncToast=null;};document.body.append(toast);syncToast=toast;}
   syncToast.querySelector('span').textContent=t;
  }catch{}
};
const stableJSON=value=>JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.keys(item).sort().reduce((out,key)=>(out[key]=item[key],out),{}):item);
const localLearning=()=>{try{return JSON.parse(localStorage.getItem(STORE))||null}catch{return null}};
const currentLearning=()=>window.suomiLearningState?.snapshot?.()||localLearning();
function saveSession(v){session=v;if(v)localStorage.setItem(SESSION,JSON.stringify(v));else localStorage.removeItem(SESSION);renderAccount();try{window.dispatchEvent(new CustomEvent('vanamo:session'));}catch{}}
function loadSession(){try{const v=JSON.parse(localStorage.getItem(SESSION));if(v?.access_token&&v?.refresh_token)session=v}catch{}}

// Only an explicitly rejected refresh token ends the session. Server errors (5xx),
// rate limits (429) and network failures keep the session and the local learning
// state, so answers that are not synchronized yet are never thrown away.
let refreshInFlight=null;
// Leaving an account also removes what this browser kept for that account:
// its "Satz des Tages" and leftover game progress. Device settings (design,
// language, game speed, record) stay.
function clearAccountStorage(userId){
  try{
    const doomed=[];
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i)||'';
      if(key.startsWith('suomi-hyppy.progress.')||(userId&&(key==='vanamo-daily-sentence:'+userId||key==='vanamo-classroom-drafts:'+userId||key==='vanamo-classroom-seen:'+userId)))doomed.push(key);
    }
    for(const key of [STORE,STAMP,...doomed])localStorage.removeItem(key);
  }catch{}
  try{sessionStorage.removeItem('suomi-guest-exercise-accepted')}catch{}
}
const storedSession=()=>{try{const v=JSON.parse(localStorage.getItem(SESSION));return v?.access_token&&v?.refresh_token?v:null}catch{return null}};
async function refreshSession(){
  if(!session?.refresh_token)return false;
  if(refreshInFlight)return refreshInFlight;
  const used=session.refresh_token;
  const run=async()=>{
    // Several tabs share one session. If another tab already rotated the
    // refresh token, take over its result: sending the used token again would
    // be rejected and end the session in every tab.
    const stored=storedSession();
    if(stored&&stored.user?.id===session?.user?.id&&stored.refresh_token!==used){session=stored;return true}
    const r=await api('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:used})});
    if(r.status===400||r.status===401){clearAccountStorage(session?.user?.id);saveSession(null);location.reload();return false}
    if(!r.ok){syncState('Server gerade nicht erreichbar. Dein Lernstand bleibt auf diesem Gerät gespeichert.',true);return false}
    saveSession(await r.json());return true;
  };
  // Web Locks serialize refreshes across tabs (fallback: this tab only).
  const locks=globalThis.navigator?.locks;
  refreshInFlight=locks?.request?locks.request('suomi-auth-refresh',run):run();
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
  out.endingsProgress=mergeEndingsProgress(cloud.endingsProgress,local.endingsProgress);
  out.games=mergeGames(cloud.games,local.games);
  out.prefs={...(cloud.prefs||{}),...(local.prefs||{})};
  return out;
}
async function cloudLearning(){
  const r=await request('/rest/v1/learning_state?select=state,updated_at&limit=1');
  if(!r.ok)throw new Error('Der Online-Lernstand konnte nicht geladen werden.');
  const rows=await r.json();return {state:rows[0]?.state||null,updatedAt:rows[0]?.updated_at??null};
}
async function cloudUpdatedAt(){
  const r=await request('/rest/v1/learning_state?select=updated_at&limit=1');
  if(!r.ok)throw new Error('Der Online-Lernstand konnte nicht geladen werden.');
  const rows=await r.json();return rows[0]?.updated_at??null;
}
// Small non-cryptographic fingerprint (cyrb53) of the uploaded snapshot.
function fingerprint(text){
  let h1=0xdeadbeef^text.length,h2=0x41c6ce57^text.length;
  for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677)}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
  h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);
}
const sameTime=(a,b)=>a!=null&&b!=null&&Date.parse(a)===Date.parse(b);
function readStamp(){
  try{const v=JSON.parse(localStorage.getItem(STAMP));return v&&v.user===session?.user?.id&&v.at&&v.hash?v:null}catch{return null}
}
function writeStamp(at,snapshot){if(session?.user)localStorage.setItem(STAMP,JSON.stringify({user:session.user.id,at,hash:fingerprint(snapshot)}))}
async function synchronizeLearning(state=currentLearning(),reloadIfChanged=true,silent=false){
  if(!session?.user||!state)return;
  if(syncInFlight)return syncInFlight;
  clearTimeout(timer);timer=null;syncQueued=false;
  let succeeded=false;
  syncInFlight=(async()=>{
    if(!silent)syncState('Synchronisierung läuft …');
    // Merge before writing so another device's newer answers are retained.
    // If the cloud copy still carries the timestamp of this device's last
    // upload, nobody else wrote since and it equals the copy kept in memory:
    // then only updated_at is read instead of the whole learning state.
    const known=readStamp();
    let cloud,remoteAt=null;
    if(known&&lastUpload?.user===session.user.id){remoteAt=await cloudUpdatedAt();if(sameTime(remoteAt,known.at))cloud=lastUpload.state;}
    if(cloud===undefined)({state:cloud,updatedAt:remoteAt}=await cloudLearning());
    const unchanged=!!known&&sameTime(remoteAt,known.at);
    const merged=mergeLearning(mergeLearning(currentLearning(),state),cloud);
    const changed=stableJSON(merged)!==stableJSON(currentLearning());
    // Apply before the upload: answers made while POST is pending must remain
    // in memory and local storage and be sent by the queued follow-up.
    const mergedText=JSON.stringify(merged);
    localStorage.setItem(STORE,mergedText);
    let applied=false;
    if(changed&&reloadIfChanged)applied=!!window.suomiLearningState?.applyCloud?.(merged);
    const acceptedSnapshot=stableJSON(currentLearning());
    // Nothing new since this device's last upload (e.g. page reload): no write.
    if(!(unchanged&&fingerprint(acceptedSnapshot)===known.hash)){
      const updatedAt=new Date().toISOString();
      const r=await request('/rest/v1/learning_state?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:session.user.id,state:merged,updated_at:updatedAt})});
      if(!r.ok)throw new Error('Der Lernstand konnte nicht synchronisiert werden.');
      writeStamp(updatedAt,acceptedSnapshot);
      // Private copy: the app may keep and change the applied objects.
      lastUpload={user:session.user.id,state:JSON.parse(mergedText)};
    }else lastUpload={user:session.user.id,state:JSON.parse(JSON.stringify(cloud))};
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
  clearTimeout(timer);timer=null;
  if(!session?.user||!syncReady||syncInFlight)return;
  syncQueued=false;
  const current=currentLearning(),snapshot=stableJSON(current);
  if(snapshot!==lastSnapshot)synchronizeLearning(current,true,false).catch(syncError);
}
function scheduleSync(){
  if(!session?.user)return;
  syncQueued=true;
  // A pending timer is kept (not restarted), so steady answering still
  // uploads every SYNC_DELAY instead of waiting for a pause.
  if(syncReady&&!syncInFlight&&!timer)timer=setTimeout(syncChangedNow,SYNC_DELAY);
}
function renderAccount(){
  const logged=!!session?.user;
  renderDialogSections();
  const profile=accountProfile(session?.user);
  if(logged&&$('account-name'))$('account-name').textContent=profile.username||'Nutzer';
  document.body.dataset.account=logged?'authenticated':'guest';
  // Angemeldet ist der Konto-Knopf ein rundes Icon mit dem gewählten Vogel (ohne Vogel: Anfangsbuchstabe); ein Klick lässt die Kontopunkte einzeln daraus ausfahren.
  const button=$('account-button');
  if(button){
    button.classList.toggle('is-avatar',logged);
    button.classList.toggle('has-bird',logged&&!!profile.avatar);
    if(logged&&profile.avatar)button.innerHTML=avatarSVG(profile.avatar);
    else button.textContent=logged?(Array.from(profile.nickname)[0]||'?').toUpperCase():'Anmelden / Registrieren';
    if(logged){button.setAttribute('aria-label','Konto');button.setAttribute('aria-haspopup','true');}
    else for(const attr of ['aria-label','aria-haspopup','aria-expanded'])button.removeAttribute(attr);
    setAccountMenu(false);
  }
  if(logged){if(!syncReady)syncState('Synchronisierung wird geprüft …');}else if($('storage-note'))$('storage-note').classList.remove('error');
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
// Cloudflare Turnstile protects the registration against bots. The script is
// loaded only when the registration form is opened, not on every visit.
const TURNSTILE_SCRIPT='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let turnstileLoad=null,turnstileWidget=null,turnstileToken='';
function loadTurnstile(){
  if(!TURNSTILE_SITE_KEY)return Promise.resolve(null);
  if(window.turnstile)return Promise.resolve(window.turnstile);
  return turnstileLoad??=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=TURNSTILE_SCRIPT;script.async=true;
    script.onload=()=>resolve(window.turnstile);
    script.onerror=()=>{turnstileLoad=null;script.remove();reject(new Error('Die Sicherheitsprüfung konnte nicht geladen werden. Bitte prüfe die Verbindung und versuche es erneut.'))};
    document.head.append(script);
  });
}
async function showTurnstile(){
  const box=$('register-turnstile');if(!box||!TURNSTILE_SITE_KEY||turnstileWidget!==null)return;
  try{
    const turnstile=await loadTurnstile();if(!turnstile||turnstileWidget!==null)return;
    turnstileWidget=turnstile.render(box,{sitekey:TURNSTILE_SITE_KEY,action:'register',
      theme:document.documentElement.dataset.themeMode==='dark'?'dark':'light',language:document.documentElement.lang||'auto',
      callback:token=>{turnstileToken=token},'expired-callback':()=>{turnstileToken=''},'error-callback':()=>{turnstileToken=''}});
  }catch(err){status(err.message,true)}
}
// A token is valid for one check only, so every attempt gets a fresh one.
function resetTurnstile(){turnstileToken='';if(turnstileWidget!==null)try{window.turnstile?.reset(turnstileWidget)}catch{}}
async function register(username,password){
  username=normalizeUsername(username);checkNewPassword(password);
  if(TURNSTILE_SITE_KEY&&!turnstileToken){showTurnstile();throw new Error('Bitte warte kurz, bis die Sicherheitsprüfung unter dem Formular abgeschlossen ist.');}
  let r;
  try{r=await api('/functions/v1/register',{method:'POST',body:JSON.stringify({username,password,turnstileToken})})}finally{resetTurnstile()}
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Registrierung fehlgeschlagen.');
  const guestState=currentLearning();await login(username,password,false,guestState);return result.recoveryCode;
}
async function recover(username,recoveryCode,newPassword){
  username=normalizeUsername(username);checkNewPassword(newPassword);
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
  clearTimeout(timer);timer=null;syncQueued=false;syncReady=false;
  clearAccountStorage(session?.user?.id);localStorage.removeItem(STORE);localStorage.removeItem(SESSION);
  session=null;location.reload();
}
async function logout(){
  clearTimeout(timer);timer=null;
  // Send pending answers before the local copy is removed (at most 5 seconds).
  const current=currentLearning();
  if(session?.user&&current&&stableJSON(current)!==lastSnapshot){
    syncState('Letzte Änderungen werden gespeichert …');
    await Promise.race([(syncInFlight||Promise.resolve()).then(()=>synchronizeLearning(currentLearning(),false,true)).catch(()=>{}),new Promise(r=>setTimeout(r,5000))]);
  }
  if(session?.access_token)await api('/auth/v1/logout',{method:'POST',headers:authHeaders()}).catch(()=>{});
  clearAccountStorage(session?.user?.id);
  saveSession(null);
  location.reload();
}
// E-Mail-Feld mit Hinweis; das Häkchen „mindestens 16“ erscheint erst, wenn im Feld etwas steht.
const emailFieldsMarkup=prefix=>`<label>E-Mail (freiwillig)<input id="${prefix}-email" type="email" autocomplete="email" maxlength="254" placeholder="name@beispiel.de"></label><p class="account-hint">Nur zum Zurücksetzen deines Passworts. Kein Newsletter.</p><label class="account-check" id="${prefix}-adult-row" hidden><input id="${prefix}-adult" type="checkbox"><span>Ich bin mindestens 16 Jahre alt.</span></label>`;
function addDialog(){
  document.body.insertAdjacentHTML('beforeend',`<dialog id="account-dialog" aria-labelledby="account-title"><div class="dialog-top"><h2 id="account-title">Dein Konto</h2><button id="close-account" class="quiet" aria-label="Schließen">✕</button></div><div id="account-unconfigured" hidden><p>Die Kontofunktion ist vorbereitet, aber die Serververbindung ist noch nicht aktiviert.</p></div><div id="account-logged-out"><div class="account-tabs"><button type="button" data-account-tab="login" class="selected">Anmelden</button><button type="button" data-account-tab="register">Registrieren</button><button type="button" data-account-tab="recover">Passwort vergessen</button></div><form id="login-form" class="account-form"><label>Benutzername<input id="login-name" autocomplete="username" required></label><label>Passwort<input id="login-password" type="password" autocomplete="current-password" required minlength="8"></label><button class="primary" type="submit">Anmelden</button></form><form id="register-form" class="account-form" hidden><label>Benutzername<input id="register-name" autocomplete="username" required></label><label>Passwort<input id="register-password" type="password" autocomplete="new-password" required minlength="8"></label><div id="register-turnstile" class="account-turnstile"></div><button class="primary" type="submit">Konto erstellen</button><p class="account-hint">Schritt 1 von 2 · Keine E-Mail nötig. Danach wählst du deinen Vogel.</p></form><div id="recover-email" hidden><form id="reset-request-form" class="account-form"><label>Benutzername oder E-Mail<input id="reset-identifier" autocomplete="username" required maxlength="254"></label><button class="primary" type="submit">Link per E-Mail senden</button><p class="account-hint">Geht nur, wenn du im Konto eine E-Mail-Adresse hinterlegt und bestätigt hast.</p></form><p class="account-or">oder mit deinem Wiederherstellungscode</p></div><form id="recover-form" class="account-form" hidden><label>Benutzername<input id="recover-name" autocomplete="username" required></label><label>Wiederherstellungscode<input id="recover-code" autocomplete="off" required></label><label>Neues Passwort<input id="recover-password" type="password" autocomplete="new-password" required minlength="8"></label><button class="primary" type="submit">Passwort neu setzen</button></form></div><div id="account-logged-in" hidden><p>Angemeldet als <strong id="account-name"></strong></p><form id="profile-form" class="account-form account-profile"><h3>Vogel und Spitzname</h3>${avatarPickerMarkup('profile')}<label>Spitzname<input id="profile-nickname" maxlength="${NICKNAME_MAX}" autocomplete="nickname" required></label><p class="account-hint">So begrüßen wir dich. Im Klassenraum wird er als dein Name vorgeschlagen.</p><button id="profile-save" class="quiet" type="submit">Speichern</button></form><form id="email-form" class="account-form account-profile"><h3>E-Mail zum Zurücksetzen</h3><p id="email-state" class="account-hint" role="status"></p>${emailFieldsMarkup('profile')}<div class="account-row"><button id="email-save" class="quiet" type="submit">Speichern</button><button id="email-remove" class="quiet" type="button" hidden>Entfernen</button></div></form><form id="password-form" class="account-form account-profile"><h3>Passwort ändern</h3><label>Aktuelles Passwort<input id="password-current" type="password" autocomplete="current-password" required minlength="8"></label><label>Neues Passwort<input id="password-new" type="password" autocomplete="new-password" required minlength="8"></label><button id="password-save" class="quiet" type="submit">Passwort ändern</button></form><p id="account-sync">Synchronisierung wird geprüft …</p><button id="sync-now" class="quiet" type="button">Jetzt synchronisieren</button><button id="delete-account-open" class="quiet account-danger" type="button">Konto löschen</button><form id="delete-account-form" class="account-form account-delete-form" hidden><h3>Konto endgültig löschen</h3><p>Dein Konto, Lernstand, Beiträge, Abgaben, Meldungen und Mitgliedschaften werden unwiderruflich gelöscht. Eigene Klassenräume kannst du an eine dort aktive Lehrkraft übergeben; ohne Übergabe werden sie mitsamt allen Inhalten gelöscht.</p><div id="delete-account-rooms"></div><label>Benutzername zur Bestätigung<input id="delete-account-name" autocomplete="off" required></label><label>Aktuelles Passwort<input id="delete-account-password" type="password" autocomplete="current-password" required minlength="8"></label><div class="account-delete-actions"><button id="delete-account-confirm" class="account-danger" type="submit">Konto endgültig löschen</button><button id="delete-account-cancel" class="quiet" type="button">Abbrechen</button></div></form></div><form id="account-onboarding" class="account-form account-onboarding" hidden><p class="account-step">Schritt 2 von 2</p><p class="account-lead">Wähle deinen Vogel</p>${avatarPickerMarkup('onboarding')}<label>Spitzname<input id="onboarding-nickname" maxlength="${NICKNAME_MAX}" autocomplete="nickname"></label><p class="account-hint">So begrüßen wir dich. Im Klassenraum wird er als dein Name vorgeschlagen.</p>${emailFieldsMarkup('onboarding')}<button class="primary" type="submit">Los geht's</button><button id="onboarding-skip" class="text-link" type="button">Überspringen</button></form><form id="reset-form" class="account-form" hidden><p class="account-hint">Lege ein neues Passwort für dein Konto fest.</p><label>Neues Passwort<input id="reset-password" type="password" autocomplete="new-password" required minlength="8"></label><button class="primary" type="submit">Passwort speichern</button></form><div id="recovery-result" class="recovery-result" hidden><p>Speichere diesen Code sicher. Er wird nicht noch einmal angezeigt.</p><code id="recovery-code-result"></code><button id="copy-recovery" class="quiet" type="button">Code kopieren</button><p class="recovery-why">Wir wissen nicht, wer du bist, und können dein Konto deshalb nicht für dich wiederherstellen. Mit diesem Code setzt du ein vergessenes Passwort selbst zurück.</p><button id="recovery-done" class="primary" type="button">Fertig</button></div><p id="account-status" role="status"></p></dialog>`);
}
const MENU_ICON=d=>`<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
// Die Kontopunkte hängen direkt am Icon im Kopf (kein Fenster mehr). „Konto verwalten“ öffnet das Fenster mit Anmeldestand, Synchronisieren und „Konto löschen“.
function addMenu(){
  const button=$('account-button');if(!button||$('account-menu'))return;
  const wrap=document.createElement('div');wrap.id='account-menu';wrap.className='account-menu';
  button.before(wrap);wrap.append(button);
  const item=(id,i,icon,label)=>`<button id="${id}" type="button" role="menuitem" style="--i:${i}">${MENU_ICON(icon)}<span>${label}</span></button>`;
  wrap.insertAdjacentHTML('beforeend',`<div id="account-menu-items" class="account-menu-items" role="menu" aria-label="Konto" inert>${
    item('account-progress',0,'<path d="M3 20h18M6 20v-8M12 20V5M18 20v-11"/>','Mein Fortschritt')
   +item('account-manage',1,'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6"/>','Konto verwalten')
   +item('logout',2,'<path d="M10 4H5v16h5M14 8l4 4-4 4M18 12H9"/>','Abmelden')}</div>`);
}
let accountMenuOpen=false,accountMenuTimer=null;
function setAccountMenu(open){
  const wrap=$('account-menu'),items=$('account-menu-items'),button=$('account-button');
  if(!wrap||!items||!button)return;
  accountMenuOpen=!!open&&!!session?.user;
  wrap.classList.toggle('open',accountMenuOpen);
  // Anklickbar werden die Punkte erst, wenn sie ausgefahren sind – sonst träfe ein Doppelklick auf das Icon einen Punkt, der gerade darunter hervorkommt.
  clearTimeout(accountMenuTimer);wrap.classList.remove('ready');
  if(accountMenuOpen)accountMenuTimer=setTimeout(()=>wrap.classList.add('ready'),340);
  items.toggleAttribute('inert',!accountMenuOpen);
  if(session?.user)button.setAttribute('aria-expanded',String(accountMenuOpen));
}
// Das Kontofenster zeigt immer genau einen Abschnitt. Nach der Registrierung kommen zwei Zwischenschritte:
// „onboarding“ (Vogel und Spitzname wählen) und „code“ (der Wiederherstellungscode, der nur einmal erscheint).
// „reset“ ist das neue Passwort nach einem Klick auf den Link aus der Mail.
let accountStage=null,registering=false,onboardingPicker=null,profilePicker=null,resetToken='';
function renderDialogSections(){
  if(!$('account-dialog'))return;
  $('account-dialog').append($('account-status'));
  const ok=configured(),logged=!!session?.user;
  $('account-unconfigured').hidden=ok;
  $('account-logged-out').hidden=!ok||!!accountStage||(logged&&!registering);
  $('account-logged-in').hidden=!logged||!!accountStage||registering;
  $('account-onboarding').hidden=accountStage!=='onboarding';
  $('recovery-result').hidden=accountStage!=='code';
  $('reset-form').hidden=accountStage!=='reset';
  $('account-title').textContent=accountStage==='onboarding'?'Fast fertig':accountStage==='code'?'Dein Wiederherstellungscode':accountStage==='reset'?'Neues Passwort':'Dein Konto';
}
function fillProfileForm(){
  const profile=accountProfile(session?.user);
  profilePicker?.set(profile.avatar);
  if($('profile-nickname'))$('profile-nickname').value=profile.nickname;
}
// Vogel und Spitzname liegen in den Kontodaten des Nutzers (Supabase Auth, user_metadata) – keine eigene Tabelle.
async function updateProfile(nickname,avatar){
  nickname=cleanNickname(nickname);
  if(!nickname)throw new Error('Bitte gib einen Spitznamen ein.');
  if(!isAvatar(avatar))throw new Error('Bitte wähle einen Vogel.');
  const r=await request('/auth/v1/user',{method:'PUT',body:JSON.stringify({data:{nickname,avatar}})});
  const user=await r.json().catch(()=>null);
  if(!r.ok||!user?.id||!session)throw new Error('Vogel und Spitzname konnten nicht gespeichert werden. Bitte versuche es erneut.');
  saveSession({...session,user});
}
// Freiwillige E-Mail-Adresse, nur zum Zurücksetzen des Passworts (Edge Function „account-email“).
const EMAIL_PATTERN=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;
async function emailApi(action,body={},withAccount=true){
  const options={method:'POST',body:JSON.stringify({action,lang:uiLanguage,...body})};
  const r=withAccount?await request('/functions/v1/account-email',options):await api('/functions/v1/account-email',options);
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Das hat nicht geklappt. Bitte versuche es erneut.');
  return result;
}
// Liest Adresse und Häkchen eines Formulars; leer ist erlaubt (dann gibt es keine Adresse).
function readEmailFields(prefix){
  const email=$(prefix+'-email').value.trim().toLowerCase();
  if(!email)return '';
  if(email.length>254||!EMAIL_PATTERN.test(email))throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
  if(!$(prefix+'-adult').checked)throw new Error('Bitte bestätige, dass du mindestens 16 Jahre alt bist – oder lass das Feld leer.');
  return email;
}
function bindEmailFields(prefix){
  const input=$(prefix+'-email'),row=$(prefix+'-adult-row');
  input.addEventListener('input',()=>{row.hidden=!input.value.trim();});
}
function notice(text,error=false){
  const toast=document.createElement('div');toast.className='sync-toast account-notice'+(error?' error':'');toast.setAttribute('role',error?'alert':'status');
  toast.innerHTML='<span></span><button type="button" aria-label="Schließen">×</button>';toast.querySelector('span').textContent=text;
  toast.querySelector('button').onclick=()=>toast.remove();document.body.append(toast);
  if(!error)setTimeout(()=>toast.remove(),9000);
}
let emailState={email:'',verified:false};
function renderEmailState(note=''){
  const {email,verified}=emailState,input=$('profile-email');
  input.value=email;$('profile-adult').checked=!!email;$('profile-adult-row').hidden=!email;
  $('email-remove').hidden=!email;
  $('email-save').textContent=email&&!verified?'Link erneut senden':'Speichern';
  $('email-state').textContent=note||(!email?'Keine Adresse hinterlegt. Ohne Adresse hilft bei vergessenem Passwort nur dein Wiederherstellungscode.':verified?'Bestätigt.':'Noch nicht bestätigt. Öffne den Link in der Mail, die wir dir geschickt haben.');
}
async function loadEmailState(){
  $('email-state').textContent='';
  try{emailState=await emailApi('status');renderEmailState();}
  catch{emailState={email:'',verified:false};renderEmailState('Der Stand deiner E-Mail-Adresse konnte gerade nicht geladen werden.');}
}
// Links aus den Mails: ?verify-email=… bestätigt die Adresse, ?reset=… öffnet „Neues Passwort“. Der Token verschwindet sofort aus der Adresszeile.
function handleMailLinks(){
  const params=new URLSearchParams(location.search),verify=params.get('verify-email'),reset=params.get('reset');
  if(!verify&&!reset)return;
  params.delete('verify-email');params.delete('reset');
  const rest=params.toString();
  try{history.replaceState(null,'',location.pathname+(rest?'?'+rest:'')+location.hash);}catch{}
  if(verify){emailApi('verify',{token:verify},false).then(()=>notice('Deine E-Mail-Adresse ist bestätigt.')).catch(err=>notice(err.message,true));return;}
  if(!configured())return;
  resetToken=reset;accountStage='reset';renderDialogSections();status('');
  if(!$('account-dialog').open)$('account-dialog').showModal();
}
// Passwort im Konto ändern. Der Server beendet danach alle Anmeldungen; dieses Gerät meldet sich mit dem neuen
// Passwort gleich wieder an (der Lernstand auf dem Gerät bleibt dabei, wie er ist).
async function changePassword(currentPassword,newPassword){
  checkPassword(currentPassword);checkNewPassword(newPassword);
  if(currentPassword===newPassword)throw new Error('Das neue Passwort muss sich vom aktuellen unterscheiden.');
  const username=accountProfile(session?.user).username;
  const r=await request('/functions/v1/change-password',{method:'POST',body:JSON.stringify({currentPassword,newPassword})});
  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result.error||'Das Passwort konnte nicht geändert werden.');
  const again=await api('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email:technicalEmail(normalizeUsername(username)),password:newPassword})}).catch(()=>null);
  if(!again?.ok)return false;
  saveSession(await again.json());return true;
}
function startOnboarding(){
  accountStage='onboarding';
  onboardingPicker?.set(randomAvatar());
  const input=$('onboarding-nickname');input.value='';input.placeholder=accountProfile(session?.user).username;
  $('onboarding-email').value='';$('onboarding-adult').checked=false;$('onboarding-adult-row').hidden=true;
  renderDialogSections();status('');
}
let onboardingBusy=false;
async function finishOnboarding(skip){
  if(onboardingBusy||accountStage!=='onboarding')return;
  let email='';
  if(!skip){try{email=readEmailFields('onboarding');}catch(err){status(err.message,true);return;}}
  onboardingBusy=true;
  const profile=accountProfile(session?.user);
  let note='Konto erstellt und angemeldet.';
  try{
    status('Wird gespeichert …');
    await updateProfile(skip?profile.username:($('onboarding-nickname').value||profile.username),(!skip&&onboardingPicker?.get())||randomAvatar());
  }catch{note='Konto erstellt. Vogel und Spitzname kannst du später unter „Konto verwalten“ wählen.';}
  if(email){
    try{await emailApi('set',{email,adult:true});note+=' Wir haben dir einen Link geschickt, mit dem du deine E-Mail-Adresse bestätigst.';}
    catch{note+=' Die Bestätigungsmail konnte nicht verschickt werden – versuche es später unter „Konto verwalten“.';}
  }
  onboardingBusy=false;
  accountStage='code';renderDialogSections();status(note);
}
function showRecovery(code){$('recovery-code-result').textContent=code;accountStage='code';renderDialogSections();}
function selectAccountTab(tab='login'){
  const selected=document.querySelector(`[data-account-tab="${tab}"]`)||document.querySelector('[data-account-tab="login"]');
  if(selected)selected.click();
}
function openAccount(tab='login'){
  const ok=configured();renderDialogSections();
  if(!session&&ok)selectAccountTab(tab);
  if(session&&!accountStage){fillProfileForm();status('');loadEmailState();}
  if(!$('account-dialog').open)$('account-dialog').showModal();
}
function bind(){
  addDialog();addMenu();
  window.suomiOpenAccount=openAccount;
  $('account-button').onclick=()=>{if(session?.user)setAccountMenu(!accountMenuOpen);else openAccount('login');};
  $('account-manage').onclick=()=>openAccount('login');
  $('account-menu-items').addEventListener('click',e=>{const item=e.target.closest('button');if(item)setAccountMenu(false);});
  document.addEventListener('click',e=>{if(accountMenuOpen&&!$('account-menu').contains(e.target))setAccountMenu(false);});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&accountMenuOpen){setAccountMenu(false);$('account-button').focus();}});
  if($('storage-account-link'))$('storage-account-link').onclick=()=>openAccount('login');
  onboardingPicker=bindAvatarPicker($('account-onboarding'),'');profilePicker=bindAvatarPicker($('profile-form'),'');
  // Wer Schritt 2 schließt, überspringt ihn nur – der Wiederherstellungscode muss danach trotzdem noch erscheinen.
  $('close-account').onclick=()=>{if(accountStage==='onboarding')finishOnboarding(true);else $('account-dialog').close();};
  $('account-dialog').addEventListener('cancel',e=>{if(accountStage==='onboarding'){e.preventDefault();finishOnboarding(true);}});
  $('account-dialog').addEventListener('close',()=>{if(!accountStage)return;accountStage=null;$('recovery-code-result').textContent='';renderDialogSections();status('');});
  $('account-onboarding').onsubmit=e=>{e.preventDefault();finishOnboarding(false);};
  $('onboarding-skip').onclick=()=>finishOnboarding(true);
  $('recovery-done').onclick=()=>{$('account-dialog').close();window.dispatchEvent(new CustomEvent('vanamo:view',{detail:'home'}));window.scrollTo?.(0,0);};
  bindEmailFields('onboarding');bindEmailFields('profile');
  $('email-form').onsubmit=async e=>{e.preventDefault();const save=$('email-save');try{
    const email=readEmailFields('profile');if(!email)throw new Error('Bitte gib eine E-Mail-Adresse ein – oder entferne die hinterlegte Adresse.');
    save.disabled=true;statusAt($('email-form'),'Wird gespeichert …');emailState=await emailApi('set',{email,adult:true});renderEmailState();
    statusAt($('email-form'),emailState.verified?'Gespeichert.':'Wir haben dir einen Bestätigungslink geschickt. Schau auch im Spam-Ordner nach.');
  }catch(err){statusAt($('email-form'),err.message,true)}finally{save.disabled=false}};
  $('email-remove').onclick=async()=>{const remove=$('email-remove');try{remove.disabled=true;emailState=await emailApi('remove');renderEmailState();statusAt($('email-form'),'E-Mail-Adresse entfernt.');}catch(err){statusAt($('email-form'),err.message,true)}finally{remove.disabled=false}};
  $('reset-request-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,send=form.querySelector('button');if(send.disabled)return;
    try{
      send.disabled=true;statusAt(send,'Wird gesendet …');
      await emailApi('reset-request',{identifier:$('reset-identifier').value},false);
      // Der Knopf bleibt kurz gesperrt und sagt, dass es geklappt hat – sonst klickt man ein zweites Mal.
      send.textContent='Link gesendet';
      statusAt(send,'Falls zu diesem Konto eine bestätigte E-Mail-Adresse gehört, ist jetzt ein Link unterwegs. Er gilt 60 Minuten.');
      setTimeout(()=>{send.disabled=false;send.textContent='Link per E-Mail senden';},20000);
    }catch(err){send.disabled=false;statusAt(send,err.message,true)}};
  $('reset-form').onsubmit=async e=>{e.preventDefault();const save=e.currentTarget.querySelector('button');try{
    const password=$('reset-password').value;checkNewPassword(password);
    save.disabled=true;status('Wird gespeichert …');
    const result=await emailApi('reset-confirm',{token:resetToken,newPassword:password},false);
    resetToken='';$('reset-password').value='';
    await login(result.username,password);
    $('account-dialog').close();notice('Passwort geändert. Du bist angemeldet.');
    window.dispatchEvent(new CustomEvent('vanamo:view',{detail:'home'}));window.scrollTo?.(0,0);
  }catch(err){status(err.message,true)}finally{save.disabled=false}};
  $('password-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,save=$('password-save');try{
    save.disabled=true;statusAt(form,'Wird gespeichert …');
    const signedIn=await changePassword($('password-current').value,$('password-new').value);
    form.reset();
    statusAt(form,signedIn?'Passwort geändert. Auf anderen Geräten wurdest du abgemeldet.':'Passwort geändert. Bitte melde dich mit dem neuen Passwort neu an.');
  }catch(err){statusAt(form,err.message,true)}finally{save.disabled=false}};
  $('profile-form').onsubmit=async e=>{e.preventDefault();const save=$('profile-save');try{save.disabled=true;statusAt($('profile-form'),'Wird gespeichert …');await updateProfile($('profile-nickname').value,profilePicker.get());fillProfileForm();statusAt($('profile-form'),'Gespeichert.');}catch(err){statusAt($('profile-form'),err.message,true)}finally{save.disabled=false}};
  document.querySelectorAll('[data-account-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-account-tab]').forEach(x=>x.classList.toggle('selected',x===b));for(const n of ['login','register','recover'])$(n+'-form').hidden=b.dataset.accountTab!==n;$('recover-email').hidden=b.dataset.accountTab!=='recover';if(b.dataset.accountTab==='register')showTurnstile();status('')});
  $('login-form').onsubmit=async e=>{e.preventDefault();try{status('Anmeldung …');await login($('login-name').value,$('login-password').value);status('');$('login-password').value='';$('account-dialog').close();window.dispatchEvent(new CustomEvent('vanamo:view',{detail:'home'}));window.scrollTo?.(0,0)}catch(err){status(err.message,true)}};
  $('register-form').onsubmit=async e=>{e.preventDefault();if(registering)return;registering=true;try{status('Konto wird erstellt …');const code=await register($('register-name').value,$('register-password').value);$('recovery-code-result').textContent=code;$('register-password').value='';registering=false;startOnboarding();}catch(err){registering=false;renderDialogSections();status(err.message,true)}};
  $('recover-form').onsubmit=async e=>{e.preventDefault();try{status('Konto wird wiederhergestellt …');showRecovery(await recover($('recover-name').value,$('recover-code').value,$('recover-password').value));status('Passwort geändert. Der alte Wiederherstellungscode ist ungültig.')}catch(err){status(err.message,true)}};
  $('logout').onclick=async()=>{await logout()};
$('account-progress').onclick=()=>{$('account-dialog').close();window.dispatchEvent(new CustomEvent('vanamo:view',{detail:'progress'}));};
  $('delete-account-open').onclick=async()=>{try{status('Klassenräume werden geprüft …');$('delete-account-open').disabled=true;renderDeletionRooms(await loadDeletionManifest());$('delete-account-form').hidden=false;$('delete-account-name').focus();status('')}catch(err){status(err.message,true)}finally{$('delete-account-open').disabled=false}};
  $('delete-account-cancel').onclick=()=>{$('delete-account-form').reset();$('delete-account-form').hidden=true;deletionManifest=null;status('')};
  $('delete-account-form').onsubmit=async e=>{e.preventDefault();const submit=$('delete-account-confirm');try{submit.disabled=true;status('Konto und gespeicherte Daten werden gelöscht …');await deleteAccount($('delete-account-name').value,$('delete-account-password').value,deletionDecisions())}catch(err){submit.disabled=false;status(err.message,true)}};
  $('sync-now').onclick=async()=>{try{status('');await pullAndMerge()}catch(err){syncState('Synchronisierung fehlgeschlagen. Bitte erneut versuchen.',true);status(err.message,true)}};
  $('copy-recovery').onclick=async()=>{try{await navigator.clipboard.writeText($('recovery-code-result').textContent);status('Code kopiert.')}catch{status('Bitte kopiere den Code manuell.',true)}};
  window.addEventListener('suomi-learning-changed',scheduleSync);
  // Keep tabs on the same session: adopt tokens another tab refreshed, and
  // reload when another tab signed out or switched the account.
  window.addEventListener('storage',e=>{
    if(e.key!==SESSION)return;
    const stored=storedSession();
    if(stored&&session&&stored.user?.id===session.user?.id){session=stored;return}
    if(stored||session)location.reload();
  });
  // Hiding the tab (switching apps, closing) uploads pending answers right away;
  // anything that still does not arrive stays local and is merged next time.
  document.addEventListener('visibilitychange',syncChangedNow);
  window.addEventListener('pagehide',syncChangedNow);
  window.addEventListener('focus',syncChangedNow);window.addEventListener('online',syncChangedNow);
  renderAccount();
  handleMailLinks();
}
loadSession();bind();
export const accountUser=()=>session?.user||null;
export {request as accountRequest};
window.suomiAccountUser=()=>session?.user||null;
window.suomiAccountRequest=request;
import('./classrooms.js?v=98').catch(()=>{});
import('./quality-review.js?v=6').catch(()=>{});
if(session?.user&&configured())refreshSession().then(async ok=>{if(!ok)return;try{await pullAndMerge();}catch(err){syncState('Synchronisierung fehlgeschlagen. Bitte erneut versuchen.',true);status(err.message,true);}}).catch(syncError).finally(()=>{syncReady=true;if(syncQueued)scheduleSync()});
else syncReady=true;
