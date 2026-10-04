// Vanamo – Intro auf der Startseite.
//
// Angemeldete (Klasse `intro-user`, siehe runUserIntro unten; nur beim ersten Öffnen am Tag):
//   1. Logo und „vanamo“ stehen, kurz darauf erscheint die Begrüßung („Guten Abend, …“),
//   2. der Vogel fliegt aus dem Logo – die Kachel wird leer –, überfliegt die Begrüßung, sie löst sich
//      dabei in einen Schwarm auf, und der Schwarm schreibt den finnischen „Satz des Tages“,
//   3. der farbige Vogel fliegt zurück ins Logo, der Schwarm davon, zwei Vögel bleiben und setzen sich,
//   4. der Rest der Seite blendet ein; die Begrüßung steht wieder da und dreht sich danach auf
//      Finnisch (home-extras.mjs).
//
// Besucher ohne Konto:
// Ablauf (nur beim ersten Aufruf pro Tab, nicht bei „Bewegung reduzieren“):
//   1. Die Logo-Kachel ist leer, ein Vogelschwarm kreist in der Bildschirmmitte (intro-birds.mjs),
//   2. der Schwarm schreibt „Ein bisschen Finnisch.“ groß in die Mitte – die Buchstaben erscheinen
//      hinter ihm –, dann gleitet die Zeile an ihren Platz,
//   3. der Schwarm sammelt sich an derselben Stelle und schreibt „Jeden Tag.“,
//   4. die Vögel fliegen davon; der eine farbige Vogel landet im Logo, färbt die Kachel und wird
//      zum „V“; „Jeden Tag.“ gleitet an seinen Platz,
//   5. der finnische Satz der Satzkarte erscheint Wort für Wort (ohne Vögel),
//   6. der Rest der Seite blendet ein, zwei Vögel bleiben übrig und setzen sich auf den Hauptknopf.
// „vanamo“ im Header steht von Anfang an.
// Ein Klick, Tipp, Scrollen oder Tastendruck springt sofort zum fertigen Zustand.
// Der Inline-Schnipsel in index.html setzt vorher `intro-pending` (versteckt die Seite
// ohne Aufblitzen); dieses Modul übernimmt ab dort und räumt am Ende alles wieder weg.

// Pausen zählen jeweils ab dem Moment, in dem der vorige Schritt fertig zu sehen ist.
const T={
 circleMs:2000,     // so lange kreist der Schwarm, bevor er schreibt (deckt das Laden der Satzdaten ab)
 birds:140,         // Größe des Schwarms; auf schmalen Bildschirmen:
 birdsSmall:50,
 moveGap:300,       // eine Zeile steht fertig groß in der Mitte, dann gleitet sie an ihren Platz
 moveMs:1000,
 sentenceGap:300,   // Satz steht allein, dann wächst die Karte
 cardWait:4000      // so lange höchstens auf die Satzkarte warten
};
const EASE_MOVE='cubic-bezier(.65,0,.25,1)',EASE_OUT='cubic-bezier(.2,.7,.2,1)';
const SEEN='vanamo-intro-seen';

import {createBirds} from './intro-birds.mjs?v=4';

const html=document.documentElement;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

// Wartet `ms` *sichtbare* Zeit: Hänger des Browsers (z. B. während die Satzdaten verarbeitet
// werden – auf dem Handy spürbar) zählen nicht mit, sonst kämen Schritte zu schnell hintereinander.
function hold(ms){
 return new Promise(resolve=>{
  let seen=0,last=performance.now();
  const tick=now=>{seen+=Math.min(now-last,50);last=now;if(seen>=ms)resolve();else requestAnimationFrame(tick);};
  requestAnimationFrame(tick);
 });
}
const finished=a=>a.finished.catch(()=>{});

async function waitFor(check,timeout){
 const end=performance.now()+timeout;
 while(!check()){if(performance.now()>end)return false;await sleep(60);}
 return true;
}

