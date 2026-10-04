// Vanamo – Vogelschwarm für das Intro und die zwei Schwalben auf der Startseite (Gäste und Angemeldete).
//
// Intro für Angemeldete: beginFrom() – nur der farbige Vogel startet am Logo –, dissolve() – er überfliegt
// die Begrüßung, jeder Buchstabe wird zu Vögeln –, danach write(), release(), settle() wie unten.
// Im Gäste-Intro (guest-intro.mjs steuert den Ablauf):
//   begin()   – der Schwarm kreist in der Bildmitte,
//   write()   – er fliegt an den Zeilenanfang, sammelt sich und zieht durch die Zeile;
//               hinter ihm erscheinen die Buchstaben (Klasse `on`),
//   release() – alle fliegen davon; der eine farbige Vogel fliegt ins Logo, zwei bleiben übrig,
//   settle()  – die zwei setzen sich nebeneinander auf den Hauptknopf.
// Danach (und für Gäste ganz ohne Intro: startPets()) sitzen zwei Schwalben auf der Startseite.
// Kommt der Mauszeiger oder ein Tipp in ihre Nähe, fliegen sie zusammen auf und setzen sich woanders
// wieder nebeneinander. Verschwindet ihr Sitzplatz (andere Ansicht, anderer Schritt, Anmeldung),
// fliegen sie um oder davon und kommen zurück, sobald es wieder einen Platz gibt.
//
// Gezeichnet wird auf eine Zeichenfläche oben auf der Seite (Seitenkoordinaten, sie scrollt mit).
// Alle Zeiten laufen über eine eigene Uhr, die bei Hängern des Browsers stehen bleibt (höchstens
// 50 ms pro Bild) – so überspringt der Schwarm nichts, während z. B. die Satzdaten verarbeitet werden.
// Sitzen die Schwalben still, läuft keine Animation.

const SIT=.55;      // Größe der sitzenden Schwalbe im Verhältnis zu ihrer Zeichnung
const PET_SIZE=7.5; // halbe Spannweite der zwei Schwalben im Flug (px)
const lerp=(a,b,p)=>a+(b-a)*p,ease=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;

