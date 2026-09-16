import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(resolve=>server.stdout.once('data',resolve));let browser;
const fixture={id:987654,text:'Juon tänään kahvia.',level:1,audios:[],translations:[{id:987655,text:'Ich trinke heute Kaffee.',license:'CC BY 2.0',owner:'test'}],license:'CC BY 2.0',owner:'test'};
try{
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin==='http://localhost:4173'?route.continue():route.abort());
 await context.route('**/sentences.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({sentences:[fixture],levels:[{id:1}]})}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const cell=i=>page.locator(`[data-cell="${i}"]`);
 async function path(word,hard){return page.evaluate(({word,hard})=>{const b=[...document.querySelectorAll('[data-cell]')],n=Math.sqrt(b.length),dirs=hard?[[0,1],[1,0],[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]]:[[0,1],[1,0]];for(let r=0;r<n;r++)for(let c=0;c<n;c++)for(const [dr,dc] of dirs){const cells=Array.from(word,(_,i)=>[r+dr*i,c+dc*i]);if(cells.every(([r,c],i)=>r>=0&&r<n&&c>=0&&c<n&&b[r*n+c].textContent===word[i]))return cells.map(([r,c])=>r*n+c);}throw Error('Word not placed');},{word,hard});}
 for(const difficulty of ['easy','hard']){
  await page.goto('http://localhost:4173');await page.locator('#continue-practice:not([disabled])').waitFor();await page.locator('[data-home-activity="suchsel"]').click();
  assert.equal(await page.locator('#home-direction-control').isVisible(),false);
  await page.locator(`#home-view [data-search-difficulty="${difficulty}"]`).click();await page.locator('#continue-practice').click();
  assert.equal(await page.locator('#play-audio').count(),0);assert.equal(await page.locator('.search-found span').count(),0);
  assert.match(await page.locator('.search-count').textContent(),/0 von 3/);
  await page.locator('.search-hint').click();assert.match(await page.locator('.search-hint-text').textContent(),/Suche/);assert.equal(await page.locator('.search-grid .hint').count(),1);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:320,height:950});
  const scroll=page.locator('.search-scroll');await page.locator('.search-grid').evaluate(el=>{el.style.minWidth='600px';});assert.ok(await scroll.evaluate(el=>el.scrollWidth>el.clientWidth));await scroll.evaluate(el=>{el.scrollLeft=el.scrollWidth;});assert.ok(await scroll.evaluate(el=>el.scrollLeft>0));
  await page.locator('.search-grid').evaluate(el=>{el.style.minWidth='';});await scroll.evaluate(el=>{el.scrollLeft=0;});
  await page.setViewportSize({width:390,height:844});
  let i=0;for(const word of ['KAHVIA','JUON','TÄNÄÄN']){
   const cells=await path(word,difficulty==='hard');
   if(i===0){await cell(cells[0]).tap();await cell(cells.at(-1)).tap();assert.equal(await page.locator('.search-found span').textContent(),word);assert.ok(await page.locator('.search-grid .found').count()>=word.length);}
   else if(i===1){await cell(cells[0]).scrollIntoViewIfNeeded();const a=await cell(cells[0]).boundingBox(),b=await cell(cells.at(-1)).boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();}
   else{await cell(cells[0]).focus();await page.keyboard.press('Enter');await cell(cells.at(-1)).focus();await page.keyboard.press('Enter');}i++;
  }
  assert.ok(await page.locator('#search-finished').isVisible());assert.equal(await page.locator('.search-solution [lang="fi"]').textContent(),fixture.text);
  await page.locator('#grade-again').click();assert.match(await page.locator('.search-count').textContent(),/0 von 3/);
  const state=await page.evaluate(()=>window.suomiLearningState.snapshot());assert.ok(state.reviews['987654:suchsel']);assert.equal(state.prefs.searchDifficulty,difficulty);assert.equal(state.reviews['987654:de-fi'],undefined);
  await page.locator('#search-skip').click();assert.equal(await page.locator('.search-grid').count(),0);
 }
 assert.deepEqual(errors,[]);console.log('Wortsel browser: tap, drag, keyboard, hints, both difficulties, solution, repeat, progress and responsive layout passed.');
}finally{await browser?.close();server.kill();}
