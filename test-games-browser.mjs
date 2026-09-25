// Games im Browser: Header-Button, Spielkarte, Deck-Wahl, Spiel startet im Vollbild,
// „← Zurück“ im Spielmenü und die Zurück-Taste des Browsers schließen es wieder.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise(resolve=>server.stdout.once('data',resolve));
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const viewport of [{width:390,height:844},{width:1280,height:800}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://localhost:4173'?route.continue():route.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:4173');
  await page.locator('#games-nav').click();
  assert.ok(await page.locator('#games-view').isVisible());
  assert.ok(await page.locator('#home-view').isHidden());
  assert.equal(await page.locator('#games-nav').getAttribute('aria-current'),'page');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal scroll');
  await page.locator('[data-hyppy-deck="verben"]').click();
  assert.equal(await page.locator('[data-hyppy-deck="verben"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('#hyppy-progress').textContent(),/Browser/);
  await page.locator('#hyppy-start').click();
  await page.locator('#game-stage canvas').waitFor({timeout:20000});
  assert.ok(await page.locator('#game-overlay').isVisible());
  assert.ok(await page.evaluate(()=>document.body.classList.contains('game-open')));
  // Browser-Zurück schließt das Spiel und bleibt in Games
  await page.waitForTimeout(1500);
  await page.goBack();
  await page.waitForFunction(()=>document.getElementById('game-overlay').hidden);
  assert.equal(await page.locator('#game-stage canvas').count(),0,'game destroyed');
  assert.ok(await page.locator('#games-view').isVisible());
  // erneut öffnen und über „← Zurück“ im Spielmenü (oben links im Spielfeld) schließen
  await page.locator('#hyppy-start').click();
  const canvas=page.locator('#game-stage canvas');await canvas.waitFor({timeout:20000});await page.waitForTimeout(2500);
  const box=await canvas.boundingBox(),k=box.width/720;
  await page.mouse.click(box.x+92*k,box.y+62*k);
  await page.waitForFunction(()=>document.getElementById('game-overlay').hidden,null,{timeout:10000});
  assert.deepEqual(errors,[]);
  await context.close();
 }
 console.log('Games browser: header button, game card, deck choice, fullscreen start, back button and in-game exit passed.');
}finally{await browser?.close();server.kill();}
