// Vanamo – Intro auf der Startseite.
//
// Angemeldete (Klasse `intro-user`, siehe runUserIntro unten): nur Logo und der finnische
// „Satz des Tages“, etwas größer als normal; dann wächst die Karte um ihn herum auf, der Satz
// schrumpft auf seine normale Größe und der Rest der Seite blendet ein. Die Begrüßung steht
// zuerst auf Deutsch und dreht sich danach auf Finnisch (home-extras.mjs).
//
// Besucher ohne Konto:
// Ablauf (nur beim ersten Aufruf pro Tab, nicht bei „Bewegung reduzieren“):
//   1. „Ein bisschen Finnisch.“ erscheint groß in der Bildschirmmitte,
//   2. kurz danach „Jeden Tag.“,
//   3. beides gleitet an seinen Platz oben links,
//   4. der finnische Satz der Satzkarte erscheint allein,
//   5. danach wächst die Karte um ihn herum auf, der Rest der Seite blendet ein.
// Logo und „vanamo“ im Header stehen von Anfang an.
// Ein Klick, Tipp, Scrollen oder Tastendruck springt sofort zum fertigen Zustand.
// Der Inline-Schnipsel in index.html setzt vorher `intro-pending` (versteckt die Seite
// ohne Aufblitzen); dieses Modul übernimmt ab dort und räumt am Ende alles wieder weg.

// Pausen zählen jeweils ab dem Moment, in dem der vorige Schritt fertig zu sehen ist.
const T={
 fadeMs:800,        // Einblenden einer Zeile
 tailGap:400,       // „Ein bisschen Finnisch.“ steht allein, dann kommt „Jeden Tag.“
 moveGap:500,       // beide Zeilen stehen, dann gleiten sie an ihren Platz
 moveMs:1000,
 sentenceGap:300,   // Satz steht allein, dann wächst die Karte
 cardWait:4000      // so lange höchstens auf die Satzkarte warten
};
const EASE_MOVE='cubic-bezier(.65,0,.25,1)',EASE_OUT='cubic-bezier(.2,.7,.2,1)';
const SEEN='vanamo-intro-seen';

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

export async function runGuestIntro(){
 if(!html.classList.contains('intro-pending'))return;
 if(html.classList.contains('intro-user'))return runUserIntro();
 const h1=document.querySelector('#home-view .intro h1');
 const lead=h1?.querySelector('.intro-lead'),tail=h1?.querySelector('.intro-tail');
 if(!h1||!lead||!tail||typeof h1.animate!=='function'){html.classList.remove('intro-pending');return;}
 html.classList.add('intro-running');
 try{sessionStorage.setItem(SEEN,'1');}catch{}

 const animations=[],controller=new AbortController();
 let done=false;
 const play=(el,frames,options)=>{const a=el.animate(frames,options);animations.push(a);return a;};

 // Sofort zum Endzustand – auch der normale Abschluss läuft hier durch.
 function finish(){
  if(done)return;done=true;
  controller.abort();
  animations.forEach(a=>a.cancel());
  h1.style.transform='';h1.style.transformOrigin='';
  const card=document.getElementById('guest-card');
  card?.classList.remove('intro-bare','intro-growing','intro-shown');
  html.classList.remove('intro-pending','intro-running');
 }
 for(const type of ['pointerdown','keydown','wheel','touchstart'])addEventListener(type,finish,{signal:controller.signal,passive:true});
 setTimeout(finish,15000); // Sicherheitsnetz

 // Übersetzung und Schriften abwarten, sonst stimmen die Maße nicht.
 await waitFor(()=>!html.classList.contains('i18n-pending'),3000);
 try{await Promise.race([document.fonts?.ready,sleep(1500)]);}catch{}
 if(done)return;

 scrollTo(0,0);
 const vw=innerWidth,vh=innerHeight;
 const fadeIn=[{opacity:0,transform:'translateY(.35em)',filter:'blur(6px)'},{opacity:1,transform:'none',filter:'blur(0)'}];
 // FLIP: Endposition des Textes messen (nicht des ganzen Blocks), dann groß in die Mitte
 // setzen und von dort zurückgleiten. Umbrüche bleiben dabei genau wie am Ende.
 const el=h1.getBoundingClientRect(),rects=[...lead.getClientRects(),...tail.getClientRects()];
 const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right));
 const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
 const scale=Math.max(1,Math.min(vw*.86/(right-left),vh*.5/(bottom-top),4));
 h1.style.transformOrigin=`${(left+right)/2-el.left}px ${(top+bottom)/2-el.top}px`;
 const big=`translate(${vw/2-(left+right)/2}px,${vh/2-(top+bottom)/2}px) scale(${scale})`;
 h1.style.transform=big;
 await hold(50);if(done)return; // erst zeichnen lassen, dann starten
 await finished(play(lead,fadeIn,{duration:T.fadeMs,easing:EASE_OUT,fill:'both'}));
 await hold(T.tailGap);if(done)return;
 await finished(play(tail,fadeIn,{duration:T.fadeMs,easing:EASE_OUT,fill:'both'}));
 await hold(T.moveGap);if(done)return;
 const move=play(h1,[{transform:big},{transform:'none'}],{duration:T.moveMs,easing:EASE_MOVE,fill:'forwards'});
 await finished(move);if(done)return;
 h1.style.transform='';h1.style.transformOrigin='';

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
  play(card,[{transform:'scale(.97)'},{transform:'none'}],{duration:700,easing:EASE_OUT});
 }
 if(done)return;

 // Restliche Seite gestaffelt einblenden (Reihenfolge = Lesereihenfolge).
 const rest=[...document.querySelectorAll('header .header-nav, #home-view .today, #home-view>:not(.intro), .page-tools, footer')].filter(el=>!el.hidden&&!el.classList.contains('intro-shown'));
 rest.forEach((el,i)=>play(el,[{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:650,delay:120+i*90,easing:EASE_OUT,fill:'backwards'}));
 html.classList.remove('intro-pending');
 await sleep(120+rest.length*90+700);
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
 sentenceScale:1.3, // so viel größer steht der Satz am Anfang allein
 cardWait:6000,     // Satz des Tages braucht Sätze und Wortanalyse – so lange höchstens warten
 sentenceGap:700,   // Satz steht allein, dann wächst die Karte
 shrinkMs:800
};

