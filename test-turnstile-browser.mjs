// Browser test: Cloudflare Turnstile on the registration form. The Turnstile
// script and all Supabase calls are mocked; nothing leaves the machine.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Server exited: '+code)));});
const browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173';
const fakeTurnstile=`window.turnstile={
 render(el,o){window.__turnstileOptions={sitekey:o.sitekey,action:o.action,theme:o.theme};el.dataset.rendered='1';
  window.__issue=()=>o.callback('token-'+(++window.__tokens));window.__tokens=0;setTimeout(window.__issue,30);return 'widget-1';},
 reset(id){window.__resets=(window.__resets||0)+1;setTimeout(window.__issue,30);}
};`;
let turnstileLoads=0,registerBodies=[],registerStatus=201;
const context=await browser.newContext({serviceWorkers:'block',locale:'de-DE'});
await context.addInitScript(()=>{try{sessionStorage.setItem('vanamo-intro-seen','1')}catch{}});
await context.route('**/*',async route=>{
 const request=route.request(),url=new URL(request.url());
 if(url.origin===origin)return route.continue();
 if(url.hostname==='challenges.cloudflare.com'){
  turnstileLoads++;
  assert.equal(url.pathname,'/turnstile/v0/api.js');assert.equal(url.searchParams.get('render'),'explicit');
  return route.fulfill({status:200,contentType:'text/javascript',body:fakeTurnstile});
 }
 if(url.hostname.endsWith('.supabase.co')){
  if(url.pathname==='/functions/v1/register'){
   registerBodies.push(JSON.parse(request.postData()));
   return route.fulfill({status:registerStatus,contentType:'application/json',body:JSON.stringify(registerStatus===201?{recoveryCode:'ABCDE-FGHIJ'}:{error:'Die Sicherheitsprüfung ist fehlgeschlagen. Bitte versuche es erneut.'})});
  }
  if(url.pathname==='/auth/v1/token')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'a',refresh_token:'r',user:{id:'00000000-0000-4000-8000-000000000009',user_metadata:{username:'neuer.nutzer'}}})});
  if(url.pathname.startsWith('/rest/v1/learning_state'))return route.fulfill({status:request.method()==='GET'?200:201,contentType:'application/json',body:request.method()==='GET'?'[]':''});
  if(url.pathname.startsWith('/rest/v1/rpc/'))return route.fulfill({status:200,contentType:'application/json',body:'{"sentence_ids":[],"translations":[]}'});
  return route.fulfill({status:200,contentType:'application/json',body:'{}'});
 }
 return route.abort();
});
const page=await context.newPage();
const violations=[];
await page.exposeBinding('__csp',(_,v)=>violations.push(v));
await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.__csp(e.effectiveDirective+' '+e.blockedURI)));
try{
 await page.goto(origin+'/');
 await page.waitForTimeout(800);
 assert.equal(turnstileLoads,0,'Turnstile is not loaded on a normal visit');
 await page.evaluate(()=>window.suomiOpenAccount('login'));
 await page.waitForTimeout(300);
 assert.equal(turnstileLoads,0,'login tab does not load Turnstile');
 await page.click('[data-account-tab="register"]');
 await page.waitForFunction(()=>document.getElementById('register-turnstile')?.dataset.rendered==='1');
 assert.equal(turnstileLoads,1,'register tab loads Turnstile once');
 const options=await page.evaluate(()=>window.__turnstileOptions);
 assert.equal(options.sitekey,'0x4AAAAAAFLVAmUovPe5SRhL');assert.equal(options.action,'register');
 await page.click('[data-account-tab="login"]');await page.click('[data-account-tab="register"]');
 assert.equal(turnstileLoads,1,'switching tabs does not load or render twice');

 // Failed attempt: token is used once, widget is reset for the next attempt.
 registerStatus=400;
 await page.fill('#register-name','neuer.nutzer');await page.fill('#register-password','ein-langes-passwort-123');
 await page.waitForTimeout(100);
 await page.click('#register-form button[type="submit"]');
 await page.waitForFunction(()=>/Sicherheitsprüfung/.test(document.getElementById('account-status').textContent));
 assert.equal(registerBodies.at(-1).turnstileToken,'token-1','token is sent with the registration');
 assert.equal(await page.evaluate(()=>window.__resets),1,'widget reset after an attempt');

 // Second attempt with a fresh token succeeds.
 registerStatus=201;
 await page.waitForTimeout(150);
 await page.click('#register-form button[type="submit"]');
 await page.waitForSelector('#account-onboarding:not([hidden])');await page.click('#onboarding-skip');
 await page.waitForFunction(()=>!document.getElementById('recovery-result').hidden);
 assert.equal(registerBodies.at(-1).turnstileToken,'token-2','a fresh token is used for the next attempt');
 assert.deepEqual(violations,[],'CSP allows Turnstile');

 // Datenschutz names Turnstile.
 await page.goto(origin+'/datenschutz.html');
 assert(/Cloudflare Turnstile/.test(await page.textContent('body')),'privacy policy mentions Turnstile');
 console.log('PASS: Turnstile lädt erst beim Registrieren, Token wird gesendet und nach jedem Versuch erneuert, CSP erlaubt es, Datenschutz erwähnt es.');
}finally{await browser.close();server.kill();}
