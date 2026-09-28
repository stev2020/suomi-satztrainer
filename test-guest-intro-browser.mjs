// Intro für Gäste: Ablauf, Überspringen per Klick, Aufräumen, kein Intro ohne Bedarf.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;
const errors=[];
const classes=page=>page.evaluate(()=>document.documentElement.className);
const opacity=(page,sel)=>page.locator(sel).first().evaluate(el=>Number(getComputedStyle(el).opacity));
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const newPage=async(options={})=>{
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',locale:'de-DE',...options});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
 };

 // Automatisierte Browser (alle anderen Tests) bekommen kein Intro.
 let page=await newPage();
 await page.goto(origin);
 assert.doesNotMatch(await classes(page),/intro-/);
 assert.equal(await opacity(page,'header'),1);
 await page.context().close();

 // Mit ?intro: Seite verborgen, Überschrift groß, danach alles aufgeräumt.
 page=await newPage();
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.documentElement.classList.contains('intro-running'));
 await page.waitForTimeout(600);
 assert.equal(await opacity(page,'header .header-nav'),0,'header navigation hidden during intro');
 assert.equal(await opacity(page,'header'),1,'logo and name stay visible from the start');
 assert.equal(await opacity(page,'header .brand'),1);
 assert.equal(await opacity(page,'#home-view .today'),0);
 const scale=await page.locator('#home-view .intro h1').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a);
 assert.ok(scale>1.5,`headline starts large (scale ${scale})`);
 // Satz steht zuerst allein, dann wächst die Karte
 await page.waitForFunction(()=>document.getElementById('guest-card')?.classList.contains('intro-bare'),null,{timeout:8000});
 assert.equal(await opacity(page,'#guest-card .guest-top'),0,'card chrome hidden while the sentence stands alone');
 assert.equal(await page.locator('#guest-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.waitForFunction(()=>!/intro-/.test(document.documentElement.className),null,{timeout:8000});
 assert.equal(await page.locator('#guest-card').evaluate(el=>el.className.includes('intro-')),false,'card classes cleaned up');
 assert.equal(await page.locator('#home-view .intro h1').evaluate(el=>el.style.transform),'');
 assert.equal(await opacity(page,'header'),1);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vanamo-intro-seen')),'1');
 await page.context().close();

 // Handy mit Hänger: Blockiert der Browser, während „Ein bisschen Finnisch.“ einblendet
 // (z. B. beim Verarbeiten der Satzdaten), kommt „Jeden Tag.“ trotzdem erst mit sichtbarem Abstand.
 page=await newPage({viewport:{width:390,height:780},isMobile:true,hasTouch:true});
 await page.addInitScript(()=>{
  window.__introLog=[];const animate=Element.prototype.animate;
  Element.prototype.animate=function(...args){if(this.matches?.('.intro-lead,.intro-tail'))window.__introLog.push([this.className,performance.now()]);return animate.apply(this,args);};
 });
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>window.__introLog.length>=1);
 const blockEnd=await page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{const end=performance.now()+1000;while(performance.now()<end){}resolve(performance.now());},200)));
 await page.waitForFunction(()=>window.__introLog.length>=2,null,{timeout:8000});
 const log=Object.fromEntries(await page.evaluate(()=>window.__introLog));
 assert.ok(log['intro-tail']-blockEnd>=350,`tail waits for visible time after the stall (${Math.round(log['intro-tail']-blockEnd)} ms)`);
 assert.ok(log['intro-tail']-log['intro-lead']>=1150,`gap lead → tail ${Math.round(log['intro-tail']-log['intro-lead'])} ms`);
 await page.context().close();

 // Klick überspringt sofort.
 page=await newPage();
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.documentElement.classList.contains('intro-running'));
 await page.mouse.click(640,400);
 assert.doesNotMatch(await classes(page),/intro-/);
 assert.equal(await opacity(page,'header'),1);
 assert.equal(await page.locator('#home-view .intro h1').evaluate(el=>getComputedStyle(el).transform),'none');
 await page.context().close();

 // Angemeldete bekommen kein Intro, auch nicht mit ?intro.
 page=await newPage();
 await page.addInitScript(()=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'a',refresh_token:'r',user:{id:'u'}})));
 await page.goto(origin+'/?intro');
 assert.doesNotMatch(await classes(page),/intro-/);
 await page.context().close();

 assert.deepEqual(errors,[]);
 console.log('PASS: guest intro sequence, card reveal, skip on click, cleanup, no intro for automation or signed-in users.');
}finally{
 await browser?.close();server.kill();
}