export function createBirds(){
 const html=document.documentElement;
 const cv=document.createElement('canvas');cv.className='intro-birds';cv.setAttribute('aria-hidden','true');
 const ctx=cv.getContext('2d');
 let W=0,H=0,VH=0,birds=[],sparks=[],hist=[],tweens=[],att={x:0,y:0},spread={x:60,y:60};
 let col={ink:'#172c38',mint:'#ace0d4',line:'#172c38'};
 let raf=0,last=0,clock=0,mode='',first=true,intro=false,seatAt=null,watching=false,state='';
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
 function tween(ms,fn){return new Promise(resolve=>{tweens.push({start:clock,ms,fn,resolve});loop();});}
 const wait=ms=>tween(ms,()=>{});
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
  for(const t of [...tweens]){
   const p=t.ms<=0?1:Math.min(1,(clock-t.start)/t.ms);t.fn(p);
   if(p>=1){const i=tweens.indexOf(t);if(i>=0)tweens.splice(i,1);t.resolve(true);}
  }
  const s=clock/1000;
  if(mode==='circle'){att.x=W/2+Math.cos(s*1.7)*W*.2;att.y=VH*.45+Math.sin(s*2.6)*VH*.15;}
  else if(mode==='wander'){att.x=W/2+Math.cos(s*1.3)*W*.18;att.y=VH*.3+Math.sin(s*2.1)*VH*.09;}
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
   const sp=Math.hypot(b.vx,b.vy),vmax=b.mode==='petfly'?360:950;if(sp>vmax){b.vx*=vmax/sp;b.vy*=vmax/sp;}
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.flap+=b.rate*dt;
   if(b.mode==='petfly'&&((Math.hypot(b.tx-b.x,b.ty-b.y)<5&&Math.hypot(b.vx,b.vy)<120)||clock-b.t0>4500)){
    b.mode='sit';b.x=b.tx;b.y=b.ty;b.vx=b.vy=0;b.land=clock;b.from=null;drawSit(b);continue;
   }
   // Abflug: Die sitzende Form blendet am alten Platz aus.
   if(b.from){const t=(clock-b.from.t)/260;if(t<1)drawSwallow(b.from.x,b.from.y,b.size/7.5*SIT,1-t,1);else b.from=null;}
   drawBird(b);
  }
  birds=birds.filter(b=>b.mode!=='leave'||(b.alpha>0&&b.x>-40&&b.x<W+40&&b.y>scrollY-40&&b.y<H+40));
  for(const p of sparks){
   p.life-=dt/.6;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;
   ctx.globalAlpha=Math.max(0,p.life);ctx.strokeStyle=p.c;ctx.lineWidth=2.2;
   ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();
  }
  ctx.globalAlpha=1;sparks=sparks.filter(p=>p.life>0);
  report();
  raf=tweens.length||sparks.length||birds.some(b=>b.mode!=='sit'||clock-Math.max(b.tw??-1e9,b.land??-1e9)<470)?requestAnimationFrame(frame):0;
 }
 // Zustand der zwei Schwalben, für Tests ablesbar: none | fly | sit:<Platz>
 function report(){
  const ps=pets(),next=!ps.length?'none':ps.every(b=>b.mode==='sit')?'sit:'+(seatAt?.name||''):'fly';
  if(next!==state){state=next;cv.dataset.pets=next;}
 }

 // ---- Schwarm im Intro ----
 function leave(b){const a=-(.25+Math.random()*1.1)*(Math.random()<.8?1:2.4);b.mode='leave';b.dx=Math.cos(a);b.dy=Math.sin(a);}
 function begin(count){
  intro=true;first=true;VH=innerHeight;mount(VH);
  birds=[];sparks=[];hist=[];
  for(let i=0;i<count;i++){
   const a=Math.random()*Math.PI*2,R=Math.max(W,VH)*.75,mint=i===0;
   birds.push({x:W/2+Math.cos(a)*R,y:VH/2+Math.sin(a)*R,vx:0,vy:0,mode:'follow',mint,alpha:1,
    lag:mint?70:Math.random()*380,r:mint?.3:Math.sqrt(Math.random()),ang:Math.random()*6.28,spin:(Math.random()<.5?-1:1)*(1.2+Math.random()*2.6),
    size:mint?10:3.4+Math.random()*3,flap:Math.random()*6.28,rate:17+Math.random()*10});
  }
  spread={x:Math.max(70,W*.12),y:Math.max(60,VH*.13)};mode='circle';
  att={x:W/2,y:VH*.45};loop();
 }
 const newBird=(x,y,mint)=>({x,y,vx:0,vy:0,mode:'follow',mint,alpha:1,
  lag:mint?70:Math.random()*380,r:mint?.3:Math.sqrt(Math.random()),ang:Math.random()*6.28,spin:(Math.random()<.5?-1:1)*(1.2+Math.random()*2.6),
  size:mint?10:3.4+Math.random()*3,flap:Math.random()*6.28,rate:17+Math.random()*10});
 // Intro für Angemeldete: Es gibt zuerst nur den farbigen Vogel, er startet in `markEl` (dem Logo).
 function beginFrom(markEl){
  intro=true;first=true;VH=innerHeight;mount(VH);
  const m=rect(markEl);
  birds=[newBird(m.cx,m.cy,true)];sparks=[];hist=[];
  spread={x:34,y:16};mode='';att={x:m.cx,y:m.cy};loop();
 }
 // Der farbige Vogel fliegt an den Anfang der Zeichen in `list` und zieht darüber hinweg. Jedes überflogene
 // Zeichen verschwindet (Klasse `on` fällt weg) und wird zu Vögeln – am Ende sind es `count`.
 async function dissolve(list,count){
  const pos=list.map(el=>({el,...rect(el)})).sort((a,b)=>a.cx-b.cx);
  if(!pos.length)return true;
  const x0=Math.max(14,pos[0].l-24),x1=Math.max(...pos.map(p=>p.r))+50,h=Math.max(...pos.map(p=>p.b-p.t));
  const cy=pos.reduce((sum,p)=>sum+p.cy,0)/pos.length,from={...att};
  if(!await tween(520,p=>{const e=ease(p);att.x=lerp(from.x,x0,e);att.y=lerp(from.y,cy,e)-Math.sin(p*Math.PI)*h*.5;}))return false;
  let made=0,gone=0;
  const burst=c=>{
   c.el.classList.remove('on');gone++;
   for(const want=Math.round(count*gone/pos.length);made<want;made++){
    const b=newBird(c.cx+(Math.random()-.5)*(c.r-c.l),c.cy+(Math.random()-.5)*(c.b-c.t)*.6,false);
    b.vx=120+Math.random()*160;b.vy=-(40+Math.random()*160);birds.push(b);
   }
  };
  const ok=await tween(Math.max(520,(x1-x0)/.8),p=>{
   att.x=lerp(x0,x1,p);att.y=cy+Math.sin(p*Math.PI*2)*h*.14;
   for(const c of pos)if(!c.done&&c.cx<att.x-12){c.done=true;burst(c);}
  });
  for(const c of pos)if(!c.done){c.done=true;if(ok)burst(c);else c.el.classList.remove('on');}
  return ok;
 }
 // Schreibt die Zeichen in `list` (Elemente mit Klasse `intro-ch`), Zeile für Zeile. `speed`: px je ms.
 async function write(list,speed=.62){
  mode='';
  const pos=list.map(el=>({el,...rect(el)})),rows=[];
  for(const p of pos){const row=rows.find(r=>Math.abs(r.cy-p.cy)<(p.b-p.t)*.5);if(row)row.items.push(p);else rows.push({cy:p.cy,h:p.b-p.t,items:[p]});}
  for(const row of rows){
   const x0=Math.max(14,Math.min(...row.items.map(p=>p.l))-30),x1=Math.max(...row.items.map(p=>p.r))+70;
   const from={...att},s0={...spread},s1={x:34,y:Math.max(14,row.h*.42)};
   if(!await tween(first?480:700,p=>{const e=ease(p);att.x=lerp(from.x,x0,e);att.y=lerp(from.y,row.cy,e)-Math.sin(p*Math.PI)*row.h*.9;spread.x=lerp(s0.x,s1.x,e);spread.y=lerp(s0.y,s1.y,e);}))return false;
   // Warten, bis auch die Nachzügler am Zeilenanfang sind – sie sollen die Zeile von Anfang an begleiten.
   if(!first&&!await tween(430,p=>{att.x=x0+Math.sin(p*Math.PI*2)*6;att.y=row.cy+Math.cos(p*Math.PI*2)*row.h*.1;}))return false;
   first=false;
   if(!await tween(Math.max(650,(x1-x0)/speed),p=>{
    att.x=lerp(x0,x1,p);att.y=row.cy+Math.sin(p*Math.PI*3)*row.h*.14;
    for(const c of row.items)if(c.cx<att.x-28)c.el.classList.add('on');
   }))return false;
   row.items.forEach(c=>c.el.classList.add('on'));
  }
  return true;
 }
 // Der Schwarm fliegt davon, zwei bleiben in der Luft, der farbige Vogel fliegt zu `markEl`.
 // `onLand` läuft, wenn er dort ankommt. Liefert false, wenn vorher abgebrochen wurde.
 function release(markEl,onLand){
  const m=markEl?.getClientRects().length?rect(markEl):null;let mint=null,kept=0;
  mode='wander';spread={x:70,y:40};
  for(const b of birds){
   if(b.mint&&m){mint=b;b.mode='home';b.tx=m.cx;b.ty=m.cy;continue;}
   if(!b.mint&&kept<2){b.pet=true;b.lag=60+kept*90;b.r=.35;b.size=PET_SIZE;kept++;continue;}
   leave(b);
  }
  loop();
  return (async()=>{
   const end=clock+1700;
   while(mint&&Math.hypot(mint.x-m.cx,mint.y-m.cy)>12&&clock<end)if(!await wait(30))return false;
   if(!intro)return false;
   birds=birds.filter(b=>!b.mint);
   if(m)for(let i=0;i<12;i++){const a=i/12*6.28+Math.random()*.4,v=90+Math.random()*120;sparks.push({x:m.cx,y:m.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,life:1,c:i%2?col.line:col.mint});}
   onLand?.();loop();return true;
  })();
 }

 // ---- Sitzplätze: Oberkanten von Elementen der Startseite ----
 const shown=el=>el&&!el.hidden&&el.getClientRects().length?el:null;
 const PERCH=[
  // der Hauptknopf: für Gäste an der Satzkarte, für Angemeldete „Aufgaben starten“
  ['button',()=>{const el=shown(document.querySelector('#guest-card .guest-first'))||shown(document.getElementById('start-daily-session'));return el&&rect(el);},0],
  ['account',()=>{const el=shown(document.getElementById('account-button'));return el&&rect(el);},0],
  // der orange Trennstrich unter der Überschrift (ein ::after, deshalb aus dem Block berechnet)
  ['rule',()=>{const el=shown(document.querySelector('#home-view .intro'));if(!el||getComputedStyle(el,'::after').content==='none')return null;const r=rect(el);return {l:r.cx-28,r:r.cx+28,t:r.b-2};},0],
  // Angemeldete: der zweite orange Strich über „Wiederholen“
  ['rule2',()=>{const el=shown(document.querySelector('#home-view .home-daily'));if(!el||getComputedStyle(el,'::before').content==='none')return null;const r=rect(el);return {l:r.cx-28,r:r.cx+28,t:r.t};},0],
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
  const all=available();let pick=all.find(p=>p.name===prefer);
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
  const card=shown(document.getElementById('guest-card'))||shown(document.querySelector('#home-view .home-daily'));
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
   if(!flyTogether(null,true,true)){ps.forEach(leave);loop();}
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
  intro=false;mode='';
  const want=areaHeight();if(Math.abs(want-H)>40)size(want);
  if(!flyTogether('button',false)){pets().forEach(leave);loop();}
  watch();
 }
 // Intro übersprungen: Schwarm weg, die zwei sitzen sofort.
 function skip(){
  intro=false;mode='';
  tweens.splice(0).forEach(t=>t.resolve(false));
  birds=[0,1].map(newPet);sparks=[];hist=[];
  if(cv.isConnected)size(areaHeight());else mount(areaHeight());
  if(seat('button'))birds.forEach(b=>{b.x=b.tx;b.y=b.ty;});else birds=[];
  loop();watch();
 }
 // Gäste ohne Intro: Die zwei kommen angeflogen, sobald es einen Sitzplatz gibt.
 function startPets(){mount(areaHeight());watch();check();}

 return {begin,beginFrom,dissolve,wait,write,release,settle,skip,startPets};
}
