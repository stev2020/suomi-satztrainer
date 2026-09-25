// Klickt die App in einer anderen Oberflächensprache durch und listet Texte, die noch deutsch aussehen.
// Aufruf: node scripts/check-ui-language.mjs [sprache]   (Standard: en)
// Hilfswerkzeug für Übersetzende – kein Test, der fehlschlägt.
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const lang=process.argv[2]||'en';
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit'],cwd:new URL('..',import.meta.url)});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
const GERMAN=/[äöüÄÖÜß]|\b(der|die|das|und|oder|nicht|mit|für|von|zu|dein|deine|du|ist|sind|wird|Sätze|Satz|Wort|Wörter|Konto|Übung|Klassenraum|bitte|noch|heute|alle|ein|eine|auf|im|den|dem|zum|zur|wie|neu|neue|Lernstand|Aufgabe|Anmelden|Weiter|Zurück|Schließen|Prüfen|Leicht|Schwer|Nochmal|wählen|zeigen|Übersetzung|Hören|Diktat|Endungen|Spiele)\b/;
const found=new Map();
let browser;
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:lang==='en'?'en-US':lang});
  await context.addInitScript(l=>{try{localStorage.setItem('vanamo-ui-lang',l);}catch{}},lang);
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();
  page.on('dialog',d=>{collect('confirm-dialog',[d.message()]);d.dismiss();});
  async function scan(step){
   const texts=await page.evaluate(()=>{
    const out=[];
    const skip=el=>el.closest('script,style,textarea,[data-no-i18n]')||(el.closest('[lang]')&&el.closest('[lang]')!==document.documentElement);
    const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
    for(let n=w.nextNode();n;n=w.nextNode()){
     if(n.nodeType===3){const el=n.parentElement;if(el&&!skip(el)&&n.data.trim())out.push(n.data.replace(/\s+/g,' ').trim());}
     else for(const a of ['aria-label','placeholder','title','alt'])if(n.getAttribute(a)&&(!skip(n)||/\s/.test(n.getAttribute(a))))out.push('['+a+'] '+n.getAttribute(a));
    }
    return out;
   });
   collect(step,texts);
  }
  function collect(step,texts){for(const t of texts)if(GERMAN.test(t)){if(!found.has(t))found.set(t,new Set());found.get(t).add(step);}}
  async function step(name,fn){try{await fn();await page.waitForTimeout(250);await scan(name);}catch(e){console.error('Schritt übersprungen:',name,'–',e.message.split('\n')[0]);}}
  const click=sel=>page.locator(sel).first().click({timeout:4000});
  const home=async()=>{if(await page.locator('.app-view:not([hidden]) .back-link[data-view="home"]').count())await click('.app-view:not([hidden]) .back-link[data-view="home"]');else{await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor();}};
  await page.goto(origin);
  await page.locator('#start-new-sentences:not([disabled])').waitFor();
  await step('start',async()=>{});
  await step('weitere-übungen',()=>click('#more-exercises > summary'));
  for(const activity of ['translate','listen','dictation','verbs','endings','dialogs','suchsel']){
   await step('auswahl-'+activity,async()=>{await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor();await click('#more-exercises > summary');await click(`[data-home-activity="${activity}"]`);});
   await step('übung-'+activity,async()=>{await click('#continue-practice');if(await page.locator('#guest-continue').isVisible())await click('#guest-continue');});
   await step('übung-'+activity+'-start',async()=>{const b=page.locator('#practice-view button:visible').filter({hasText:/^\s*(5|10)\b/});if(await b.count())await b.first().click();});
   await step('übung-'+activity+'-aufdecken',async()=>{if(await page.locator('#reveal:visible').count())await click('#reveal');});
  }
  await step('neue-sätze',async()=>{await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').click();if(await page.locator('#guest-continue').isVisible())await click('#guest-continue');});
  await step('neue-sätze-aufdecken',()=>click('#reveal'));
  await step('wort-antippen',()=>click('#card .fi-word'));
  await step('quellen',()=>click('#card details.sources summary'));
  await step('melden',async()=>{const b=page.locator('button:visible',{hasText:/report|melden/i});if(await b.count())await b.first().click();});
  await step('einstellungen',async()=>{await page.keyboard.press('Escape');const s=page.locator('#practice-settings summary');if(await s.count())await s.click();});
  await step('spiele',async()=>{await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor();await click('#games-nav');});
  await step('konto',async()=>{await page.goto(origin);await page.locator('#start-new-sentences:not([disabled])').waitFor();await click('#account-button');});
  await step('konto-registrieren',()=>click('[data-account-tab="register"]'));
  await step('konto-passwort',()=>click('[data-account-tab="recover"]'));
  await step('konto-fehler',async()=>{await click('[data-account-tab="login"]');const f=page.locator('#login-form button[type="submit"]');if(await f.count())await f.click();});
  await context.close();
 }
 // Angemeldet (Serverantworten werden simuliert): Konto, Fortschritt, Klassenräume.
 {
  const session={access_token:'t',refresh_token:'r',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'00000000-0000-4000-8000-000000000001',user_metadata:{username:'checker'}}};
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block',locale:lang==='en'?'en-US':lang});
  await context.addInitScript(({l,session})=>{try{localStorage.setItem('vanamo-ui-lang',l);if(!localStorage.getItem('suomi-auth-session-v1'))localStorage.setItem('suomi-auth-session-v1',JSON.stringify(session));}catch{}},{l:lang,session});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin===origin)return route.continue();if(u.hostname.endsWith('.supabase.co')){if(u.pathname==='/auth/v1/token')return route.fulfill({json:session});return route.fulfill({json:[]});}return route.abort();});
  const page=await context.newPage();
  page.on('dialog',d=>{collect('confirm-dialog',[d.message()]);d.dismiss();});
  async function scan(step){const texts=await page.evaluate(()=>{const out=[];const skip=el=>el.closest('script,style,textarea,[data-no-i18n]')||(el.closest('[lang]')&&el.closest('[lang]')!==document.documentElement);const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);for(let n=w.nextNode();n;n=w.nextNode()){if(n.nodeType===3){const el=n.parentElement;if(el&&!skip(el)&&n.data.trim())out.push(n.data.replace(/\s+/g,' ').trim());}else for(const a of ['aria-label','placeholder','title','alt'])if(n.getAttribute(a)&&(!skip(n)||/\s/.test(n.getAttribute(a))))out.push('['+a+'] '+n.getAttribute(a));}return out;});collect(step,texts);}
  function collect(step,texts){for(const t of texts)if(GERMAN.test(t)){if(!found.has(t))found.set(t,new Set());found.get(t).add(step);}}
  async function step(name,fn){try{await fn();await page.waitForTimeout(400);await scan(name);}catch(e){console.error('Schritt übersprungen:',name,'–',e.message.split('\n')[0]);}}
  const click=sel=>page.locator(sel).first().click({timeout:4000});
  await page.goto(origin);
  await step('angemeldet-start',()=>page.locator('#start-new-sentences:not([disabled])').waitFor());
  await step('angemeldet-konto',()=>click('#account-button'));
  await step('angemeldet-fortschritt',async()=>{await click('#account-progress');});
  await step('angemeldet-klassenräume',async()=>{const b=page.locator('button:visible',{hasText:/Klassenr|classroom/i});if(await b.count())await b.first().click();});
  await context.close();
 }
}finally{await browser?.close();server.kill();}
const list=[...found].sort((a,b)=>a[0].localeCompare(b[0]));
for(const [t,steps] of list)console.log(JSON.stringify(t),'  ←',[...steps].slice(0,3).join(', '));
console.log(`\n${list.length} Texte sehen noch deutsch aus (Sprache: ${lang}).`);