// Zerlegt den Text einer Zeile in einzelne Buchstaben (Wörter bleiben zusammen) und liefert sie.
function splitChars(el){
 const chars=[],words=el.textContent.split(' ');el.textContent='';
 words.forEach((word,i)=>{
  const w=document.createElement('span');w.className='intro-w';
  for(const c of word){const x=document.createElement('span');x.className='intro-ch';x.textContent=c;w.append(x);chars.push(x);}
  el.append(w);if(i<words.length-1)el.append(' ');
 });
 return chars;
}

// Ohne Intro (Gäste: schon gesehen in diesem Tab, Angemeldete: heute schon gesehen): nur die zwei Schwalben.
// Nicht bei „Bewegung reduzieren“ und nicht in automatisierten Browsern (außer mit ?birds).
function startGuestBirds(){
 try{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(navigator.webdriver&&!/[?&]birds\b/.test(location.search))return;
  createBirds().startPets();
 }catch{}
}

export async function runGuestIntro(){
 if(!html.classList.contains('intro-pending'))return startGuestBirds();
 if(html.classList.contains('intro-user'))return runUserIntro();
 const h1=document.querySelector('#home-view .intro h1');
 const lead=h1?.querySelector('.intro-lead'),tail=h1?.querySelector('.intro-tail');
 if(!h1||!lead||!tail||typeof h1.animate!=='function'){html.classList.remove('intro-pending');return;}
 const mark=document.querySelector('header .brand-mark');
 html.classList.add('intro-running');
 try{sessionStorage.setItem(SEEN,'1');}catch{}

 const animations=[],controller=new AbortController(),flock=createBirds(),spans=[lead,tail];
 let done=false,settled=false,texts=null;
 const play=(el,frames,options)=>{const a=el.animate(frames,options);animations.push(a);return a;};

 // Sofort zum Endzustand – auch der normale Abschluss läuft hier durch.
 function finish(){
  if(done)return;done=true;
  controller.abort();
  animations.forEach(a=>a.cancel());
  spans.forEach((span,i)=>{if(texts)span.textContent=texts[i];span.style.transform='';span.style.display='';});
  h1.classList.remove('intro-birds-h1');
  mark?.classList.remove('is-filling','is-filled','pop');
  const card=document.getElementById('guest-card');
  card?.classList.remove('intro-bare','intro-growing','intro-shown');
  html.classList.remove('intro-pending','intro-running');
  if(!settled)flock.skip();
 }
 for(const type of ['pointerdown','keydown','wheel','touchstart'])addEventListener(type,finish,{signal:controller.signal,passive:true});
 setTimeout(finish,25000); // Sicherheitsnetz

 // Übersetzung und Schriften abwarten, sonst stimmen die Maße nicht.
 await waitFor(()=>!html.classList.contains('i18n-pending'),3000);
 try{await Promise.race([document.fonts?.ready,sleep(1500)]);}catch{}
 if(done)return;

 scrollTo(0,0);
 const vw=innerWidth,vh=innerHeight;
 // Jede Zeile steht für sich groß in der Bildschirmmitte, wird dort vom Schwarm geschrieben und
 // gleitet dann an ihren Platz – erst „Ein bisschen Finnisch.“, danach „Jeden Tag.“ an derselben Stelle.
 // Endposition messen (FLIP); inline-block, damit sich die Zeilen einzeln verschieben lassen.
 texts=spans.map(span=>span.textContent);
 const chars=spans.map(splitChars);
 h1.classList.add('intro-birds-h1');
 mark?.classList.add('is-filling');
 lead.style.display=tail.style.display='inline-block';
 const all=spans.map(span=>span.getBoundingClientRect());
 const width=Math.max(...all.map(r=>r.right))-Math.min(...all.map(r=>r.left)),height=Math.max(...all.map(r=>r.bottom))-Math.min(...all.map(r=>r.top));
 // Größe wie bisher für beide Zeilen zusammen, einzeln ein Stück größer.
 const pair=Math.max(1,Math.min(vw*.86/width,vh*.5/height,4));
 // Beide Zeilen gleich groß; auf schmalen Bildschirmen begrenzt die längere Zeile.
 const scale=Math.max(1,Math.min(Math.max(pair*1.25,1.6),vw*.86/Math.max(...all.map(r=>r.width)),vh*.5/Math.max(...all.map(r=>r.height))));
 const bigs=all.map(r=>`translate(${vw/2-(r.left+r.right)/2}px,${vh/2-(r.top+r.bottom)/2}px) scale(${scale})`);
 spans.forEach((span,i)=>{span.style.transform=bigs[i];});
 const glide=i=>finished(play(spans[i],[{transform:bigs[i]},{transform:'none'}],{duration:T.moveMs,easing:EASE_MOVE,fill:'forwards'})).then(()=>{if(!done)spans[i].style.transform='';});

 // Der Schwarm kreist, schreibt die erste Zeile; während sie an ihren Platz gleitet, sammelt er
 // sich für die zweite.
 flock.begin(vw<560?T.birdsSmall:T.birds);
 if(!await flock.wait(T.circleMs)||done)return;
 if(!await flock.write(chars[0])||done)return;
 await hold(T.moveGap);if(done)return;
 const leadMoved=glide(0);
 if(!await flock.write(chars[1])||done)return;
 await hold(T.moveGap);if(done)return;
 // Die Vögel fliegen davon; der farbige landet im Logo und wird zum „V“ (style.css: .brand-mark.is-filled).
 const landing=flock.release(mark,()=>{if(!done)mark?.classList.add('is-filled','pop');});
 await Promise.all([leadMoved,glide(1)]);if(done)return;

 // Satzkarte: erst nur der finnische Satz, dann wächst die Karte drumherum.
 const card=document.getElementById('guest-card');
 const ready=()=>card&&!card.hidden&&!card.classList.contains('is-loading')&&card.querySelector('.guest-fi,.guest-finale');
 // Nach den fünf Gast-Sätzen zeigt die Karte den Abschluss – dann blendet sie einfach mit dem Rest ein.
 if(await waitFor(ready,T.cardWait)&&!done&&card.querySelector('.guest-fi')){
  card.classList.add('intro-bare','intro-shown');
  const words=[...card.querySelectorAll('.guest-fi')].map((word,i)=>play(word,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:700,delay:i*110,easing:EASE_OUT,fill:'both'}));
  await Promise.all(words.map(finished));if(done)return;
  await hold(T.sentenceGap);if(done)return;
  card.classList.add('intro-growing');
  card.classList.remove('intro-bare');
  // Die Karte hat keinen Rahmen mehr: Der Satz bleibt stehen, der Rest blendet ein (style.css).
 }
 if(done)return;
 await landing;if(done)return;

 // Restliche Seite gestaffelt einblenden (Reihenfolge = Lesereihenfolge).
 const rest=[...document.querySelectorAll('header .header-nav, .today, #home-view>:not(.intro), .page-tools, footer')].filter(el=>!el.hidden&&!el.classList.contains('intro-shown'));
 rest.forEach((el,i)=>play(el,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:650,delay:120+i*90,easing:EASE_OUT,fill:'backwards'}));
 html.classList.remove('intro-pending');
 await sleep(120+rest.length*90+700);
 if(done)return;
 // Die zwei übrigen Vögel setzen sich.
 settled=true;flock.settle();
 finish();
}