export async function runUserIntro(){
 const card=document.getElementById('daily-sentence');
 if(!card||typeof card.animate!=='function'){html.classList.remove('intro-pending','intro-user');return;}
 html.classList.add('intro-running');
 try{sessionStorage.setItem(SEEN,'1');}catch{}

 const animations=[],controller=new AbortController();
 let done=false,words=null;
 const play=(el,frames,options)=>{const a=el.animate(frames,options);animations.push(a);return a;};
 function finish(){
  if(done)return;done=true;
  controller.abort();
  animations.forEach(a=>a.cancel());
  if(words){words.style.transform='';words.style.transformOrigin='';}
  card.classList.remove('intro-bare','intro-growing','intro-shown','intro-drop');
  html.classList.remove('intro-pending','intro-running','intro-user');
 }
 for(const type of ['pointerdown','keydown','wheel','touchstart'])addEventListener(type,finish,{signal:controller.signal,passive:true});
 setTimeout(finish,15000); // Sicherheitsnetz

 await waitFor(()=>!html.classList.contains('i18n-pending'),3000);
 try{await Promise.race([document.fonts?.ready,sleep(1500)]);}catch{}
 const ready=()=>!card.hidden&&card.querySelector('.daily-words .guest-fi');
 if(await waitFor(ready,USER.cardWait)&&!done){
  scrollTo(0,0);
  card.classList.remove('is-entering');
  card.classList.add('intro-bare','intro-shown','intro-drop');
  words=card.querySelector('.daily-words');
  // Satz etwas größer, um die Mitte der tatsächlichen Wörter herum (nicht die ganze Kartenbreite),
  // damit er auch auf dem Handy im Bild bleibt.
  const box=words.getBoundingClientRect(),rects=[...words.querySelectorAll('.guest-fi')].map(el=>el.getBoundingClientRect());
  const left=Math.min(...rects.map(r=>r.left)),right=Math.max(...rects.map(r=>r.right));
  const top=Math.min(...rects.map(r=>r.top)),bottom=Math.max(...rects.map(r=>r.bottom));
  const room=Math.min(left,innerWidth-right)*2+(right-left); // Platz, wenn der Satz um seine Mitte wächst
  const scale=Math.max(1,Math.min(USER.sentenceScale,(room-32)/(right-left))); // mind. 16px Rand je Seite
  words.style.transformOrigin=`${(left+right)/2-box.left}px ${(top+bottom)/2-box.top}px`;
  const big=`scale(${scale})`;
  words.style.transform=big;
  // Die Wortkacheln fallen herunter und hüpfen nach (CSS: daily-drop).
  await hold(1000+words.querySelectorAll('.cycle-word').length*120);if(done)return;
  await hold(USER.sentenceGap);if(done)return;
  card.classList.add('intro-growing');
  card.classList.remove('intro-bare');
  play(words,[{transform:big},{transform:'none'}],{duration:USER.shrinkMs,easing:EASE_MOVE,fill:'forwards'});
  words.style.transform='';
  play(card,[{transform:'scale(.97)'},{transform:'none'}],{duration:700,easing:EASE_OUT});
  await hold(250);
 }
 if(done)return;
 await revealRest('header .header-nav, #home-view .intro h1, #home-view .today, #home-view>:not(.intro), .page-tools, footer',play);
 finish();
}

runGuestIntro();
