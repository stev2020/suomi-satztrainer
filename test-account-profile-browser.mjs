// Browser test: Registrierung in zwei Schritten (Vogel, Spitzname, freiwillige E-Mail), Wiederherstellungscode,
// Vogel im Konto-Icon, „Vogel und Spitzname“ und „E-Mail zum Zurücksetzen“ unter „Konto verwalten“,
// „Passwort vergessen“ per E-Mail-Link und die Links aus den Mails (?verify-email=…, ?reset=…).
// Turnstile und alle Supabase-Aufrufe sind nachgebildet; nichts verlässt den Rechner.
// SHOTS=<Ordner> speichert zusätzlich Bildschirmfotos der Schritte.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {AVATARS,accountProfile,cleanNickname,avatarMarkup} from './dist/avatars.mjs';

// Bausteine ohne Browser
assert.equal(AVATARS.length,11);assert.equal(new Set(AVATARS.map(a=>a.id)).size,11);
assert.deepEqual(accountProfile({user_metadata:{username:'lumi',nickname:'  Lumi   die <b>Erste</b> ',avatar:'kurki'}}),{username:'lumi',nickname:'Lumi die <b>Erste</b>',avatar:'kurki'});
assert.deepEqual(accountProfile({user_metadata:{username:'lumi',avatar:'<svg onload=1>'}}),{username:'lumi',nickname:'lumi',avatar:''});
assert.equal(cleanNickname('x'.repeat(80)).length,30);
assert.match(avatarMarkup('nope',{name:'<Anna>'}),/data-initial="&lt;"/);assert.doesNotMatch(avatarMarkup('nope',{name:'Anna'}),/>A</);

const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
const browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173',shots=process.env.SHOTS||'';
const fakeTurnstile=`window.turnstile={render(el,o){el.dataset.rendered='1';window.__issue=()=>o.callback('token');setTimeout(window.__issue,30);return 'w';},reset(){setTimeout(window.__issue,30);}};`;