// Restliche Seite gestaffelt einblenden (Reihenfolge = Lesereihenfolge).
function revealRest(selector,play){
 const rest=[...document.querySelectorAll(selector)].filter(el=>!el.hidden&&!el.classList.contains('intro-shown'));
 rest.forEach((el,i)=>play(el,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:650,delay:120+i*90,easing:EASE_OUT,fill:'backwards'}));
 html.classList.remove('intro-pending');
 return sleep(120+rest.length*90+700);
}

const USER={
 cardWait:6000,     // Satz des Tages braucht Sätze und Wortanalyse – so lange höchstens warten
 greetIn:700,       // Begrüßung blendet ein …
 greetHold:1300,    // … und steht gut eine Sekunde allein
 greetScale:3,      // so viel größer als später an ihrem Platz (höchstens 86 % der Breite)
 greetAt:.36,       // Höhe der Begrüßung im Bild
 birds:110,         // Größe des Schwarms; auf schmalen Bildschirmen:
 birdsSmall:45,
 flyMs:1000,        // der Vogel fliegt in Ruhe vom Logo zur Begrüßung
 dissolveSpeed:.34, // … und zieht langsam darüber (px je ms)
 writeSpeed:.42,    // der Schwarm schreibt ruhig, langsamer als bei den Gästen (px je ms)
 sentenceGap:700    // Satz steht fertig da, dann fliegt der Schwarm davon
};
const DAY='vanamo-user-intro-day'; // das Intro für Angemeldete läuft nur beim ersten Öffnen am Tag (index.html)

