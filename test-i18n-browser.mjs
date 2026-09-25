import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(r=>server.stdout.once('data',r));
const b=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
try{const c=await b.newContext({locale:'de-DE',serviceWorkers:'block'});await c.route('**/*',r=>new URL(r.request().url()).origin==='http://localhost:4173'?r.continue():r.abort());
const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:4173');await p.locator('#start-new-sentences:not([disabled])').waitFor();
assert.equal((await p.locator('#games-nav').textContent()).trim(),'Spiele');assert.equal(await p.evaluate(()=>document.documentElement.lang),'de');
await p.locator('select[data-ui-language]').selectOption('en');await p.waitForLoadState('load');await p.locator('#start-new-sentences:not([disabled])').waitFor();
assert.equal((await p.locator('#games-nav').textContent()).trim(),'Games');assert.equal(await p.evaluate(()=>document.documentElement.lang),'en');
assert.equal(await p.evaluate(()=>document.documentElement.classList.contains('i18n-pending')),false);
await p.locator('select[data-ui-language]').selectOption('de');await p.waitForLoadState('load');await p.locator('#start-new-sentences:not([disabled])').waitFor();
assert.equal((await p.locator('#games-nav').textContent()).trim(),'Spiele');
assert.deepEqual(errors,[]);console.log('Sprachwahl: Deutsch → Englisch → Deutsch, html lang, keine Fehler.');}finally{await b.close();server.kill();}
