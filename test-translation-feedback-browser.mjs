import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
const origin='http://localhost:4173',shots=process.env.SHOTS||'';
const sentences=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8')).sentences;
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);});
let browser;const errors=[];
try{
 browser=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const context=await browser.newContext({viewport,serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  await page.locator('#start-new-sentences:not([disabled])').waitFor();
  await page.locator('#more-exercises > summary').click();
  await page.locator('[data-home-direction="de-fi"]').click();
  await page.locator('[data-difficulty="hard"]').first().click();
  await page.locator('#continue-practice').click();
  if(await page.locator('#guest-continue').isVisible())await page.locator('#guest-continue').click();
  const variants=['one-letter','exact'];
  for(let guard=0;variants.length&&guard<20;guard++){
   await page.locator('#translation-input').waitFor();
   const german=(await page.locator('#card p.sentence[lang="de"]').evaluate(el=>el.firstChild.data)).trim();
   const card=sentences.filter(s=>s.translations[0].text===german);
   assert.ok(card.length,'Satz gefunden: '+german);
   const fi=card[0].text;
   // A typo in a one- or two-word sentence counts as a different formulation; wait for a longer one.
   // Several Finnish sentences can share one German translation; then we cannot know which one is shown.
   // Grading „Leicht“ keeps skipped cards from coming straight back in this round.
   const ambiguous=new Set(card.map(s=>s.text)).size>1;
   const variant=ambiguous?'skip':fi.split(/\s+/).length>=3?variants.shift():(variants[0]==='exact'?variants.shift():'skip');
   if(variant==='skip'){await page.locator('#reveal').click();await page.locator('#card.revealed').waitFor();await page.locator('#inline-grades [data-grade="easy"]').click();continue;}
   // Change one ending letter of the longest word (still recognisably the same word).
   const longest=fi.split(/\s+/).map(w=>w.replace(/[.,!?]+$/,'')).sort((a,b)=>b.length-a.length)[0];
   const typed=variant==='exact'?fi.toLowerCase():fi.replace(longest,longest.slice(0,-1)+(longest.endsWith('a')?'e':'a'));
   await page.locator('#translation-input').fill(typed);
   await page.locator('#reveal').click();
   await page.locator('#card.revealed').waitFor();
   if(variant==='exact')assert.match(await page.locator('.feedback-verdict').textContent(),/Stimmt mit der Vorlage überein/);
   else{
    assert.match(await page.locator('.feedback-verdict').textContent(),/eine Stelle weicht/);
    assert.equal(await page.locator('.translation-diffs li').count(),1);
    assert.ok(await page.locator('.translation-diffs mark.diff-needed').count()>=1);
    assert.ok((await page.locator('.translation-diffs small').first().textContent()).includes(' · '),'Erklärung aus der Wortanalyse');
    if(shots)await page.screenshot({path:`${shots}/feedback-${viewport.width}.png`,fullPage:true});
   }
   await page.locator('#inline-grades [data-grade="easy"]').click();
  }
  assert.equal(variants.length,0,'beide Fälle geprüft');
  await context.close();
 }
 assert.deepEqual(errors,[]);
 console.log('Übersetzungs-Rückmeldung: Browserprüfung (Abweichung, exakte Übereinstimmung, mobil) bestanden.');
}finally{await browser?.close();server.kill();}
