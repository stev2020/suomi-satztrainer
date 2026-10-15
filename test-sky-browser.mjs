// Tag und Nacht: Sonnen-Knopf im Kopf der Seite, Himmel (sky.mjs), nur noch vier Paletten,
// alte Paletten (Mustikka, Revontulet) werden auf Vanamo bzw. Kaamos umgestellt.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 const newPage=async(theme,options={})=>{
  const context=await browser.newContext({viewport:{width:1280,height:860},serviceWorkers:'block',locale:'de-DE',...options});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  if(theme)await page.addInitScript(t=>localStorage.setItem('vanamo-theme',t),theme);
  await page.goto(origin);await page.locator('header .sky-toggle').waitFor();return page;
 };
 const theme=page=>page.evaluate(()=>document.documentElement.dataset.theme);
 let page=await newPage('vanamo');
 assert.equal(await page.locator('.theme-swatch').count(),4,'four palettes');
 assert.deepEqual(await page.locator('.theme-swatch').evaluateAll(b=>b.map(x=>x.dataset.themeId)),['vanamo','ruska','tunturi','kaamos']);
 assert.equal(await page.locator('header .sky-toggle').getAttribute('aria-label'),'Sonne untergehen lassen');
 assert.equal(await page.locator('.sky').evaluate(el=>getComputedStyle(el).zIndex),'-1','sky stays behind the page');
 assert.ok(await page.locator('.sky-toggle .sky-sun').count(),'sun in the button by day');
 // Sonne geht unter, Mond geht auf, die Seite wird zu Kaamos
 await page.locator('header .sky-toggle').click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='kaamos',null,{timeout:4000});
 await page.waitForFunction(()=>document.querySelector('.sky-toggle .sky-moon')&&!document.documentElement.classList.contains('theme-switching'),null,{timeout:4000});
 assert.equal(await page.locator('header .sky-toggle').getAttribute('aria-label'),'Sonne aufgehen lassen');
 assert.ok(await page.locator('.sky.is-night').count(),'night sky');
 assert.equal(await page.evaluate(()=>localStorage.getItem('vanamo-theme')),'kaamos');
 // zurück zur zuletzt gewählten hellen Palette
 await page.locator('.theme-swatch[data-theme-id="ruska"]').click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='ruska',null,{timeout:4000});
 await page.waitForTimeout(2400);
 await page.locator('header .sky-toggle').click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='kaamos',null,{timeout:4000});
 await page.waitForTimeout(2400);
 await page.locator('header .sky-toggle').click();
 await page.waitForFunction(()=>document.documentElement.dataset.theme==='ruska',null,{timeout:4000});
 await page.context().close();
 // Frühere Paletten
 page=await newPage('mustikka');assert.equal(await theme(page),'vanamo');assert.equal(await page.evaluate(()=>localStorage.getItem('vanamo-theme')),'vanamo');await page.context().close();
 page=await newPage('revontulet');assert.equal(await theme(page),'kaamos');await page.context().close();
 // Handy: Knopf in der Kopfzeile sichtbar, nichts läuft über
 page=await newPage('vanamo',{viewport:{width:360,height:740},isMobile:true,hasTouch:true});
 const box=await page.locator('header .sky-toggle').boundingBox();
 assert.ok(box&&box.x>=0&&box.x+box.width<=360,'toggle fits on a phone');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll');
 await page.context().close();
 assert.deepEqual(errors,[]);
 console.log('PASS: Tag/Nacht mit Sonnen-Knopf, Himmel hinter der Seite, vier Paletten, alte Paletten umgestellt, Handybreite.');
}finally{await browser?.close();server.kill();}
