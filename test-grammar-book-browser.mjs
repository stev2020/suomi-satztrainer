// Grammatik-Buch im Browser: Reiter, Inhaltsverzeichnis, Kapitel mit allen Bausteinen, Stationen im Lernpfad,
// Adresse #grammatik/<kapitel>, Gäste, englische Oberfläche, sechs Paletten, Handybreite.
import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(r=>server.stdout.once('data',r));
const b=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173',themes=['vanamo','mustikka','ruska','tunturi','kaamos','revontulet'];
const session=()=>{if(!localStorage.getItem('suomi-auth-session-v1'))localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'a',refresh_token:'r',user:{id:'u',user_metadata:{username:'testi'}}}));};
async function open({viewport,locale='de-DE',account=true,path='/'}){
 const c=await b.newContext({viewport,locale,serviceWorkers:'block'});
 await c.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 // Gäste: Die fünf Probesätze gelten als erledigt, damit „Neue Sätze lernen“ mit der Route da ist.
 await c.addInitScript(()=>sessionStorage.setItem('vanamo-guest-sentences',JSON.stringify(['a','b','c','d','e'])));
 if(account)await c.addInitScript(session);
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin+path);
 await p.locator('#start-new-sentences:not([disabled])').waitFor({state:'attached'});
 return {c,p,errors};
}
const overflow=p=>p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844},{width:320,height:640}]){
  const {c,p,errors}=await open({viewport});
  const tab=p.locator('[data-home-tab-button="grammar"]');
  assert.equal(await tab.isVisible(),true,'Reiter „Grammatik“ ist da');
  assert.equal(await p.locator('#home-tabs').getAttribute('data-tabs'),'4');
  assert.equal(await p.locator('#grammar-index').isVisible(),false,'das Inhaltsverzeichnis liegt hinter seinem Reiter');
  await tab.click();
  const toc=p.locator('#grammar-index .gb-toc-item');
  await toc.first().waitFor();
  assert.deepEqual(await p.locator('#grammar-index .gb-toc-title').allTextContents(),['Die Vokalharmonie','Der Partitiv','Der Stufenwechsel','Die Ortsfälle']);
  assert.deepEqual(await p.locator('#grammar-index .gb-toc-number').allTextContents(),['1','2','3','4']);
  for(const hidden of ['.home-daily','.home-new','#more-exercises','#welcome-review'])assert.equal(await p.locator(hidden).isVisible(),false,hidden+' gehört zu einem anderen Reiter');
  assert(await overflow(p)<=0,`Inhaltsverzeichnis ${viewport.width}px läuft nicht über`);
  const tabs=await p.locator('#home-tabs button:visible').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return {l:r.left,r:r.right,w:e.scrollWidth-e.clientWidth};}));
  assert.equal(tabs.length,4);
  assert(tabs.every(t=>t.l>=0&&t.r<=viewport.width+.5&&t.w<=0),`vier Reiter passen bei ${viewport.width}px`);
  // Pfeiltasten laufen über alle vier Reiter.
  await tab.focus();await p.keyboard.press('ArrowRight');
  assert.equal(await p.locator('[data-home-tab-button="welcome"]').getAttribute('aria-selected'),'true');
  await p.keyboard.press('ArrowLeft');assert.equal(await tab.getAttribute('aria-selected'),'true');

  // Kapitel öffnen: eigene Ansicht, Adresse #grammatik/<kapitel>.
  await toc.nth(0).click();
  await p.locator('#grammar-view .gb-title').waitFor();
  assert.equal(await p.locator('#grammar-view .gb-title').textContent(),'Die Vokalharmonie');
  assert.equal(await p.evaluate(()=>location.hash),'#grammatik/vokalharmonie');
  assert.equal(await p.locator('#home-view').isHidden(),true);
  assert.equal((await p.locator('#grammar-view .gb-eyebrow').textContent()).trim(),'Laute · 1');
  assert.deepEqual(await p.locator('#grammar-view .gb-kicker').allTextContents(),['Warum','Die drei Gruppen','Die Regel','Probier es aus','Am Satz','Dieselbe Endung, zwei Fassungen','Gut zu wissen','Kurz geprüft']);
  assert.equal(await p.locator('#grammar-view .gb-lead .gb-target').first().getAttribute('lang'),'fi','Lernsprache ist ausgezeichnet');
  // Baukasten: Wort wählen, Form und Begründung wechseln; die Endung ist hervorgehoben.
  const builder=p.locator('.gb-builder');
  assert.equal(await builder.locator('.gb-form').textContent(),'talossa');
  await builder.locator('.gb-chip',{hasText:'metsä'}).click();
  assert.equal(await builder.locator('.gb-form').textContent(),'metsässä');
  assert.equal(await builder.locator('.gb-form .gb-tone-mark-b').textContent(),'ssä');
  assert.equal(await builder.locator('.gb-why').textContent(),'Kein a, o oder u im Wort.');
  assert.equal(await builder.locator('.gb-chip',{hasText:'metsä'}).getAttribute('aria-pressed'),'true');
  // Satz: Wörter antippen.
  const sentence=p.locator('.gb-sentence');
  assert.equal(await sentence.locator('.gb-sentence-target').textContent(),'Olen koulussa, ja äiti on metsässä.');
  assert.equal(await sentence.locator('.gb-token-form').textContent(),'koulu + ssa');
  await sentence.locator('.gb-word',{hasText:'metsässä'}).click();
  assert.equal(await sentence.locator('.gb-token-form').textContent(),'metsä + ssä');
  // Umschalter.
  const contrast=p.locator('.gb-contrast');
  assert.deepEqual(await contrast.locator('.gb-pair-target').allTextContents(),['talossa','junalla','Asutko?']);
  await contrast.locator('.gb-toggle button').nth(1).click();
  assert.deepEqual(await contrast.locator('.gb-pair-target').allTextContents(),['metsässä','pyörällä','Syötkö?']);
  // Kurze Fragen: falsch, dann richtig.
  const q=p.locator('.gb-question').first();
  await q.locator('.gb-option').nth(1).click();
  assert.equal(await q.locator('.gb-option').nth(1).evaluate(e=>e.classList.contains('is-wrong')),true);
  await q.locator('.gb-option').nth(0).click();
  assert.equal(await q.locator('.gb-option').nth(0).evaluate(e=>e.classList.contains('is-right')),true);
  assert.equal(await q.locator('.gb-option').nth(1).evaluate(e=>e.classList.contains('is-wrong')),false);
  for(const theme of themes){
   await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
   assert(await overflow(p)<=0,`${theme} ${viewport.width}px: Kapitel läuft nicht seitlich über`);
  }
  await p.evaluate(()=>document.documentElement.setAttribute('data-theme','vanamo'));
  // Blättern: weiter zum Partitiv; unten angekommen gilt das erste Kapitel als gelesen.
  await p.locator('.gb-pager').scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>(JSON.parse(localStorage.getItem('vanamo-grammar-read')||'{}').fi||[]).includes('vokalharmonie'));
  assert.equal(await p.locator('.gb-pager .gb-prev span').textContent(),'Inhalt');
  await p.locator('.gb-pager .gb-next').click();
  await p.locator('#grammar-view .gb-title',{hasText:'Der Partitiv'}).waitFor();
  assert.equal(await p.evaluate(()=>location.hash),'#grammatik/partitiv');
  assert.equal(await p.locator('.gb-builder .gb-form').textContent(),'taloa');
  // Zurück im Browser führt zum vorigen Kapitel.
  await p.goBack();await p.locator('#grammar-view .gb-title',{hasText:'Die Vokalharmonie'}).waitFor();
  await p.goForward();await p.locator('#grammar-view .gb-title',{hasText:'Der Partitiv'}).waitFor();
  await p.locator('.gb-pager').scrollIntoViewIfNeeded();
  await p.waitForFunction(()=>(JSON.parse(localStorage.getItem('vanamo-grammar-read')||'{}').fi||[]).includes('partitiv'));
  // „Sätze dazu üben“ startet die Übung zum Grammatikthema; die Adresse wird aufgeräumt.
  await p.locator('.gb-cta').click();
  await p.locator('#practice-view').waitFor({state:'visible'});
  assert.match(await p.locator('#session-title').textContent(),/Partitiv/);
  assert.equal(await p.evaluate(()=>location.hash),'');
  await p.locator('#practice-view .back-link').click();
  assert.equal(await p.locator('#home-view').isVisible(),true);
  // Das Inhaltsverzeichnis zeigt die bis unten gelesenen Kapitel mit Häkchen .
  await p.locator('[data-home-tab-button="grammar"]').click();
  await p.locator('#grammar-index .gb-toc-item.is-read').first().waitFor();
  assert.deepEqual(await p.locator('#grammar-index .gb-toc-item.is-read .gb-toc-title').allTextContents(),['Die Vokalharmonie','Der Partitiv']);
  assert.deepEqual(await p.locator('#grammar-index .gb-toc-number').allTextContents(),['✓','✓','3','4']);

  // Stationen im Lernpfad: vor ihrem Thema, die gelesene mit Häkchen; der Hinweis nennt das nächste ungelesene Kapitel nur vor seinem Thema.
  await p.locator('[data-home-tab-button="new"]').click();
  const stops=await p.locator('#path-overview>li').evaluateAll(els=>els.map(e=>(e.classList.contains('path-grammar')?'G:':'')+e.querySelector('h4').textContent));
  assert.deepEqual(stops.slice(0,9),['G:Die Vokalharmonie','Begrüßung und Grundlagen','Zahlen und Zeit','G:Der Partitiv','Essen und Trinken','G:Der Stufenwechsel','Familie und Beziehungen','G:Die Ortsfälle','Reisen und Orientierung']);
  assert.deepEqual(await p.locator('#path-overview .path-grammar.is-read h4').allTextContents(),['Die Vokalharmonie','Der Partitiv']);
  assert.equal(await p.locator('#path-grammar-hint').isHidden(),true,'gelesenes Kapitel: kein Hinweis mehr');
  assert.equal(await p.locator('#path-overview .path-stop:not(.path-grammar) .path-number').first().textContent(),'1','Themen behalten ihre Nummern');
  assert(await overflow(p)<=0,`Route ${viewport.width}px läuft nicht über`);
  await p.locator('#path-overview .path-grammar a',{hasText:'Die Ortsfälle'}).click();
  await p.locator('#grammar-view .gb-title',{hasText:'Die Ortsfälle'}).waitFor();
  // Raster: ein Wort durch alle sechs Formen.
  const grid=p.locator('.gb-grid');
  await grid.locator('.gb-chip',{hasText:'pöytä'}).click();
  assert.deepEqual(await grid.locator('.gb-cell').allTextContents(),['pöydässä','pöydästä','pöytään','pöydällä','pöydältä','pöydälle']);
  assert.deepEqual(await p.locator('.gb-table-block thead th').allTextContents(),['Wo?','Woher?','Wohin?']);
  assert(await overflow(p)<=0,`Ortsfälle ${viewport.width}px laufen nicht über`);
  assert.equal(await p.locator('.gb-pager .gb-next span').textContent(),'Inhalt');
  // „← Inhalt“ führt Angemeldete zurück in den Reiter.
  await p.locator('#grammar-back').click();
  assert.equal(await p.locator('#grammar-index').isVisible(),true);
  assert.equal(await p.locator('[data-home-tab-button="grammar"]').getAttribute('aria-selected'),'true');
  // Stufenwechsel: Paar mit beiden Bedeutungen.
  await p.locator('#grammar-index .gb-toc-item').nth(2).click();
  await p.locator('#grammar-view .gb-title',{hasText:'Der Stufenwechsel'}).waitFor();
  assert.equal(await p.locator('.gb-builder .gb-form').textContent(),'kukka → kukan');
  assert.equal(await p.locator('.gb-builder .gb-form-source').textContent(),'die Blume → der Blume');
  assert.equal(await p.locator('.gb-builder .gb-form-word .gb-tone-mark-a').textContent(),'kk');
  await p.locator('.gb-builder .gb-chip',{hasText:'jalka'}).click();
  assert.equal(await p.locator('.gb-builder .gb-form').textContent(),'jalka → jalan');
  assert.equal(await p.locator('.gb-builder .gb-form-source').textContent(),'der Fuß → des Fußes');
  await p.locator('.gb-cta').click();
  await p.locator('#practice-view').waitFor({state:'visible'});
  assert.match(await p.locator('#session-title').textContent(),/Endungen/);
  assert.deepEqual(errors,[]);
  await c.close();
 }

 // Adresse direkt öffnen (ohne Intro): das Kapitel steht da; unbekanntes Kapitel wird freundlich gemeldet.
 {const {c,p,errors}=await open({viewport:{width:1280,height:900},path:'/#grammatik/stufenwechsel'});
  await p.locator('#grammar-view .gb-title',{hasText:'Der Stufenwechsel'}).waitFor();
  assert.equal(await p.locator('#grammar-back').textContent(),'← Inhalt');
  await p.evaluate(()=>{location.hash='#grammatik/gibt-es-nicht';});
  await p.locator('#grammar-view .gb-status',{hasText:'Dieses Kapitel gibt es nicht.'}).waitFor();
  await p.evaluate(()=>{location.hash='#grammatik';});
  await p.locator('#grammar-index .gb-toc-item').first().waitFor();
  assert.equal(await p.locator('#home-view').isVisible(),true,'#grammatik führt Angemeldete in den Reiter');
  assert.deepEqual(errors,[]);await c.close();}

 // Gäste: kein Reiter, aber die Stationen im Lernpfad führen ins Buch; das Inhaltsverzeichnis steht dort in der Buch-Ansicht.
 {const {c,p,errors}=await open({viewport:{width:390,height:844},account:false});
  assert.equal(await p.locator('#home-tabs').isHidden(),true);
  assert.equal(await p.locator('#grammar-index').isVisible(),false);
  await p.locator('.path-details>summary').click();
  const station=p.locator('#path-overview .path-grammar a').first();
  await station.waitFor();
  assert.equal(await p.locator('#path-grammar-hint a').textContent(),'Die Vokalharmonie →');
  await p.locator('#path-grammar-hint a').click();
  await p.locator('#grammar-view .gb-title',{hasText:'Die Vokalharmonie'}).waitFor();
  assert.match(await p.locator('.gb-cta').textContent(),/mit Konto/,'Übung ist für Gäste als „mit Konto“ gekennzeichnet');
  await p.locator('.gb-cta').click();
  await p.locator('#account-dialog[open]').waitFor();
  await p.locator('#close-account').click();
  await p.locator('#grammar-back').click();
  await p.locator('#grammar-page .gb-toc-item').first().waitFor();
  assert.equal(await p.evaluate(()=>location.hash),'#grammatik');
  assert.equal(await p.locator('#grammar-back').textContent(),'← Start');
  assert(await overflow(p)<=0);
  await p.locator('#grammar-back').click();
  assert.equal(await p.locator('#home-view').isVisible(),true);
  assert.equal(await p.evaluate(()=>location.hash),'');
  assert.deepEqual(errors,[]);await c.close();}

 // Englische Oberfläche: Es gibt (noch) kein Buch mit englischen Erklärungen – kein Reiter, keine Stationen.
 {const {c,p,errors}=await open({viewport:{width:1280,height:900},locale:'en-GB',path:'/#grammatik/partitiv'});
  assert.equal(await p.locator('[data-home-tab-button="grammar"]').isHidden(),true);
  assert.equal(await p.locator('#home-tabs').getAttribute('data-tabs'),'3');
  assert.equal(await p.locator('#grammar-view').isHidden(),true);
  await p.locator('[data-home-tab-button="new"]').click();
  assert.equal(await p.locator('#path-overview .path-grammar').count(),0);
  assert.deepEqual(errors,[]);await c.close();}
 console.log('Grammatik-Buch im Browser: Reiter, Inhaltsverzeichnis, vier Kapitel mit Bausteinen, Stationen, Adressen, Gäste, englische Oberfläche, sechs Paletten, Handybreite.');
}finally{await b.close();server.kill();}