async function scenario({viewport,failProfile=false,theme='',path='/',register=true,signedIn=null}){
 const userUpdates=[],emailCalls=[],passwordCalls=[];let meta={username:'neuer.nutzer'},mail={email:'',verified:false};
 const user=()=>({id:'00000000-0000-4000-8000-000000000009',user_metadata:meta});
 const context=await browser.newContext({serviceWorkers:'block',locale:'de-DE',viewport});
 if(signedIn){mail=signedIn.mail||mail;await context.addInitScript(({user,daily})=>{if(localStorage.getItem('suomi-auth-session-v1'))return;localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'a',refresh_token:'r',user}));localStorage.setItem('suomi-learning-v1',JSON.stringify({reviews:{},favorites:[],daily,reports:{},writingRatings:{},verbProgress:{},prefs:{level:1,direction:'fi-de',audioOnly:false,activity:'verbs',speed:1}}));},{user:{id:'00000000-0000-4000-8000-000000000009',user_metadata:meta},daily:signedIn.daily});}
 await context.addInitScript(theme=>{try{sessionStorage.setItem('vanamo-intro-seen','1');if(theme)localStorage.setItem('vanamo-theme',theme);}catch{}},theme);
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(url.hostname==='challenges.cloudflare.com')return route.fulfill({status:200,contentType:'text/javascript',body:fakeTurnstile});
  if(url.hostname.endsWith('.supabase.co')){
   const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
   if(url.pathname==='/functions/v1/register')return json({recoveryCode:'ABCDE-FGHIJ-KLMNO-PQRST'},201);
   if(url.pathname==='/auth/v1/token')return json({access_token:'a',refresh_token:'r',user:user()});
   if(url.pathname==='/auth/v1/user'&&request.method()==='PUT'){
    const body=JSON.parse(request.postData());userUpdates.push(body);
    if(failProfile)return json({msg:'nope'},500);
    meta={...meta,...body.data};return json(user());
   }
   if(url.pathname==='/functions/v1/change-password'){
    const body=JSON.parse(request.postData());passwordCalls.push(body);
    return body.currentPassword==='ein-langes-passwort-123'?json({ok:true}):json({error:'Das aktuelle Passwort ist falsch.'},403);
   }
   if(url.pathname==='/functions/v1/account-email'){
    const body=JSON.parse(request.postData());emailCalls.push({...body,authorized:!!request.headers().authorization});
    const view=()=>({...mail,configured:true});
    if(body.action==='status')return json(view());
    if(body.action==='set'){mail={email:body.email,verified:false};return json(view());}
    if(body.action==='remove'){mail={email:'',verified:false};return json(view());}
    if(body.action==='verify')return body.token==='GUT'?json({ok:true}):json({error:'Der Link ist ungültig oder abgelaufen.'},400);
    if(body.action==='reset-request')return json({ok:true});
    if(body.action==='reset-confirm')return body.token==='RESET'?json({username:'neuer.nutzer'}):json({error:'Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.'},400);
    return json({error:'Unbekannte Aktion.'},400);
   }
   if(url.pathname.startsWith('/rest/v1/learning_state'))return route.fulfill({status:request.method()==='GET'?200:201,contentType:'application/json',body:request.method()==='GET'?'[]':''});
   if(url.pathname.startsWith('/rest/v1/rpc/'))return json({sentence_ids:[],translations:[]});
   return json({});
  }
  return route.abort();
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+path);await page.waitForTimeout(800);
 if(theme)await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
 if(!register)return {context,page,errors,userUpdates,emailCalls};
 await page.evaluate(()=>window.suomiOpenAccount('register'));
 await page.waitForFunction(()=>document.getElementById('register-turnstile')?.dataset.rendered==='1');
 await page.fill('#register-name','neuer.nutzer');await page.fill('#register-password','ein-langes-passwort-123');
 await page.waitForTimeout(120);
 return {context,page,errors,userUpdates,emailCalls,passwordCalls};
}
const shot=async(page,name)=>{if(!shots)return;await page.waitForTimeout(350);await page.screenshot({path:`${shots}/${name}.png`});};