// Zerlegt alle Textknoten in `el` in einzelne Buchstaben (Klasse `intro-ch`), Leerzeichen bleiben stehen.
function splitTextNodes(el,shown){
 const chars=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];
 while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){
  if(!node.data.trim()||node.parentElement.closest('button,.sentence-source-icon'))continue;
  const frag=document.createDocumentFragment();
  node.data.split(/(\s+)/).forEach(part=>{
   if(!part)return;
   if(/^\s+$/.test(part)){frag.append(part);return;}
   const w=document.createElement('span');w.className='intro-w';
   for(const c of part){const x=document.createElement('span');x.className=shown?'intro-ch on':'intro-ch';x.textContent=c;w.append(x);chars.push(x);}
   frag.append(w);
  });
  node.replaceWith(frag);
 }
 return chars;
}
const unsplit=root=>root?.querySelectorAll('.intro-w').forEach(w=>w.replaceWith(w.textContent));

export async function runUserIntro(){
 const card=document.getElementById('daily-sentence'),h1=document.querySelector('#home-view .intro h1');
 const mark=document.querySelector('header .brand-mark');
 if(!card||!h1||!mark||typeof card.animate!=='function'){html.classList.remove('intro-pending','intro-user');return;}
 html.classList.add('intro-running');
 try{sessionStorage.setItem(SEEN,'1');localStorage.setItem(DAY,new Date().toLocaleDateString('sv-SE'));}catch{}

 const animations=[],controller=new AbortController(),flock=createBirds();
 let done=false,settled=false,greet=null;
 const play=(el,frames,options)=>{const a=el.animate(frames,options);animations.push(a);return a;};
 // Sofort zum Endzustand – auch der normale Abschluss läuft hier durch.
 function finish(){
  if(done)return;done=true;
  controller.abort();
  animations.forEach(a=>a.cancel());
  greet?.remove();
  unsplit(card);
  card.classList.remove('intro-bare','intro-growing','intro-shown','intro-write');
  mark.classList.remove('is-filling','is-filled','pop');
  html.classList.remove('intro-pending','intro-running','intro-user');
  if(!settled)flock.skip();
 }
 for(const type of ['pointerdown','keydown','wheel','touchstart'])addEventListener(type,finish,{signal:controller.signal,passive:true});
 setTimeout(finish,20000); // Sicherheitsnetz

 await waitFor(()=>!html.classList.contains('i18n-pending'),3000);
 try{await Promise.race([document.fonts?.ready,sleep(1500)]);}catch{}
 if(done)return;
 scrollTo(0,0);

 // 1. Logo und „vanamo“ stehen; die Begrüßung (deutsch) erscheint groß im oberen Drittel.
 //    Sie ist eine eigene Ebene über der Seite – die echte Überschrift bleibt verborgen und unberührt.
 const source=h1.querySelector('.greeting-de')||h1,place=h1.getBoundingClientRect(),style=getComputedStyle(h1);
 greet=document.createElement('div');greet.className='intro-greet';greet.setAttribute('aria-hidden','true');
 greet.innerHTML=source.innerHTML;
 greet.style.fontFamily=style.fontFamily;greet.style.fontWeight=style.fontWeight;
 document.body.append(greet);
 const base=parseFloat(style.fontSize)||22;
 greet.style.fontSize=base*USER.greetScale+'px';
 // Breite des Textes selbst messen (die Ebene ist so breit wie die Seite).
 const lineWidth=()=>{const r=document.createRange();r.selectNodeContents(greet);return r.getBoundingClientRect().width;};
 const wide=lineWidth();if(wide>innerWidth*.86)greet.style.fontSize=Math.max(base,base*USER.greetScale*innerWidth*.86/wide)+'px';
 // groß im oberen Drittel, aber nie über der Stelle, an der sie später steht
 greet.style.top=Math.max((place.top+place.bottom)/2,innerHeight*USER.greetAt)+scrollY-greet.offsetHeight/2+'px';
 const greeting=splitTextNodes(greet,true);
 play(greet,[{opacity:0,transform:'translateY(14px)'},{opacity:1,transform:'none'}],{duration:USER.greetIn,easing:EASE_OUT,fill:'backwards'});
 await hold(USER.greetIn+USER.greetHold);if(done)return;

 // 2. Sobald der Satz des Tages da ist: Der Vogel fliegt aus dem Logo (die Kachel wird leer), überfliegt
 //    die Begrüßung – sie löst sich in den Schwarm auf – und der Schwarm schreibt den finnischen Satz.
 const ready=()=>!card.hidden&&card.querySelector('.daily-words .guest-fi');
 if(await waitFor(ready,USER.cardWait)&&!done){
  card.classList.remove('is-entering');
  card.classList.add('intro-bare','intro-shown','intro-write');
  const sentence=[...card.querySelectorAll('.daily-words .guest-fi')].flatMap(word=>splitTextNodes(word,false));
  mark.classList.add('is-filling','is-filled');
  void mark.offsetWidth;
  mark.classList.remove('is-filled');
  flock.beginFrom(mark);
  if(!await flock.dissolve(greeting,innerWidth<560?USER.birdsSmall:USER.birds,USER.flyMs,USER.dissolveSpeed)||done)return;
  if(!await flock.write(sentence,USER.writeSpeed)||done)return;
  await hold(USER.sentenceGap);if(done)return;
  // 3. Wie bei den Gästen: Der Schwarm fliegt davon, der farbige Vogel landet im Logo und wird wieder
  //    zum „V“, zwei Vögel bleiben. Bedeutungen und Übersetzung blenden ein.
  const landing=flock.release(mark,()=>{if(!done)mark.classList.add('is-filled','pop');});
  card.classList.add('intro-growing');
  card.classList.remove('intro-bare');
  await landing;if(done)return;
  // 4. Der Rest der Seite erscheint, auch die Begrüßung – sie dreht sich kurz darauf auf Finnisch (home-extras.mjs).
  await revealRest('header .header-nav, #home-view .intro h1, .today, #home-view>:not(.intro), .page-tools, footer',play);
  if(done)return;
  settled=true;flock.settle();
  finish();
  return;
 }
 if(done)return;
 // Kein Satz des Tages in Sicht: ohne Schwarm weiter.
 play(greet,[{opacity:1},{opacity:0}],{duration:250,fill:'forwards'});
 await revealRest('header .header-nav, #home-view .intro h1, .today, #home-view>:not(.intro), .page-tools, footer',play);
 finish();
}

runGuestIntro();
