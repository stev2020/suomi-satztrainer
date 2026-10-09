// Vanamo – Vogelschwarm für das Intro und die zwei Schwalben auf der Startseite (Gäste und Angemeldete).
//
// Das Intro selbst (createIntroFlock) zeichnet Vögel UND Buchstaben auf eine eigene Zeichenfläche – wenn möglich
// in einem eigenen Thread (intro-flock-worker.mjs, OffscreenCanvas). So kann die Seite gleichzeitig laden und
// rechnen, ohne dass der Schwarm ruckelt; ohne Worker läuft dasselbe Zeichenwerk (intro-flock.mjs) hier.
// guest-intro.mjs steuert den Ablauf:
//   begin()      – Gäste: der Schwarm kreist in der Bildmitte,
//   beginFrom()  – Angemeldete: nur der farbige Vogel startet am Logo,
//   dissolve()   – er überfliegt die Begrüßung, jeder Buchstabe wird zu Vögeln,
//   write()      – der Schwarm fliegt an den Zeilenanfang und zieht durch die Zeile; hinter ihm erscheinen die
//                  Buchstaben. Ist die Zeile fertig, wird das Bild unsichtbar gegen den echten Text getauscht,
//   release()    – alle fliegen davon; der eine farbige Vogel fliegt ins Logo, zwei bleiben übrig,
//   settle()     – die zwei werden an createBirds() übergeben und setzen sich auf den Hauptknopf.
// Die Buchstaben (Elemente `.intro-ch`) behalten dabei ihre Klasse `on` wie vorher (für Tests und den Abschluss),
// sind aber unsichtbar (`is-canvas`), solange sie auf der Zeichenfläche stehen.
//
// createBirds(): die zwei Schwalben auf der Startseite (nach dem Intro, und für Gäste ganz ohne Intro: startPets()).
// Kommt der Mauszeiger oder ein Tipp in ihre Nähe, fliegen sie zusammen auf und setzen sich woanders
// wieder nebeneinander. Verschwindet ihr Sitzplatz (andere Ansicht, anderer Schritt, Anmeldung),
// fliegen sie um oder davon und kommen zurück, sobald es wieder einen Platz gibt.
// Gezeichnet wird auf eine Zeichenfläche oben auf der Seite (Seitenkoordinaten, sie scrollt mit).
// Sitzen die Schwalben still, läuft keine Animation.

const SIT=.55;      // Größe der sitzenden Schwalbe im Verhältnis zu ihrer Zeichnung
const PET_SIZE=7.5; // halbe Spannweite der zwei Schwalben im Flug (px)

