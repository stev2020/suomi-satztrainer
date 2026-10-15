import {spawn} from 'node:child_process';import {chromium} from 'playwright';import assert from 'node:assert/strict';
const server=spawn(process.execPath,['server.mjs'],{stdio:['ignore','pipe','inherit']});await new Promise(r=>server.stdout.once('data',r));
const b=await chromium.launch({headless:true,...(process.env.PW_CHROMIUM?{executablePath:process.env.PW_CHROMIUM}:{})});
const origin='http://localhost:4173',themes=['vanamo','ruska','tunturi','kaamos'];
try{
 for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const c=await b.newContext({viewport,locale:'de-DE',serviceWorkers:'block'});
  const calls=[];let swarmData={names:[{name:'Mikko',contributor:true},{name:'Anna',contributor:false},{name:'Jöns',contributor:false}],former:2};
  await c.route('**/*',r=>{const u=new URL(r.request().url());
   if(u.pathname==='/rest/v1/rpc/app_settings')return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({notice:null,registration:true,goal_percent:0})});
   if(u.pathname.startsWith('/rest/v1/rpc/support_')){const fn=u.pathname.split('/').pop(),body=JSON.parse(r.request().postData()||'{}');calls.push({fn,body});
    const json=fn==='support_swarm'?swarmData:fn==='support_name_activate'?{ok:true,name:'Anna'}:{ok:true,name:body.p_name};
    return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(json)});}
   return u.origin===origin?r.continue():r.abort();});
  const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await p.goto(origin+'/unterstuetzen.html');
  const cta=p.locator('#support-cta');
  await assertText(cta,'Mit 24 € im Jahr unterstützen');
  assert.equal(await cta.isDisabled(),false,'Knopf führt zu Donorbox');
  assert.match(await p.locator('#support-provider').textContent(),/Donorbox/);
  assert.equal(await p.locator('#support-facts').isVisible(),true,'Hinweis direkt unter dem Knopf');
  assert.match(await p.locator('#support-facts').textContent(),/keine Spende im steuerlichen Sinn/);
  assert.deepEqual(await p.locator('[data-support-mode]').allTextContents(),['Einmalig','Monatlich','Jährlich'],'Reihenfolge wie bei Donorbox');
  assert.equal(await p.locator('[data-support-mode="jahr"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['12 €','24 €','36 €']);
  assert.equal(await p.locator('#support-amounts button').nth(1).getAttribute('aria-pressed'),'true','der mittlere ist vorausgewählt');
  await p.locator('[data-support-amount="36"]').click();
  await assertText(cta,'Mit 36 € im Jahr unterstützen');await assertText(p.locator('#support-hint'),'');
  await p.locator('[data-support-mode="monat"]').click();
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['3 €','5 €','10 €']);
  await assertText(cta,'Mit 5 € im Monat unterstützen');
  await p.locator('[data-support-mode="einmal"]').click();
  assert.deepEqual(await p.locator('#support-amounts button').allTextContents(),['5 €','10 €','20 €']);
  await assertText(cta,'Einmalig 10 € geben');
  await p.locator('[data-support-amount="20"]').click();
  await assertText(cta,'Einmalig 20 € geben');
  // Schwarm: Namen aus Supabase, Punkte für die Lernenden, Text für Screenreader
  const sky=p.locator('#support-swarm');
  assert.equal(await sky.isVisible(),true);
  const box=await sky.boundingBox();assert(box.width>=Math.min(viewport.width-40,1000)&&box.height>=200,'Schwarm breiter als der Text');
  await p.waitForFunction(()=>document.getElementById('support-swarm-list').textContent.length>0);
  assert.equal(await p.locator('#support-swarm-list').textContent(),'Im Schwarm: Mikko, Anna, Jöns. Dazu 2 frühere Unterstützungen.');
  assert.equal(await p.locator('#support-swarm-empty').isVisible(),false);
  assert(await sky.evaluate(c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i])n++;return n>500;}),'es wird gezeichnet');
  // Häkchen und Vorname: ohne gültigen Namen geht es nicht weiter, mit Namen wartet er in Supabase
  const okBox=p.locator('#support-name-ok'),nameBox=p.locator('#support-name');
  assert.equal(await nameBox.isDisabled(),true);
  await okBox.check();assert.equal(await nameBox.isDisabled(),false);
  await nameBox.fill('A1');await cta.click();
  assert.match(await p.locator('#support-name-error').textContent(),/2 bis 20 Buchstaben/);
  assert.equal(c.pages().length,1,'kein Donorbox-Tab bei ungültigem Namen');
  await nameBox.fill('  Anna ');
  const [request]=await Promise.all([c.waitForEvent('request',r=>r.url().startsWith('https://donorbox.org/')),cta.click()]);
  const submit=calls.find(x=>x.fn==='support_name_submit');
  assert(submit&&submit.body.p_name==='Anna'&&/^[0-9a-f]{64}$/.test(submit.body.p_token),'Name wartet mit Zufallsschlüssel');
  const pending=await p.evaluate(()=>JSON.parse(localStorage.getItem('vanamo-support-name')));
  assert.equal(pending.token,submit.body.p_token);assert.equal(pending.name,'Anna');
  assert.equal(request.url(),'https://donorbox.org/vanamo?amount=20&language=de','Klick öffnet Donorbox mit Betrag');
  for(const page of c.pages())if(page!==p)await page.close();
  await okBox.uncheck();
  assert.equal(await p.locator('[data-support-mode="einmal"]').getAttribute('aria-pressed'),'true');

  const note=p.locator('#support-note'),star=p.locator('#support-star');
  assert.equal(await note.isVisible(),false);
  await star.click();assert.equal(await note.isVisible(),true);assert.equal(await star.getAttribute('aria-expanded'),'true');
  assert.equal((await note.locator('p').textContent()).trim(),'Wir rechnen mit rund einem Cent pro aktivem Lernenden im Monat.');
  await p.keyboard.press('Escape');assert.equal(await note.isVisible(),false);
  await star.click();await p.locator('h1').click();assert.equal(await note.isVisible(),false,'Klick daneben schließt');
  await star.click();await p.locator('#support-note-close').click();assert.equal(await note.isVisible(),false);

  // Rückkehr von Donorbox: Name wird freigeschaltet, Dank erscheint, die Adresse wird aufgeräumt
  await p.goto(origin+'/unterstuetzen.html?danke=1');
  await p.locator('#support-thanks').waitFor();
  assert.equal(await p.locator('#support-thanks').textContent(),'Danke, Anna! Dein Name fliegt jetzt im Schwarm mit.');
  assert.equal(new URL(p.url()).search,'','?danke ist wieder weg');
  assert.equal(calls.filter(x=>x.fn==='support_name_activate').at(-1).body.p_token,pending.token);
  assert.equal(await p.evaluate(()=>localStorage.getItem('vanamo-support-name')),null,'Schlüssel ist verbraucht');
  // Ohne vorgemerkten Namen nur ein allgemeiner Dank
  await p.goto(origin+'/unterstuetzen.html?danke=1');await p.locator('#support-thanks').waitFor();
  assert.equal(await p.locator('#support-thanks').textContent(),'Danke für deine Unterstützung!');
  // Leerer Schwarm
  swarmData={names:[],former:0};await p.goto(origin+'/unterstuetzen.html');
  await p.locator('#support-swarm-empty').waitFor();assert.equal(await p.locator('#support-swarm-empty').textContent(),'Sei der erste Name im Schwarm.');
  swarmData={names:[{name:'Mikko',contributor:true}],former:0};
  assert.equal(await p.locator('#support-goal-bar').getAttribute('aria-valuenow'),'0');
  assert.equal(await p.locator('.support-ways li').count(),5);
  for(const theme of themes){
   await p.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
   const overflow=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
   assert(overflow<=0,`${theme} ${viewport.width}px: Seite läuft nicht seitlich über (${overflow}px)`);
  }
  assert.deepEqual(errors,[]);
  if(viewport.width===1280){
   await p.goto(origin+'/');await p.locator('footer a[href="unterstuetzen.html"]').waitFor({state:'attached'});
   for(const f of ['impressum.html','datenschutz.html']){await p.goto(origin+'/'+f);assert.equal(await p.locator('a[href="mailto:hallo@vanamo.app"]').first().isVisible(),true,f);}
  }
  await c.close();
 }
 console.log('Unterstützen im Browser: Schwarm, Vorname mit Freischaltung nach Donorbox, Donorbox-Hinweis, Beträge, Sternchen-Fenster, Monatsziel, vier Paletten, Handybreite, Links.');
}finally{await b.close();server.kill();}
async function assertText(locator,expected){assert.equal((await locator.textContent()).trim(),expected);}