try{
 // 1) Desktop: Vogel und Spitzname wählen
 let s=await scenario({viewport:{width:1280,height:900}}),{page}=s;
 await shot(page,'reg-1-schritt1');
 await page.click('#register-form button[type="submit"]');
 await page.waitForSelector('#account-onboarding:not([hidden])');
 assert.equal(await page.locator('#account-title').textContent(),'Fast fertig');
 assert.equal(await page.locator('#account-logged-in').isVisible(),false);assert.equal(await page.locator('#account-logged-out').isVisible(),false);
 assert.equal(await page.locator('#recovery-result').isVisible(),false,'der Code kommt erst nach Schritt 2');
 assert.equal(await page.locator('[data-avatar-choice]:visible').count(),11);
 assert.equal(await page.locator('#account-onboarding [data-avatar-choice][aria-pressed="true"]').count(),1,'ein Vogel ist vorausgewählt');
 assert.equal(await page.locator('#onboarding-nickname').getAttribute('placeholder'),'neuer.nutzer');
 await page.click('#account-onboarding [data-avatar-choice="sinitiainen"]');
 assert.equal(await page.locator('#onboarding-avatar-name strong').textContent(),'Sinitiainen');
 assert.equal(await page.locator('#onboarding-avatar-name span').textContent(),'Blaumeise');
 await page.fill('#onboarding-nickname','  Lumi ');
 // E-Mail ist freiwillig; das Häkchen „mindestens 16“ erscheint erst beim Tippen und ist dann Pflicht.
 assert.equal(await page.locator('#onboarding-adult-row').isVisible(),false);
 await page.fill('#onboarding-email','Lumi@Example.org');
 assert.equal(await page.locator('#onboarding-adult-row').isVisible(),true);
 await page.click('#account-onboarding button[type="submit"]');
 await page.waitForFunction(()=>/mindestens 16/.test(document.getElementById('account-status').textContent));
 assert.equal(await page.locator('#account-onboarding').isVisible(),true,'ohne Häkchen geht es nicht weiter');
 assert.equal(s.userUpdates.length,0);assert.equal(s.emailCalls.length,0);
 await page.fill('#onboarding-email','lumi@example');await page.click('#account-onboarding button[type="submit"]');
 await page.waitForFunction(()=>/gültige E-Mail-Adresse/.test(document.getElementById('account-status').textContent));
 await page.fill('#onboarding-email','Lumi@Example.org');await page.check('#onboarding-adult');
 await shot(page,'reg-2-schritt2');
 await page.click('#account-onboarding button[type="submit"]');
 await page.waitForSelector('#recovery-result:not([hidden])');
 assert.deepEqual(s.emailCalls,[{action:'set',lang:'de',email:'lumi@example.org',adult:true,authorized:true}]);
 assert.match(await page.locator('#account-status').textContent(),/Link geschickt/);
 assert.deepEqual(s.userUpdates,[{data:{nickname:'Lumi',avatar:'sinitiainen'}}]);
 assert.equal(await page.locator('#account-title').textContent(),'Dein Wiederherstellungscode');
 assert.equal(await page.locator('#recovery-code-result').textContent(),'ABCDE-FGHIJ-KLMNO-PQRST');
 assert.match(await page.locator('#recovery-result').textContent(),/Wir wissen nicht, wer du bist/);
 assert.equal(await page.locator('#account-onboarding').isVisible(),false);
 await shot(page,'reg-3-code');
 await page.click('#recovery-done');
 assert.equal(await page.evaluate(()=>document.getElementById('account-dialog').open),false);
 assert.equal(await page.locator('#recovery-code-result').textContent(),'','der Code bleibt nicht im Fenster stehen');
 // Konto-Icon zeigt den Vogel, die Begrüßung den Spitznamen
 assert.equal(await page.locator('#account-button.has-bird svg.avatar-art').count(),1);
 assert.equal(await page.locator('#account-button').getAttribute('aria-label'),'Konto');
 await page.waitForFunction(()=>/Lumi/.test(document.querySelector('#home-view .intro h1')?.textContent||''));
 // Konto verwalten: vorausgefüllt, ändern, speichern
 await page.click('#account-button');await page.click('#account-manage');
 await page.waitForSelector('#profile-form:visible');
 assert.equal(await page.locator('#account-title').textContent(),'Dein Konto');
 assert.equal(await page.locator('#profile-nickname').inputValue(),'Lumi');
 assert.equal(await page.locator('#profile-form [data-avatar-choice="sinitiainen"]').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#account-name').textContent(),'neuer.nutzer');
 assert.ok(await page.locator('#sync-now').isVisible());
 // E-Mail zum Zurücksetzen: Stand wird geladen, noch nicht bestätigt → „Link erneut senden“
 await page.waitForFunction(()=>/Noch nicht bestätigt/.test(document.getElementById('email-state').textContent));
 assert.equal(await page.locator('#profile-email').inputValue(),'lumi@example.org');
 assert.equal(await page.locator('#email-save').textContent(),'Link erneut senden');
 assert.equal(await page.locator('#profile-adult').isChecked(),true);
 await shot(page,'konto-verwalten');
 await page.click('#email-save');
 await page.waitForFunction(()=>/Bestätigungslink geschickt/.test(document.getElementById('account-status').textContent));
 assert.equal(s.emailCalls.at(-1).action,'set');
 await page.click('#email-remove');
 await page.waitForFunction(()=>/Keine Adresse hinterlegt/.test(document.getElementById('email-state').textContent));
 assert.equal(s.emailCalls.at(-1).action,'remove');assert.equal(await page.locator('#profile-email').inputValue(),'');
 assert.equal(await page.locator('#email-remove').isVisible(),false);assert.equal(await page.locator('#profile-adult-row').isVisible(),false);
 await page.click('#email-save');
 await page.waitForFunction(()=>/Bitte gib eine E-Mail-Adresse ein/.test(document.getElementById('account-status').textContent));
 // Passwort ändern: falsches aktuelles Passwort wird gemeldet, danach klappt es und man bleibt angemeldet
 await page.fill('#password-current','falsches-passwort');await page.fill('#password-new','noch-ein-neues-passwort');await page.click('#password-save');
 await page.waitForFunction(()=>/aktuelle Passwort ist falsch/.test(document.getElementById('account-status').textContent));
 assert.equal(await page.evaluate(()=>document.getElementById('password-form').nextElementSibling.id),'account-status');
 await page.fill('#password-current','ein-langes-passwort-123');await page.fill('#password-new','ein-langes-passwort-123');await page.click('#password-save');
 await page.waitForFunction(()=>/vom aktuellen unterscheiden/.test(document.getElementById('account-status').textContent));
 assert.equal(s.passwordCalls.length,1,'gleiches Passwort geht gar nicht erst an den Server');
 await page.fill('#password-new','noch-ein-neues-passwort');await page.click('#password-save');
 await page.waitForFunction(()=>/Passwort geändert/.test(document.getElementById('account-status').textContent));
 assert.deepEqual(s.passwordCalls.at(-1),{currentPassword:'ein-langes-passwort-123',newPassword:'noch-ein-neues-passwort'});
 assert.equal(await page.locator('#password-current').inputValue(),'');assert.equal(await page.evaluate(()=>document.body.dataset.account),'authenticated');
 await shot(page,'passwort-aendern');
 await page.click('#profile-form [data-avatar-choice="kurki"]');await page.fill('#profile-nickname','Lumikki');
 await page.click('#profile-save');
 await page.waitForFunction(()=>document.getElementById('account-status').textContent==='Gespeichert.');
 assert.equal(await page.evaluate(()=>document.getElementById('profile-form').nextElementSibling.id),'account-status','Meldung steht direkt unter dem Formular');
 assert.deepEqual(s.userUpdates.at(-1),{data:{nickname:'Lumikki',avatar:'kurki'}});
 await page.click('#close-account');
 assert.match(await page.locator('#account-button svg').innerHTML(),/C8372D/,'Icon zeigt jetzt den Kranich');
 await page.waitForFunction(()=>/Lumikki/.test(document.querySelector('#home-view .intro h1')?.textContent||''));
 assert.deepEqual(s.errors,[]);
 await s.context.close();

 // 2) Handy: Schritt 2 mit Escape schließen = überspringen; der Code erscheint trotzdem
 s=await scenario({viewport:{width:390,height:800}});page=s.page;
 await page.click('#register-form button[type="submit"]');
 await page.waitForSelector('#account-onboarding:not([hidden])');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'kein Querscrollen');
 await shot(page,'reg-2-schritt2-handy');
 await page.keyboard.press('Escape');
 await page.waitForSelector('#recovery-result:not([hidden])');
 assert.equal(await page.evaluate(()=>document.getElementById('account-dialog').open),true);
 assert.equal(s.userUpdates.length,1);assert.equal(s.userUpdates[0].data.nickname,'neuer.nutzer');
 assert.ok(AVATARS.some(a=>a.id===s.userUpdates[0].data.avatar),'zufälliger Vogel beim Überspringen');
 await shot(page,'reg-3-code-handy');
 assert.deepEqual(s.errors,[]);
 await s.context.close();

 // 3) Speichern schlägt fehl: Konto und Code bleiben, Vogel lässt sich später wählen
 s=await scenario({viewport:{width:1280,height:900},failProfile:true});page=s.page;
 await page.click('#register-form button[type="submit"]');
 await page.waitForSelector('#account-onboarding:not([hidden])');
 await page.click('#onboarding-skip');
 await page.waitForSelector('#recovery-result:not([hidden])');
 assert.match(await page.locator('#account-status').textContent(),/später unter „Konto verwalten“/);
 await page.click('#recovery-done');
 assert.equal(await page.locator('#account-button.is-avatar').textContent(),'N','ohne Vogel: Anfangsbuchstabe');
 assert.deepEqual(s.errors,[]);
 await s.context.close();

 // 4) Passwort vergessen: Link per E-Mail anfordern (ohne Konto, immer dieselbe Antwort)
 s=await scenario({viewport:{width:1280,height:900},register:false});page=s.page;
 await page.evaluate(()=>window.suomiOpenAccount('recover'));
 await page.waitForSelector('#reset-request-form:visible');
 assert.ok(await page.locator('#recover-form').isVisible(),'der Weg über den Wiederherstellungscode bleibt');
 await shot(page,'passwort-vergessen');
 await page.fill('#reset-identifier','Lumi@Example.org');await page.click('#reset-request-form button');
 await page.waitForFunction(()=>/ist jetzt ein Link unterwegs/.test(document.getElementById('account-status').textContent));
 assert.deepEqual(s.emailCalls,[{action:'reset-request',lang:'de',identifier:'Lumi@Example.org',authorized:false}]);
 // Die Meldung steht direkt unter dem Knopf (sichtbar, ohne zu scrollen); der Knopf ist kurz gesperrt, ein zweiter Klick schickt nichts.
 assert.equal(await page.locator('#reset-request-form #account-status').count(),1);
 assert.ok(await page.locator('#account-status').evaluate(el=>{const r=el.getBoundingClientRect(),d=el.closest('dialog').getBoundingClientRect();return r.top>=d.top&&r.bottom<=d.bottom&&r.bottom<=innerHeight;}),'Meldung im sichtbaren Bereich');
 assert.equal(await page.locator('#reset-request-form button').textContent(),'Link gesendet');
 assert.equal(await page.locator('#reset-request-form button').isDisabled(),true);
 await page.locator('#reset-request-form button').click({force:true});await page.waitForTimeout(150);
 assert.equal(s.emailCalls.length,1);
 await shot(page,'passwort-vergessen-gesendet');
 await page.click('[data-account-tab="login"]');
 assert.equal(await page.locator('#reset-request-form').isVisible(),false);
 assert.deepEqual(s.errors,[]);
 await s.context.close();

 // 5) Link aus der Mail: neues Passwort festlegen, danach angemeldet; der Token steht nicht mehr in der Adresszeile
 s=await scenario({viewport:{width:1280,height:900},register:false,path:'/?reset=RESET'});page=s.page;
 await page.waitForSelector('#reset-form:visible');
 assert.equal(await page.locator('#account-title').textContent(),'Neues Passwort');
 assert.equal(await page.evaluate(()=>location.search),'');
 assert.equal(await page.locator('#account-logged-out').isVisible(),false);
 await shot(page,'neues-passwort');
 await page.fill('#reset-password','kurz');await page.locator('#reset-form').evaluate(f=>{f.noValidate=true;});await page.click('#reset-form button');
 await page.waitForFunction(()=>/8–72 Zeichen/.test(document.getElementById('account-status').textContent));
 assert.equal(s.emailCalls.length,0);
 await page.fill('#reset-password','ein-ganz-neues-passwort');await page.click('#reset-form button');
 await page.waitForFunction(()=>!document.getElementById('account-dialog').open);
 assert.deepEqual(s.emailCalls,[{action:'reset-confirm',lang:'de',token:'RESET',newPassword:'ein-ganz-neues-passwort',authorized:false}]);
 assert.equal(await page.evaluate(()=>document.body.dataset.account),'authenticated');
 assert.match(await page.locator('.account-notice').textContent(),/Passwort geändert/);
 assert.deepEqual(s.errors,[]);
 await s.context.close();

 // 6) Abgelaufener Link: Meldung im Fenster, nichts wird geändert
 s=await scenario({viewport:{width:1280,height:900},register:false,path:'/?reset=ALT'});page=s.page;
 await page.waitForSelector('#reset-form:visible');
 await page.fill('#reset-password','ein-ganz-neues-passwort');await page.click('#reset-form button');
 await page.waitForFunction(()=>/ungültig oder abgelaufen/.test(document.getElementById('account-status').textContent));
 assert.equal(await page.evaluate(()=>document.body.dataset.account),'guest');
 await s.context.close();

 // 7) Bestätigungslink: Hinweis unten, Token weg aus der Adresszeile
 s=await scenario({viewport:{width:390,height:800},register:false,path:'/?verify-email=GUT'});page=s.page;
 await page.waitForSelector('.account-notice');
 assert.match(await page.locator('.account-notice').textContent(),/E-Mail-Adresse ist bestätigt/);
 assert.equal(await page.evaluate(()=>location.search),'');
 assert.deepEqual(s.emailCalls,[{action:'verify',lang:'de',token:'GUT',authorized:false}]);
 await shot(page,'bestaetigt-handy');
 await s.context.close();
 s=await scenario({viewport:{width:1280,height:900},register:false,path:'/?verify-email=FALSCH'});page=s.page;
 await page.waitForSelector('.account-notice.error');
 assert.match(await page.locator('.account-notice').textContent(),/ungültig oder abgelaufen/);
 await s.context.close();

 // 8) „Sichere deinen Fortschritt“: drei Tage in Folge und keine E-Mail → einmal ein Hinweis mit Knopf
 const days=n=>Object.fromEntries(Array.from({length:n},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return [d.toLocaleDateString('sv-SE'),5];}));
 s=await scenario({viewport:{width:1280,height:900},register:false,signedIn:{daily:days(3)}});page=s.page;
 await page.mouse.click(5,5);
 await page.waitForSelector('.account-notice.has-action',{timeout:30000});
 assert.match(await page.locator('.account-notice').textContent(),/Schon 3 Tage in Folge! Sichere deinen Fortschritt/);
 assert.deepEqual(s.emailCalls.map(c=>c.action),['status']);
 await shot(page,'hinweis-fortschritt-sichern');
 await page.click('.account-notice-action');
 await page.waitForSelector('#email-form:visible');
 assert.equal(await page.locator('.account-notice').count(),0);
 await page.waitForFunction(()=>document.activeElement.id==='profile-email');
 await page.click('#close-account');
 await page.reload();await page.waitForTimeout(800);await page.mouse.click(5,5);await page.waitForTimeout(9000);
 assert.equal(await page.locator('.account-notice').count(),0,'der Hinweis kommt nur einmal');
 assert.deepEqual(s.errors,[]);
 await s.context.close();
 // Mit hinterlegter Adresse oder kürzerer Serie kommt kein Hinweis
 s=await scenario({viewport:{width:1280,height:900},register:false,signedIn:{daily:days(3),mail:{email:'lumi@example.org',verified:true}}});page=s.page;
 await page.mouse.click(5,5);await page.waitForFunction(()=>!!localStorage.getItem('vanamo-email-hint-00000000-0000-4000-8000-000000000009'),null,{timeout:30000});
 await page.waitForTimeout(500);assert.equal(await page.locator('.account-notice').count(),0);
 await s.context.close();
 s=await scenario({viewport:{width:1280,height:900},register:false,signedIn:{daily:days(2)}});page=s.page;
 await page.mouse.click(5,5);await page.waitForTimeout(9000);
 assert.equal(await page.locator('.account-notice').count(),0);assert.equal(s.emailCalls.length,0,'unter drei Tagen wird gar nicht erst nachgefragt');
 await s.context.close();

 // 9) Dunkles Farbschema (nur Bild)
 if(shots){s=await scenario({viewport:{width:1280,height:900},theme:'kaamos'});page=s.page;await page.click('#register-form button[type="submit"]');await page.waitForSelector('#account-onboarding:not([hidden])');await shot(page,'reg-2-schritt2-dunkel');await s.context.close();}
 console.log('PASS: Registrierung in zwei Schritten, Vogel im Konto-Icon, Vogel und Spitzname ändern, E-Mail hinterlegen/entfernen, Passwort per Link zurücksetzen, Bestätigungslink, Hinweis „Sichere deinen Fortschritt“');
}finally{await browser.close();server.kill();}