export function createBirds(){
 const html=document.documentElement;
 const cv=document.createElement('canvas');cv.className='intro-birds';cv.setAttribute('aria-hidden','true');
 const ctx=cv.getContext('2d');
 let W=0,H=0,birds=[],sparks=[],hist=[],att={x:0,y:0},spread={x:70,y:40};
 let col={ink:'#172c38',mint:'#ace0d4',line:'#172c38'};
 let raf=0,last=0,clock=0,intro=false,seatAt=null,watching=false,state='';
 const pets=()=>birds.filter(b=>b.pet);

 function colors(){
  const cs=getComputedStyle(html),get=(name,old)=>cs.getPropertyValue(name).trim()||old;
  const next={ink:get('--ink',col.ink),mint:get('--mint',col.mint),line:get('--line',col.line)};
  const changed=next.ink!==col.ink||next.mint!==col.mint||next.line!==col.line;
  col=next;return changed;
 }
 function size(height){
  W=html.clientWidth;H=Math.round(height);
  const d=Math.min(devicePixelRatio||1,2);
  cv.style.width=W+'px';cv.style.height=H+'px';cv.width=Math.round(W*d);cv.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);
 }
 function mount(height){if(!cv.isConnected)document.body.append(cv);cv.style.display='';colors();size(height);}
 // Rechteck in Seitenkoordinaten
 const rect=el=>{const r=el.getBoundingClientRect();return {l:r.left+scrollX,r:r.right+scrollX,t:r.top+scrollY,b:r.bottom+scrollY,cx:(r.left+r.right)/2+scrollX,cy:(r.top+r.bottom)/2+scrollY};};

 // ---- Uhr und Abläufe ----
 function loop(){if(!raf){last=performance.now();raf=requestAnimationFrame(frame);}}

 // ---- Zeichnen ----
 function drawBird(b){
  const f=.3+.7*Math.sin(b.flap),w=b.size,h=b.size*.8*f;
  const tilt=Math.max(-.55,Math.min(.55,Math.atan2(b.vy,Math.abs(b.vx)+80)))*(b.vx<0?-1:1);
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(tilt);ctx.globalAlpha=Math.max(0,Math.min(1,b.alpha));
  ctx.beginPath();ctx.moveTo(-w,-h);ctx.quadraticCurveTo(-w*.45,-h*.5-w*.3,0,0);ctx.quadraticCurveTo(w*.45,-h*.5-w*.3,w,-h);
  if(b.mint){ctx.lineWidth=5.4;ctx.strokeStyle=col.line;ctx.stroke();ctx.lineWidth=2.6;ctx.strokeStyle=col.mint;ctx.stroke();}
  else{ctx.lineWidth=1.5;ctx.strokeStyle=col.ink;ctx.stroke();}
  ctx.restore();
 }
 // Sitzende Schwalbe von hinten: runder Kopf, schmaler Körper, zwei lange Schwanzspitzen, die unter
 // die Kante hängen. (x,y) ist der Punkt auf der Kante.
 function drawSwallow(x,y,k,alpha,sy){
  ctx.save();ctx.translate(x,y);ctx.scale(k,k*sy);ctx.globalAlpha=alpha;ctx.fillStyle=col.ink;
  ctx.beginPath();ctx.arc(0,-15.6,3.1,0,6.29);ctx.fill();
  ctx.beginPath();ctx.moveTo(-2.4,-13.8);ctx.bezierCurveTo(-5.6,-11.5,-5.4,-3,-2.2,3.5);ctx.lineTo(-2.9,11);ctx.lineTo(-1.3,5);ctx.lineTo(0,3.8);
  ctx.lineTo(1.3,5);ctx.lineTo(2.9,11);ctx.lineTo(2.2,3.5);ctx.bezierCurveTo(5.4,-3,5.6,-11.5,2.4,-13.8);ctx.closePath();ctx.fill();
  ctx.restore();
 }
 // Nach der Landung klappt das Flug-V an den Körper und blendet aus, während die Schwalbe einblendet.
 function drawSit(b){
  const tl=Math.min(1,(clock-(b.land??-1e9))/460),tt=Math.min(1,(clock-(b.tw??-1e9))/460);
  const e=tl*tl*(3-2*tl),k=b.size/7.5*SIT,L=(a,z)=>a+(z-a)*e;
  if(e<1){
   const w=b.size,h=b.size*.5,tx=L(w,4*k),ty=L(-h,-2*k),cx=L(w*.45,5*k),cy=L(-h*.5-w*.3,-9*k),my=L(0,-11*k);
   ctx.save();ctx.translate(b.x,b.y);ctx.globalAlpha=1-e;
   ctx.beginPath();ctx.moveTo(-tx,ty);ctx.quadraticCurveTo(-cx,cy,0,my);ctx.quadraticCurveTo(cx,cy,tx,ty);
   ctx.lineWidth=1.7;ctx.strokeStyle=col.ink;ctx.stroke();ctx.restore();
  }
  drawSwallow(b.x,b.y,k,e,(.7+.3*e)*(1-.07*Math.sin(Math.PI*tt)));
 }

 // ---- Ein Bild ----
 const histAt=t=>{for(let i=hist.length-1;i>=0;i--)if(hist[i].t<=t)return hist[i];return hist[0]||att;};
 function frame(now){
  const dt=Math.min((now-last)/1000,.05);last=now;clock+=dt*1000;
  hist.push({t:clock,x:att.x,y:att.y});while(hist.length>2&&clock-hist[0].t>700)hist.shift();
  ctx.clearRect(0,0,W,H);ctx.lineCap='round';ctx.lineJoin='round';
  for(const b of birds){
   if(b.mode==='sit'){drawSit(b);continue;}
   let ax,ay;
   if(b.mode==='leave'){ax=b.dx*1100;ay=b.dy*1100;b.alpha-=dt/1.2;}
   else{
    let tx,ty,k,c;
    if(b.mode==='home'){tx=b.tx;ty=b.ty;k=11;c=4.6;}
    // sanft anfliegen: Der Zug zum Ziel baut sich erst auf, sonst schießen sie los wie eine Rakete.
    else if(b.mode==='petfly'){const g=Math.min(1,(clock-b.t0)/700);tx=b.tx;ty=b.ty;k=16*g*g;c=7.4;}
    else{const p=histAt(clock-b.lag);b.ang+=b.spin*dt;tx=p.x+Math.cos(b.ang)*b.r*spread.x;ty=p.y+Math.sin(b.ang)*b.r*spread.y;k=38;c=8.5;}
    ax=(tx-b.x)*k-b.vx*c;ay=(ty-b.y)*k-b.vy*c;
   }
   ax+=(Math.random()-.5)*300;ay+=(Math.random()-.5)*300;
   b.vx+=ax*dt;b.vy+=ay*dt;
   const sp=Math.hypot(b.vx,b.vy),vmax=b.mode==='petfly'?360:1200;if(sp>vmax){b.vx*=vmax/sp;b.vy*=vmax/sp;}
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.flap+=b.rate*dt;
   if(b.mode==='petfly'&&((Math.hypot(b.tx-b.x,b.ty-b.y)<5&&Math.hypot(b.vx,b.vy)<120)||clock-b.t0>4500)){
    b.mode='sit';b.x=b.tx;b.y=b.ty;b.vx=b.vy=0;b.land=clock;b.from=null;drawSit(b);continue;
   }
   // Abflug: Die sitzende Form blendet am alten Platz aus.
   if(b.from){const t=(clock-b.from.t)/260;if(t<1)drawSwallow(b.from.x,b.from.y,b.size/7.5*SIT,1-t,1);else b.from=null;}
   drawBird(b);
  }
  birds=birds.filter(b=>!b.dead&&(b.mode!=='leave'||(b.alpha>0&&b.x>-40&&b.x<W+40&&b.y>scrollY-40&&b.y<H+40)));
  for(const p of sparks){
   p.life-=dt/.6;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;
   ctx.globalAlpha=Math.max(0,p.life);ctx.strokeStyle=p.c;ctx.lineWidth=2.2;
   ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();
  }
  ctx.globalAlpha=1;sparks=sparks.filter(p=>p.life>0);
  report();
  raf=sparks.length||birds.some(b=>b.mode!=='sit'||clock-Math.max(b.tw??-1e9,b.land??-1e9)<470)?requestAnimationFrame(frame):0;
 }
 // Zustand der zwei Schwalben, für Tests ablesbar: none | fly | sit:<Platz>
 function report(){
  const ps=pets(),next=!ps.length?'none':ps.every(b=>b.mode==='sit')?'sit:'+(seatAt?.name||''):'fly';
  if(next!==state){state=next;cv.dataset.pets=next;}
 }

 // ---- Übernahme vom Intro (intro-flock.mjs): die zwei Schwalben fliegen hier weiter ----
 function takeOver(list){
  intro=false;
  mount(areaHeight());
  birds=list.slice(0,2).map((p,i)=>({pet:true,mode:'follow',alpha:1,x:p.x,y:p.y,vx:p.vx||0,vy:p.vy||0,size:PET_SIZE,
   flap:p.flap??Math.random()*6.28,rate:17+Math.random()*10,lag:60+i*90,r:.35,ang:Math.random()*6.28,spin:2}));
  sparks=[];hist=[];att={x:birds[0]?.x||W/2,y:birds[0]?.y||0};
  if(!birds.length||!flyTogether('button',false)){birds.forEach(leave);loop();}
  watch();
 }
 function leave(b){const a=-(.25+Math.random()*1.1)*(Math.random()<.8?1:2.4);b.mode='leave';b.dx=Math.cos(a);b.dy=Math.sin(a);}

 // ---- Sitzplätze: Oberkanten von Elementen der Startseite ----
 const shown=el=>el&&!el.hidden&&el.getClientRects().length?el:null;
 const PERCH=[
  // Angemeldete: der „Draht“ unter den Reitern der Startseite, direkt neben dem gewählten Reiter (nicht am Handy,
  // dort liegt die Leiste fest am unteren Rand)
  ['wire',()=>{const nav=shown(document.getElementById('home-tabs'));if(!nav||getComputedStyle(nav).position==='fixed')return null;const tab=nav.querySelector('[aria-selected="true"]');if(!tab)return null;const n=rect(nav),t=rect(tab);return tab.dataset.homeTabButton==='new'?{l:t.r+8,r:t.r+40,t:n.b-1.5}:{l:t.l-40,r:t.l-8,t:n.b-1.5};},0],
  // der Hauptknopf: für Gäste an der Satzkarte, für Angemeldete „Aufgaben starten“
  ['button',()=>{const el=shown(document.querySelector('#guest-card .guest-first'))||shown(document.getElementById('start-daily-session'));return el&&rect(el);},0],
  // Angemeldete, Reiter „Willkommen“: auch der Knopf „Wiederholen“ (nicht „Neue Sätze“ – der liegt am Handy oft außer Sicht)
  ['review',()=>{const el=shown(document.getElementById('welcome-review'));return el&&rect(el);},0],
  ['account',()=>{const el=shown(document.getElementById('account-button'));return el&&rect(el);},0],
  // der orange Trennstrich unter der Überschrift (ein ::after, deshalb aus dem Block berechnet)
  ['rule',()=>{const el=shown(document.querySelector('#home-view .intro'));if(!el||getComputedStyle(el,'::after').content==='none')return null;const r=rect(el);return {l:r.cx-28,r:r.cx+28,t:r.b-2};},0],
  // Angemeldete: der zweite orange Strich über dem Satz des Tages
  ['rule2',()=>{const el=shown(document.getElementById('daily-sentence'));if(!el||getComputedStyle(el,'::before').content==='none')return null;const r=rect(el);return {l:r.cx-28,r:r.cx+28,t:r.t};},0],
  // am Logo: eine auf der oberen rechten Ecke der (gedrehten) Kachel, die andere auf dem „v“ von „vanamo“
  ['brand',brandSeats,0]
 ];
 function brandSeats(){
  const mark=shown(document.querySelector('header .brand-mark')),brand=mark?.parentElement;
  const text=brand&&[...brand.childNodes].find(n=>n.nodeType===3&&n.data.trim());
  if(!mark||!text)return null;
  // Punkt auf der Oberkante der Kachel, kurz vor der runden Ecke, mit der Drehung der Kachel
  const r=rect(mark),m=new DOMMatrix(getComputedStyle(mark).transform),w=mark.offsetWidth/2,h=mark.offsetHeight/2,lx=w-10,ly=-h;
  const corner={x:r.cx+lx*m.a+ly*m.c,y:r.cy+lx*m.b+ly*m.d+1};
  // Oberkante des ersten Buchstabens: Grundlinie minus Höhe des „v“
  const range=document.createRange(),at=text.data.search(/\S/);range.setStart(text,at);range.setEnd(text,at+1);
  const box=range.getBoundingClientRect();if(!box.width)return null;
  const cs=getComputedStyle(brand);ctx.save();ctx.font=`${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;const tm=ctx.measureText(text.data[at]);ctx.restore();
  const asc=tm.fontBoundingBoxAscent,desc=tm.fontBoundingBoxDescent;
  const base=asc+desc?box.top+box.height*asc/(asc+desc):box.bottom-box.height*.25;
  const letter={x:box.left+scrollX+box.width*.3,y:base-tm.actualBoundingBoxAscent+scrollY+1};
  return {l:corner.x-12,r:letter.x+12,t:Math.min(corner.y,letter.y),pts:[corner,letter]};
 }
 function available(){
  if(!shown(document.getElementById('home-view')))return [];
  return PERCH.map(([name,find,dy])=>{const r=find();return r&&r.r-r.l>=24&&r.t>(r.pts?4:24)&&r.t<H-4?{name,l:r.l,r:r.r,t:r.t+dy,pts:r.pts}:null;}).filter(Boolean);
 }
 // Sucht einen Platz für beide nebeneinander. `prefer`: Wunschplatz; sonst ein anderer als der jetzige.
 function seat(prefer,allowSame){
  // Mit Reitern ist der Draht der Stammplatz – vor dem Hauptknopf.
  const all=available();let pick=(prefer==='button'&&all.find(p=>p.name==='wire'))||all.find(p=>p.name===prefer);
  if(!pick){const others=all.filter(p=>allowSame||p.name!==seatAt?.name),pool=others.length?others:all;pick=pool[Math.floor(Math.random()*pool.length)];}
  if(!pick)return false;
  const c=pick.l+(pick.r-pick.l)*(.25+.5*Math.random());
  // feste Punkte (am Logo) oder nebeneinander auf der Kante
  pets().forEach((b,i)=>{const pt=pick.pts?.[i];b.tx=pt?pt.x:Math.max(pick.l+6,Math.min(pick.r-6,c+(i?5:-5)));b.ty=pt?pt.y:pick.t;});
  seatAt={name:pick.name,l:pick.l,t:pick.t};return true;
 }
 function flyTogether(prefer,kick,allowSame){
  if(!seat(prefer,allowSame))return false;
  pets().forEach((b,i)=>{
   const go=()=>{if(!birds.includes(b))return;b.mode='petfly';b.t0=clock;b.alpha=1;if(kick){b.from={x:b.x,y:b.y,t:clock};b.vy=-70;b.vx=(Math.random()-.5)*60;}loop();};
   kick&&i?setTimeout(go,180):go();
  });
  return true;
 }
 const newPet=i=>({pet:true,mode:'sit',alpha:1,x:W+30+i*24,y:scrollY+70+i*16,vx:0,vy:0,size:PET_SIZE,flap:Math.random()*6.28,rate:24});
 function scare(e){
  const ps=pets();
  if(intro||!ps.length||ps.some(b=>b.mode!=='sit'))return;
  if(ps.some(b=>Math.hypot(b.x-e.pageX,b.y-5-e.pageY)<46))flyTogether(null,true);
 }
 function areaHeight(){
  const card=shown(document.getElementById('guest-card'))||shown(document.querySelector('#home-view .home-daily'))||shown(document.getElementById('home-welcome-actions'));
  return Math.min(Math.max(innerHeight,card?rect(card).b+60:0),1600);
 }
 // Regelmäßiger Blick: Stimmt der Sitzplatz noch? Gibt es wieder einen? Ab und zu zuckt ein Flügel.
 function check(){
  if(document.hidden||intro)return;
  const ps=pets(),free=available();
  cv.style.display=ps.length||free.length?'':'none';
  if(cv.style.display==='none')return;
  const want=areaHeight();
  if(html.clientWidth!==W||Math.abs(want-H)>40){size(want);loop();}
  if(colors())loop();
  if(!ps.length){if(free.length){birds=birds.concat([0,1].map(newPet));flyTogether('button',false);}return;}
  if(ps.some(b=>b.mode!=='sit'))return;
  const here=available().find(p=>p.name===seatAt?.name);
  if(!here||Math.abs(here.l-seatAt.l)>2||Math.abs(here.t-seatAt.t)>2){
   // Reiter gewechselt oder Platz verschwunden: zurück auf den Draht, wenn es ihn gibt.
   if(!flyTogether(free.some(p=>p.name==='wire')?'wire':null,true,true)){ps.forEach(leave);loop();}
   return;
  }
  if(!raf&&Math.random()<.35){ps[Math.floor(Math.random()*ps.length)].tw=clock;loop();}
 }
 function watch(){
  if(watching)return;watching=true;
  addEventListener('pointermove',scare,{passive:true});addEventListener('pointerdown',scare,{passive:true});
  setInterval(check,700);
 }

 // Ende des Intros: Die zwei übrigen setzen sich auf den Hauptknopf (oder einen anderen freien Platz).
 function settle(){
  intro=false;
  const want=areaHeight();if(Math.abs(want-H)>40)size(want);
  if(!flyTogether('button',false)){pets().forEach(leave);loop();}
  watch();
 }
 // Intro übersprungen: Schwarm weg, die zwei sitzen sofort.
 function skip(){
  intro=false;
  birds=[0,1].map(newPet);sparks=[];hist=[];
  if(cv.isConnected)size(areaHeight());else mount(areaHeight());
  if(seat('button'))birds.forEach(b=>{b.x=b.tx;b.y=b.ty;});else birds=[];
  loop();watch();
 }
 // Gäste ohne Intro: Die zwei kommen angeflogen, sobald es einen Sitzplatz gibt.
 function startPets(){mount(areaHeight());watch();check();}

 return {takeOver,settle,skip,startPets};
}

// ---- Intro: Schwarm und Buchstaben auf eigener Zeichenfläche ----

const FLOCK='./intro-flock.mjs?v=1',WORKER='./intro-flock-worker.mjs?v=1';
let early=null; // früh gestarteter Worker (warmIntroFlock), damit er bereitsteht, wenn das Intro beginnt
const canWorker=()=>typeof Worker==='function'&&typeof HTMLCanvasElement==='function'&&'transferControlToOffscreen' in HTMLCanvasElement.prototype&&typeof createImageBitmap==='function';
// Startet den Worker schon, während Schriften und Übersetzung geladen werden.
export function warmIntroFlock(){
 if(early||!canWorker())return;
 try{
  const w=new Worker(new URL(WORKER,import.meta.url),{type:'module'});
  const loaded=new Promise(resolve=>{
   const t=setTimeout(()=>resolve(false),2500);
   w.onmessage=e=>{const t2=e.data?.t;if(t2==='loaded'||t2==='unsupported'){clearTimeout(t);resolve(t2==='loaded');}};
   w.onerror=()=>{clearTimeout(t);resolve(false);};
  });
  early={w,loaded};
 }catch{early=null;}
}
const cssColors=()=>{
 const cs=getComputedStyle(document.documentElement),get=(name,old)=>cs.getPropertyValue(name).trim()||old;
 return {ink:get('--ink','#172c38'),mint:get('--mint','#ace0d4'),line:get('--line','#172c38')};
};
// CSS-Zeitkurven (wie in intro-flock.mjs), für das Nachziehen beim Tausch Bild → Text
function bezier(x1,y1,x2,y2){
 const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
 const X=t=>((ax*t+bx)*t+cx)*t,Y=t=>((ay*t+by)*t+cy)*t,dX=t=>(3*ax*t+2*bx)*t+cx;
 return p=>{
  if(p<=0)return 0;if(p>=1)return 1;
  let t=p;for(let i=0;i<6;i++){const d=dX(t);if(Math.abs(d)<1e-6)break;t-=(X(t)-p)/d;}
  return Y(Math.max(0,Math.min(1,t)));
 };
}
const cssEase=bezier(.25,.1,.25,1),riseEase=bezier(.2,.7,.2,1);

export function createIntroFlock(){
 const html=document.documentElement;
 const cv=document.createElement('canvas');cv.className='intro-flock';cv.setAttribute('aria-hidden','true');
 const swallows=createBirds();
 let send=null,ready=null,worker=null,stopped=false,nextId=1,petsReply=null;
 const pending=new Map(),idOf=new WeakMap(),byId=new Map(),litAt=new Map(),shownWait=new Map(),catchUps=[];
 const DPR=()=>Math.min(devicePixelRatio||1,2);

 function onMessage(m){
  if(m.t==='done'){const f=pending.get(m.id);pending.delete(m.id);f?.(m.ok&&!stopped);}
  else if(m.t==='lit'){for(const id of m.ids){if(!litAt.has(id))litAt.set(id,m.at);byId.get(id)?.classList.add('on');}}
  else if(m.t==='unlit'){for(const id of m.ids)byId.get(id)?.classList.remove('on');}
  else if(m.t==='shown'){for(const id of m.ids){const f=shownWait.get(id);if(f){shownWait.delete(id);f();}}}
  else if(m.t==='pets'){petsReply?.(m.list);petsReply=null;}
 }
 function setup(){
  if(ready)return ready;
  return ready=(async()=>{
   const W=html.clientWidth,H=innerHeight;
   cv.style.width=W+'px';cv.style.height=H+'px';
   document.body.append(cv);
   const init={t:'init',w:W,h:H,dpr:DPR(),col:cssColors(),sy:scrollY};
   if(!early)warmIntroFlock();
   const e=early;early=null;
   if(e&&await e.loaded&&!stopped){
    try{
     const off=cv.transferControlToOffscreen();
     worker=e.w;worker.onmessage=ev=>onMessage(ev.data);worker.onerror=null;
     send=(m,transfer)=>worker.postMessage(m,transfer||[]);
     send({...init,canvas:off},[off]);
     cv.dataset.thread='worker';
     return;
    }catch{}
   }
   e?.w.terminate();
   // Ohne Worker: dasselbe Zeichenwerk im Hauptthread
   const {createFlock}=await import(FLOCK);
   const flock=createFlock(m=>queueMicrotask(()=>onMessage(m)));
   send=m=>flock.handle(m);
   send({...init,canvas:cv});
   cv.dataset.thread='main';
  })();
 }
 function run(op,...args){
  if(stopped)return Promise.resolve(false);
  return new Promise(resolve=>{const id=nextId++;pending.set(id,resolve);send({t:'run',id,op,args});});
 }
 const rect=el=>{const r=el.getBoundingClientRect();return {cx:(r.left+r.right)/2+scrollX,cy:(r.top+r.bottom)/2+scrollY};};

 // ---- Buchstaben als Bildchen ----
 // Jeder Buchstabe wird an seiner Endstelle vermessen (Grundlinie und Maßstab über ein unsichtbares Hilfselement)
 // und einmal scharf und einmal unscharf gezeichnet – genau wie ihn die Seite zeigt. Die scharfen Bildchen liegen
 // auf ganzen Gerätepixeln, mit dem Bruchteil der Position im Bild selbst, damit sie so scharf sind wie der Text.
 const blurKeys=new Set();
 function canvasFor(w,h){const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;}
 async function prepare(list,kind,on){
  await setup();
  const todo=list.filter(el=>!idOf.has(el));
  if(!todo.length||stopped)return;
  html.classList.add('intro-measure');
  const probes=todo.map(el=>{const i=document.createElement('i');i.className='intro-probe';el.append(i);return i;});
  const dpr=DPR(),items=todo.map((el,k)=>{
   const r=el.getBoundingClientRect(),p=probes[k].getBoundingClientRect(),cs=getComputedStyle(el);
   const size=parseFloat(cs.fontSize)||16,scale=p.height>0?p.height*2/size:1;
   return {el,r,base:p.bottom,scale,size,cs:{style:cs.fontStyle,weight:cs.fontWeight,stretch:cs.fontStretch,family:cs.fontFamily,color:cs.color},text:el.firstChild?.data||el.textContent};
  });
  probes.forEach(p=>p.remove());
  if(!on)todo.forEach(el=>el.classList.add('is-canvas'));
  html.classList.remove('intro-measure');
  const list2=[],blurs=[],bitmaps=[],transfer=[];
  for(const it of items){
   const id=nextId++;idOf.set(it.el,id);byId.set(id,it.el);
   // Gezeichnet wird in der Schriftgröße der Seite und dann vergrößert – wie der Browser einen skalierten Text zeigt
   // (bei variablen Schriften hängt die Form von der Schriftgröße ab, nicht vom Maßstab).
   const px=it.size*it.scale,sc=it.scale,font=f=>`${f.style} ${f.weight} ${it.size}px ${f.family}`;
   const m=canvasFor(1,1).getContext('2d');m.font=font(it.cs);const tm=m.measureText(it.text);
   const pad=2,asc=tm.actualBoundingBoxAscent*sc,desc=tm.actualBoundingBoxDescent*sc,left=tm.actualBoundingBoxLeft*sc,right=tm.actualBoundingBoxRight*sc;
   const gx=it.r.left+scrollX,gy=it.base+scrollY;
   // scharf: Lage auf ganze Gerätepixel runden, den Rest ins Bild nehmen
   const X=(gx-left-pad)*dpr,Y=(gy-asc-pad)*dpr,fx=X-Math.floor(X),fy=Y-Math.floor(Y);
   const sw=(left+right+2*pad)*dpr+1,sh=(asc+desc+2*pad)*dpr+1;
   const c=canvasFor(sw,sh),x=c.getContext('2d');
   x.setTransform(sc*dpr,0,0,sc*dpr,(left+pad)*dpr+fx,(asc+pad)*dpr+fy);
   x.font=font(it.cs);x.fillStyle=it.cs.color;x.textBaseline='alphabetic';x.fillText(it.text,0,0);
   // unscharf (wie filter: blur(4px), mit dem Maßstab der Zeile), in halber Auflösung und geteilt
   const sigma=4*sc,rb=Math.max(.75,dpr/2),bk=[it.text,font(it.cs),sc.toFixed(3),it.cs.color].join('|');
   if(!blurKeys.has(bk)){
    blurKeys.add(bk);
    const bp=pad+3*sigma,bw=(left+right+2*bp)*rb,bh=(asc+desc+2*bp)*rb,b=canvasFor(bw,bh),y=b.getContext('2d');
    y.font=font(it.cs);y.fillStyle=it.cs.color;y.textBaseline='alphabetic';
    if('filter' in y)y.filter=`blur(${sigma*rb}px)`;
    if(y.filter&&y.filter!=='none'){y.setTransform(sc*rb,0,0,sc*rb,(left+bp)*rb,(asc+bp)*rb);y.fillText(it.text,0,0);}
    else{ // ohne Canvas-Filter (ältere Safari): Schatten eines Textes außerhalb des Bildes
     y.shadowColor=it.cs.color;y.shadowBlur=2*sigma*rb;y.shadowOffsetX=b.width+50;
     y.setTransform(sc*rb,0,0,sc*rb,(left+bp)*rb-b.width-50,(asc+bp)*rb);y.fillText(it.text,0,0);
    }
    blurs.push({key:bk,canvas:b,ox:-left-bp,oy:-asc-bp,w:left+right+2*bp,h:asc+desc+2*bp});
   }
   list2.push({id,k:kind,on:!!on,em:px,gx,gy,bk,l:it.r.left+scrollX,r:it.r.right+scrollX,t:it.r.top+scrollY,b:it.r.bottom+scrollY,
    cx:(it.r.left+it.r.right)/2+scrollX,cy:(it.r.top+it.r.bottom)/2+scrollY,
    canvas:c,sx:Math.floor(X)/dpr,sy:Math.floor(Y)/dpr,sw:c.width/dpr,sh:c.height/dpr});
  }
  // Im Worker brauchen die Bildchen das Format ImageBitmap (wird übertragen, nicht kopiert).
  const toBitmap=async c=>worker?createImageBitmap(c):c;
  await Promise.all([...list2.map(async g=>{g.sharp=await toBitmap(g.canvas);delete g.canvas;if(worker)transfer.push(g.sharp);}),
   ...blurs.map(async b=>{b.bmp=await toBitmap(b.canvas);delete b.canvas;if(worker)transfer.push(b.bmp);})]);
  if(stopped)return;
  if(on){
   // schon sichtbare Buchstaben (Begrüßung): erst ausblenden, wenn die Zeichenfläche sie zeigt
   const seen=Promise.all(list2.map(g=>new Promise(resolve=>{shownWait.set(g.id,resolve);setTimeout(resolve,600);})));
   send({t:'glyphs',list:list2,blurs},transfer);
   await seen;
   todo.forEach(el=>el.classList.add('is-canvas'));
  }else send({t:'glyphs',list:list2,blurs},transfer);
 }
 const ids=list=>list.map(el=>idOf.get(el)).filter(Boolean);
 const frames=n=>new Promise(resolve=>{const step=()=>--n<=0?resolve():requestAnimationFrame(step);requestAnimationFrame(step);});
 // Zeile fertig: echter Text statt Bild. Buchstaben, die gerade noch erscheinen, ziehen auf der Seite nach.
 async function reveal(list){
  const at=performance.timeOrigin+performance.now(),els=list.filter(el=>el.classList.contains('is-canvas'));
  if(!els.length)return;
  els.forEach(el=>{el.style.transition='none';el.classList.add('on');el.classList.remove('is-canvas');});
  void getComputedStyle(els[0]).opacity;
  els.forEach(el=>{
   el.style.transition='';
   const e=at-(litAt.get(idOf.get(el))??-1e9);
   if(e<500&&typeof el.animate==='function'){
    const op=cssEase(Math.min(1,e/400)),bl=4*(1-cssEase(Math.min(1,e/400))),y=.18*(1-riseEase(Math.min(1,e/500)));
    catchUps.push(el.animate([{opacity:op,transform:`translateY(${y}em)`,filter:`blur(${bl}px)`},{opacity:1,transform:'none',filter:'none'}],{duration:500-e,easing:'cubic-bezier(.2,.7,.2,1)'}));
   }
  });
  await frames(2);
  if(!stopped)send({t:'drop',ids:ids(els)});
 }

 // ---- Ablauf (wie bisher createBirds) ----
 async function begin(count){await setup();if(!stopped)send({t:'begin',count,vh:innerHeight});}
 async function beginFrom(markEl,loose){await setup();if(!stopped)send({t:'beginFrom',mark:rect(markEl),loose,vh:innerHeight});}
 async function wait(ms){await setup();return run('wait',ms);}
 async function dissolve(list,count,flyMs,speed){await prepare(list,'g',true);return run('dissolve',ids(list),count,flyMs,speed);}
 async function write(list,speed){
  await prepare(list,'w',false);
  const ok=await run('write',ids(list),speed);
  if(ok)await reveal(list);
  return ok&&!stopped;
 }
 async function release(markEl,onLand){
  const m=markEl?.getClientRects().length?rect(markEl):null;
  const ok=await run('release',m);
  if(!ok||stopped)return false;
  onLand?.();return true;
 }
 function close(delay){
  stopped=true;
  pending.forEach(f=>f(false));pending.clear();
  const end=()=>{try{send?.({t:'stop'});}catch{}worker?.terminate();cv.remove();};
  delay?setTimeout(end,delay):end();
 }
 // Ende des Intros: Die zwei übrigen Vögel wechseln auf die Zeichenfläche der Seite und setzen sich.
 async function settle(){
  await setup();
  const list=await new Promise(resolve=>{petsReply=resolve;send({t:'pets'});setTimeout(()=>resolve([]),400);});
  swallows.takeOver(list);
  close(1500); // davonfliegende Vögel und Funken noch zu Ende zeichnen lassen
 }
 // Übersprungen: Schwarm weg, die zwei sitzen sofort.
 function skip(){
  catchUps.forEach(a=>a.cancel());
  html.querySelectorAll?.('.intro-ch.is-canvas').forEach(el=>el.classList.remove('is-canvas'));
  close(0);
  swallows.skip();
 }
 return {begin,beginFrom,prepare,wait,write,dissolve,release,settle,skip};
}
