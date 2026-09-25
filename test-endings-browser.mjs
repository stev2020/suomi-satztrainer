import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',shots=process.env.SHOTS||'';
const sentences=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8')).sentences;
const lexicon=JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8'));
const escapeRe=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Recover the missing word from the gap sentence (text around the gap is unique enough).
async function expectedWord(page){
 const parts=await page.locator('.endings-sentence').evaluate(el=>[...el.childNodes].map(n=>n.nodeType===3?n.data:n.classList.contains('endings-gap')?'\u0000':n.textContent).join(''));
 const [before,after]=parts.split('\u0000');
 const lemma=(await page.locator('.endings-base b').textContent()).trim();
 const re=new RegExp('^'+escapeRe(before)+'(\\S+?)'+escapeRe(after)+'$','u');
 const found=new Set();
 for(const s of sentences){
  const m=re.exec(s.text);if(!m)continue;
  const words=s.text.split(/\s+/u),index=before.trim()?before.trim().split(/\s+/u).length:0;
  const [li]=lexicon.sentences[String(s.id)].w[index]||[];
  if(lexicon.lemmas[li]?.[0]===lemma)found.add(m[1]);
 }
 assert.ok(found.size>=1,'Lücke gefunden: '+parts);
 return [...found];
}
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block',locale:'de-DE'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('#start-new-sentences:not([disabled])').waitFor();
  await page.locator('#more-exercises > summary').click();
  await page.locator('[data-home-activity="endings"]').click();
  assert.equal(await page.locator('#continue-title').textContent(),'Endungen');
  assert.ok(await page.locator('[data-difficulty-group]').first().isVisible(),'Schwierigkeit wählbar');
  await page.locator('[data-difficulty="easy"]').first().click();
  await page.locator('#continue-practice').click();
  if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
  await page.locator('[data-endings-count="5"]').click();
  // Easy mode falls back to typing when fewer than three forms exist for a word
  // (e.g. „huomen“). Answer such items correctly until one with choices appears.
  let ambiguous=0,extra=0;
  for(;;){
   await page.locator('.endings-choices button, #endings-input').first().waitFor();
   if(await page.locator('.endings-choices button').count()||extra>=2)break;
   const w=await expectedWord(page);
   await page.locator('#endings-input').fill(w[0]);
   await page.keyboard.press('Enter');
   if(w.length===1)await page.locator('.verb-feedback.verb-correct').waitFor();else{await page.locator('.verb-feedback').waitFor();ambiguous++;}
   await page.locator('#endings-next').click();
   extra++;
  }
  // Easy: pick the right form.
  await page.locator('.endings-choices button').first().waitFor();
  assert.equal(await page.locator('.endings-choices button').count(),3);
  assert.ok(await page.locator('.endings-case').isVisible(),'Fall wird angezeigt');
  const words=await expectedWord(page);
  const choices=await page.locator('.endings-choices button').evaluateAll(bs=>bs.map(b=>b.dataset.endingChoice));
  const word=choices.find(c=>words.includes(c));assert.ok(word,'richtige Form in der Auswahl');
  await page.locator(`.endings-choices button[data-ending-choice="${word}"]`).click();
  await page.locator('.verb-feedback.verb-correct').waitFor();
  assert.ok(await page.locator('.endings-full[data-words] .fi-word').count()>=1,'ganzer Satz danach antippbar');
  if(shots)await page.screenshot({path:`${shots}/endings-easy-${viewport.width}.png`,fullPage:true});
  await page.locator('#endings-next').click();
  // Hard: switch difficulty mid-round, type a wrong form.
  await page.locator('#practice-view [data-view="home"]').click();
  await page.locator('[data-difficulty="hard"]').first().click();
  await page.locator('#continue-practice').click();
  await page.locator('#endings-input').waitFor();
  assert.equal(await page.locator('.endings-case').count(),0,'Fall zunächst verborgen');
  await page.locator('#endings-show-case').click();
  assert.ok(await page.locator('.endings-case').isVisible());
  await page.locator('#endings-input').fill('väärä');
  await page.locator('#endings-form button[type="submit"]').click();
  await page.locator('.verb-feedback.verb-wrong').waitFor();
  if(shots)await page.screenshot({path:`${shots}/endings-hard-${viewport.width}.png`,fullPage:true});
  // Finish the round with Enter-driven typing.
  for(let i=0;i<3-extra;i++){
   await page.locator('#endings-next').click();
   await page.locator('#endings-input').waitFor();
   const w=await expectedWord(page);
   await page.locator('#endings-input').fill(w[0].toUpperCase());
   await page.keyboard.press('Enter');
   if(w.length===1)await page.locator('.verb-feedback.verb-correct').waitFor();else{await page.locator('.verb-feedback').waitFor();ambiguous++;}
  }
  await page.locator('#endings-next').click();
  await page.locator('#endings-result-title').waitFor();
  if(!ambiguous)assert.match(await page.locator('#card').textContent(),/4 von 5 Formen richtig/);
  await page.locator('#endings-again').click();
  await page.locator('[data-endings-count="5"]').waitFor();
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Endungen: Auswahl, Schreiben, Falltipp, Rundenende und mobile Darstellung bestanden.');
}finally{await browser?.close();server.kill();}
