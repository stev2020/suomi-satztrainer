// Intro für Gäste: Vogelschwarm schreibt die Überschrift, Vogel wird zum Logo, zwei Schwalben bleiben;
// Überspringen per Klick, Aufräumen, kein Intro ohne Bedarf.
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
 assert.equal(await page.locator('canvas.intro-birds').count(),0,'no birds for automated browsers');
 assert.equal(await opacity(page,'header .brand-mark svg'),1,'logo drawn');
 assert.equal(await page.locator('#home-view .today').isVisible(),false,'guests see no "heute geübt" counter');
 await page.context().close();

 // Mit ?intro: Seite verborgen, Logo-Kachel leer, der Schwarm schreibt die Überschrift groß in die Mitte,
 // der farbige Vogel wird zum Logo, danach alles aufgeräumt und zwei Schwalben sitzen auf dem Knopf.
 const pets=page=>page.evaluate(()=>document.querySelector('canvas.intro-birds')?.dataset.pets||'');
 const written=(page,sel)=>page.locator(`${sel} .intro-ch.on`).count();
 page=await newPage();
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.documentElement.classList.contains('intro-running')&&document.querySelector('canvas.intro-birds'));
 await page.waitForTimeout(600);
 assert.equal(await opacity(page,'header .header-nav'),0,'header navigation hidden during intro');
 assert.equal(await opacity(page,'header'),1,'name stays visible from the start');
 assert.equal(await opacity(page,'header .brand'),1);
 assert.equal(await opacity(page,'header .brand-mark svg'),0,'logo tile starts empty');
 assert.equal(await page.locator('canvas.intro-birds').evaluate(el=>getComputedStyle(el).pointerEvents),'none','birds never catch clicks');
 assert.equal(await written(page,'#home-view .intro h1'),0,'no letters while the flock circles');
 // Beide Zeilen stehen (noch unsichtbar) groß an derselben Stelle in der Bildschirmmitte.
 const lineState=sel=>page.locator(sel).evaluate(el=>{const r=el.getBoundingClientRect();return {scale:new DOMMatrix(getComputedStyle(el).transform).a,x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)};});
 const leadBig=await lineState('.intro-lead'),tailBig=await lineState('.intro-tail');
 assert.ok(leadBig.scale>1.5,`first line starts large (scale ${leadBig.scale})`);
 assert.ok(Math.abs(leadBig.x-640)<=2,`first line centred (${leadBig.x})`);
 assert.ok(Math.abs(tailBig.x-leadBig.x)<=2&&Math.abs(tailBig.y-leadBig.y)<=6,`second line appears where the first one does (${tailBig.x},${tailBig.y} vs ${leadBig.x},${leadBig.y})`);
 // Der Schwarm schreibt erst „Ein bisschen Finnisch.“; „Jeden Tag.“ wartet, bis die erste Zeile fertig ist.
 await page.waitForFunction(()=>{const c=[...document.querySelectorAll('.intro-lead .intro-ch')];return c.length&&c.every(x=>x.classList.contains('on'));},null,{timeout:10000});
 assert.equal(await written(page,'.intro-tail'),0,'second line waits until the first one is written');
 await page.waitForFunction(()=>document.querySelectorAll('.intro-tail .intro-ch.on').length>0,null,{timeout:8000});
 assert.ok(await page.locator('.intro-lead').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).a)<leadBig.scale,'first line on its way to its place while the second is written');
 // Der farbige Vogel landet im Logo (Kachel gefüllt); der Satz steht zuerst allein, dann kommt der Rest.
 await page.waitForFunction(()=>{if(document.querySelector('header .brand-mark')?.classList.contains('is-filled'))window.__filled=true;return document.getElementById('guest-card')?.classList.contains('intro-bare');},null,{timeout:10000});
 assert.equal(await opacity(page,'#guest-card .guest-top'),0,'card chrome hidden while the sentence stands alone');
 assert.equal(await page.locator('#guest-card').evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
 await page.waitForFunction(()=>{if(document.querySelector('header .brand-mark')?.classList.contains('is-filled'))window.__filled=true;return !/intro-/.test(document.documentElement.className);},null,{timeout:10000});
 assert.equal(await page.evaluate(()=>window.__filled),true,'the coloured bird filled the logo tile');
 assert.equal(await page.locator('#guest-card').evaluate(el=>el.className.includes('intro-')),false,'card classes cleaned up');
 assert.deepEqual(await page.locator('.intro-lead,.intro-tail').evaluateAll(els=>els.map(el=>el.style.transform+el.style.display+'|'+el.textContent+'|'+el.children.length)),['|Ein bisschen Finnisch.|0','|Jeden Tag.|0'],'headline restored to plain text');
 assert.equal(await page.locator('#home-view .intro h1').getAttribute('class')||'','','headline class cleaned up');
 assert.equal(await page.locator('header .brand-mark').getAttribute('class'),'brand-mark','logo classes cleaned up');
 assert.equal(await opacity(page,'header .brand-mark svg'),1,'logo drawn at the end');
 assert.equal(await opacity(page,'header'),1);
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vanamo-intro-seen')),'1');
 // Zwei Schwalben setzen sich auf den Hauptknopf. Kommt die Maus in ihre Nähe, fliegen sie zusammen
 // auf und setzen sich woanders wieder hin.
 await page.waitForFunction(()=>document.querySelector('canvas.intro-birds')?.dataset.pets==='sit:button',null,{timeout:10000});
 const edge=await page.locator('#guest-card .guest-first').evaluate(el=>{const r=el.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top};});
 await page.mouse.move(edge.l-80,edge.t-80);
 for(let x=edge.l;x<=edge.r&&await pets(page)==='sit:button';x+=10)await page.mouse.move(x,edge.t-4);
 assert.equal(await pets(page),'fly','birds take off when the pointer comes close');
 await page.waitForFunction(()=>/^sit:(?!button)/.test(document.querySelector('canvas.intro-birds')?.dataset.pets),null,{timeout:10000});
 // Der Knopf darunter bleibt bedienbar.
 await page.locator('#guest-card .guest-first').click();
 await page.context().close();

 // Handy mit Hänger: Blockiert der Browser, während der Schwarm schreibt (z. B. beim Verarbeiten der
 // Satzdaten), überspringt er nichts – die Buchstaben kommen danach weiter der Reihe nach.
 page=await newPage({viewport:{width:390,height:780},isMobile:true,hasTouch:true});
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.querySelectorAll('.intro-lead .intro-ch.on').length>=2,null,{timeout:10000});
 const stall=await page.evaluate(()=>new Promise(resolve=>{
  const count=()=>document.querySelectorAll('.intro-lead .intro-ch.on').length,before=count(),end=performance.now()+1000;
  while(performance.now()<end){}
  requestAnimationFrame(()=>requestAnimationFrame(()=>resolve({before,after:count(),all:document.querySelectorAll('.intro-lead .intro-ch').length})));
 }));
 assert.ok(stall.after-stall.before<=4&&stall.after<stall.all,`flock does not jump ahead after a stall (${stall.before} → ${stall.after} of ${stall.all})`);
 assert.equal(await written(page,'.intro-tail'),0,'second line still waits after the stall');
 await page.context().close();

 // Klick überspringt sofort.
 page=await newPage();
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.documentElement.classList.contains('intro-running'));
 await page.mouse.click(640,400);
 assert.doesNotMatch(await classes(page),/intro-/);
 assert.equal(await opacity(page,'header'),1);
 assert.equal(await page.locator('#home-view .intro h1').evaluate(el=>getComputedStyle(el).transform),'none');
 assert.equal(await page.locator('.intro-ch').count(),0,'headline is plain text again after skipping');
 assert.equal(await opacity(page,'header .brand-mark svg'),1,'logo drawn after skipping');
 await page.waitForFunction(()=>/^sit:/.test(document.querySelector('canvas.intro-birds')?.dataset.pets),null,{timeout:4000});
 await page.context().close();

 // Schon gesehen (kein Intro): Mit ?birds kommen die zwei Schwalben angeflogen und setzen sich.
 page=await newPage();
 await page.goto(origin+'/?birds');
 assert.doesNotMatch(await classes(page),/intro-/);
 await page.waitForFunction(()=>/^sit:/.test(document.querySelector('canvas.intro-birds')?.dataset.pets),null,{timeout:12000});
 // In einer anderen Ansicht haben sie keinen Platz und fliegen davon.
 await page.locator('#games-nav').click();
 await page.waitForFunction(()=>document.querySelector('canvas.intro-birds')?.dataset.pets==='none',null,{timeout:8000});
 await page.context().close();

 // Angemeldete: Logo und Begrüßung, dann fliegt der Vogel aus dem Logo, die Begrüßung wird zum Schwarm,
 // der Schwarm schreibt den Satz des Tages, der Vogel kehrt ins Logo zurück, zwei Schwalben bleiben;
 // der Rest blendet ein, die Begrüßung steht zuerst auf Deutsch und dreht sich nach 2 s auf Finnisch.
 page=await newPage();
 await page.addInitScript(()=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'a',refresh_token:'r',user:{id:'u',user_metadata:{username:'testi'}}})));
 await page.goto(origin+'/?intro');
 await page.waitForFunction(()=>document.documentElement.classList.contains('intro-user')&&document.documentElement.classList.contains('intro-running'));
 await page.locator('.intro-greet').waitFor({state:'attached',timeout:8000});
 assert.match(await page.locator('.intro-greet').textContent(),/Testi!/,'greeting stands alone first');
 assert.equal(await opacity(page,'header .brand'),1,'logo visible from the start');
 assert.equal(await opacity(page,'header .header-nav'),0,'navigation hidden during the intro');
 assert.equal(await opacity(page,'#home-view .intro h1'),0,'the real greeting stays hidden under the intro layer');
 assert.equal(await opacity(page,'header>.today'),0,'counter pill hidden during the intro');
 // Der Vogel verlässt das Logo: die Kachel wird leer, die Begrüßung löst sich auf, der Satz wird geschrieben.
 await page.waitForFunction(()=>{const m=document.querySelector('header .brand-mark');return m.classList.contains('is-filling')&&!m.classList.contains('is-filled');},null,{timeout:10000});
 assert.ok(await page.locator('#daily-sentence.intro-bare').count(),'only the sentence, no card chrome');
 assert.equal(await opacity(page,'#daily-sentence .daily-sentence-top'),0,'card chrome hidden at first');
 assert.ok(await page.locator('#daily-sentence .intro-ch').count()>0,'the sentence is written letter by letter');
 await page.waitForFunction(()=>document.querySelectorAll('.intro-greet .intro-ch.on').length===0,null,{timeout:12000});
 await page.waitForFunction(()=>document.querySelectorAll('#daily-sentence .intro-ch.on').length>0,null,{timeout:12000});
 await page.waitForFunction(()=>document.querySelector('header .brand-mark').classList.contains('is-filled'),null,{timeout:8000});
 await page.waitForFunction(()=>!/intro-/.test(document.documentElement.className),null,{timeout:15000});
 assert.equal(await page.locator('.intro-greet, #daily-sentence .intro-w, #daily-sentence .intro-ch').count(),0,'intro layers cleaned up');
 assert.doesNotMatch(await page.locator('header .brand-mark').getAttribute('class'),/is-fill|pop/);
 assert.ok((await page.locator('#daily-sentence .guest-fi').first().textContent()).trim().length>0,'sentence text intact');
 assert.equal(await page.evaluate(()=>localStorage.getItem('vanamo-user-intro-day')),await page.evaluate(()=>new Date().toLocaleDateString('sv-SE')),'the intro is remembered for today');
 assert.equal(await opacity(page,'#home-view .intro h1'),1);
 assert.equal(await page.locator('.greeting').getAttribute('aria-pressed'),'true','greeting starts in German');
 assert.equal(await page.locator('.greeting-hint, .daily-tip').count(),0,'no tap hints');
 await page.waitForFunction(()=>document.querySelector('.greeting')?.getAttribute('aria-pressed')==='false',null,{timeout:4000});
 assert.equal(await page.locator('.greeting-de').getAttribute('aria-hidden'),'true','greeting turned to Finnish');
 // Zwei Schwalben bleiben und setzen sich – für Angemeldete auf „Aufgaben starten“ oder einen anderen Platz.
 await page.waitForFunction(()=>/^sit:/.test(document.querySelector('canvas.intro-birds')?.dataset.pets),null,{timeout:12000});
 await page.context().close();

 assert.deepEqual(errors,[]);
 console.log('PASS: guest intro with flock writing the headline, bird becoming the logo, two swallows that perch and take off, no jump after a stall, card reveal, skip on click, cleanup, no intro for automation, signed-in intro (bird leaves the logo, greeting becomes the flock, flock writes the daily sentence, swallows stay) and greeting flip.');
}finally{
 await browser?.close();server.kill();
}
