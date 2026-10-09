// Vanamo – Zeichenwerk des Intro-Schwarms: Vögel UND Buchstaben auf einer Zeichenfläche.
//
// Läuft bevorzugt in einem eigenen Thread (intro-flock-worker.mjs, OffscreenCanvas): Dann kann die Seite
// im Hauptthread Sätze verarbeiten, rechnen und zeichnen, ohne dass der Schwarm ruckelt. Ohne Worker läuft
// dasselbe Werk im Hauptthread (intro-birds.mjs, createIntroFlock).
//
// Die Buchstaben sind fertig gerenderte Bildchen (scharf + unscharf), die intro-birds.mjs vorher aus den echten
// Buchstaben der Seite erzeugt. Erscheinen und Verschwinden werden wie die CSS-Übergänge von `.intro-ch`
// nachgezeichnet: Deckkraft, kleine Bewegung, Unschärfe (Überblendung unscharf → scharf).
//
// Nachrichten an das Werk (handle):
//   init{canvas,w,h,dpr,col,sy}, colors{col}, begin{count,vh}, beginFrom{mark,loose,vh}, glyphs{list},
//   run{id,op,args} mit op = wait | write | dissolve | release, drop{ids}, pets{}, stop{}
// Nachrichten vom Werk (post):
//   ready{}, done{id,ok}, lit{ids,at}, unlit{ids}, shown{ids}, pets{list}

const PET_SIZE=7.5;
const lerp=(a,b,p)=>a+(b-a)*p,ease=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2;
const now=()=>performance.timeOrigin+performance.now(); // gemeinsame Zeitbasis mit dem Hauptthread

// CSS-Zeitkurven (cubic-bezier) als Funktion von 0…1
function bezier(x1,y1,x2,y2){
 const cx=3*x1,bx=3*(x2-x1)-cx,ax=1-cx-bx,cy=3*y1,by=3*(y2-y1)-cy,ay=1-cy-by;
 const X=t=>((ax*t+bx)*t+cx)*t,Y=t=>((ay*t+by)*t+cy)*t,dX=t=>(3*ax*t+2*bx)*t+cx;
 return p=>{
  if(p<=0)return 0;if(p>=1)return 1;
  let t=p;for(let i=0;i<6;i++){const d=dX(t);if(Math.abs(d)<1e-6)break;t-=(X(t)-p)/d;}
  t=Math.max(0,Math.min(1,t));return Y(t);
 };
}
const cssEase=bezier(.25,.1,.25,1),rise=bezier(.2,.7,.2,1);
// Zeitkurven je Art (style.css): w = Buchstabe erscheint (.intro-ch), g = Begrüßung löst sich auf (.intro-greet .intro-ch)
const LOOK={
 w:{op:400,move:500,blur:400},
 g:{op:550,move:700,blur:550}
};

export function createFlock(post){
 let cv=null,ctx=null,W=0,H=0,VH=0,dpr=1,sy=0;
 let birds=[],sparks=[],hist=[],tweens=[],att={x:0,y:0},spread={x:60,y:60},tight={x:34,y:14,k:.42},absorb=false;
 let col={ink:'#172c38',mint:'#ace0d4',line:'#172c38'};
 let raf=0,last=0,clock=0,mode='',first=true,stopped=false;
 const glyphs=new Map(),blurs=new Map();let litQ=[],unlitQ=[],shownQ=[];
 const raff=typeof requestAnimationFrame==='function'?requestAnimationFrame:(fn=>setTimeout(()=>fn(performance.now()),16));

 function size(w,h){
  W=w;H=Math.round(h);
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
 }
 function tween(ms,fn){return new Promise(resolve=>{tweens.push({start:clock,ms,fn,resolve});loop();});}
 const wait=ms=>tween(ms,()=>{});
 function loop(){if(!raf&&!stopped&&ctx){last=performance.now();raf=raff(frame);}}

 // ---- Zeichnen: Vögel ----
 function drawBird(b){
  const f=.3+.7*Math.sin(b.flap),w=b.size,h=b.size*.8*f;
  const tilt=Math.max(-.55,Math.min(.55,Math.atan2(b.vy,Math.abs(b.vx)+80)))*(b.vx<0?-1:1);
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(tilt);ctx.globalAlpha=Math.max(0,Math.min(1,b.alpha));
  ctx.beginPath();ctx.moveTo(-w,-h);ctx.quadraticCurveTo(-w*.45,-h*.5-w*.3,0,0);ctx.quadraticCurveTo(w*.45,-h*.5-w*.3,w,-h);
  if(b.mint){ctx.lineWidth=5.4;ctx.strokeStyle=col.line;ctx.stroke();ctx.lineWidth=2.6;ctx.strokeStyle=col.mint;ctx.stroke();}
  else{ctx.lineWidth=1.5;ctx.strokeStyle=col.ink;ctx.stroke();}
  ctx.restore();
 }

 // ---- Zeichnen: Buchstaben ----
 // g.on: sichtbar (Ziel), g.t0: Zeitpunkt des letzten Wechsels (Uhr des Werks), g.k: Art (w|g)
 function glyphState(g){
  const L=LOOK[g.k],e=g.t0==null?1e9:clock-g.t0;
  const pm=rise(Math.min(1,e/L.move));
  if(g.on){
   const op=cssEase(Math.min(1,e/L.op)),bl=1-cssEase(Math.min(1,e/L.blur));
   return g.k==='g'?{op,bl,dy:-.3*g.em*(1-pm),sc:.6+.4*pm}:{op,bl,dy:.18*g.em*(1-pm),sc:1};
  }
  const op=1-cssEase(Math.min(1,e/L.op)),bl=cssEase(Math.min(1,e/L.blur));
  return g.k==='g'?{op,bl,dy:-.3*g.em*pm,sc:1-.4*pm}:{op,bl,dy:.18*g.em*pm,sc:1};
 }
 function drawGlyph(g){
  const s=glyphState(g);
  if(s.op<=.002)return false;
  const moving=g.t0!=null&&clock-g.t0<LOOK[g.k].move+20;
  ctx.save();
  ctx.translate(g.cx,g.cy+s.dy);if(s.sc!==1)ctx.scale(s.sc,s.sc);ctx.translate(-g.cx,-g.cy);
  // Überblenden: Zwei halb durchsichtige Bilder übereinander wirken heller als eins – die Unschärfe deckt deshalb etwas mehr.
  if(s.bl>.001&&g.blur){ctx.globalAlpha=s.op*Math.sqrt(s.bl);ctx.drawImage(g.blur,g.bx,g.by,g.bw,g.bh);}
  if(s.bl<.999){ctx.globalAlpha=s.op*(1-s.bl);ctx.drawImage(g.sharp,g.sx,g.sy,g.sw,g.sh);}
  ctx.restore();
  return moving;
 }

 // ---- Ein Bild ----
 const histAt=t=>{for(let i=hist.length-1;i>=0;i--)if(hist[i].t<=t)return hist[i];return hist[0]||att;};
 function lit(c){const g=glyphs.get(c.id);if(g&&!g.on){g.on=true;g.t0=clock;}litQ.push(c.id);}
 function unlit(c){const g=glyphs.get(c.id);if(g&&g.on){g.on=false;g.t0=clock;}unlitQ.push(c.id);}
 function frame(t){
  raf=0;if(stopped)return;
  const dt=Math.min((t-last)/1000,.05);last=t;clock+=dt*1000;
  for(const tw of [...tweens]){
   const p=tw.ms<=0?1:Math.min(1,(clock-tw.start)/tw.ms);tw.fn(p);
   if(p>=1){const i=tweens.indexOf(tw);if(i>=0)tweens.splice(i,1);tw.resolve(true);}
  }
  const s=clock/1000;
  if(mode==='circle'){att.x=W/2+Math.cos(s*1.7)*W*.2;att.y=VH*.45+Math.sin(s*2.6)*VH*.15;}
  else if(mode==='wander'){att.x=W/2+Math.cos(s*1.3)*W*.18;att.y=VH*.3+Math.sin(s*2.1)*VH*.09;}
  hist.push({t:clock,x:att.x,y:att.y});while(hist.length>2&&clock-hist[0].t>700)hist.shift();
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);ctx.globalAlpha=1;
  // Buchstaben liegen unter den Vögeln (wie vorher die Seite unter der Zeichenfläche)
  let busy=false;
  for(const g of glyphs.values()){if(g.drawn===false){g.drawn=true;shownQ.push(g.id);}if(drawGlyph(g))busy=true;}
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const b of birds){
   let ax,ay;
   if(b.mode==='leave'){ax=b.dx*1100;ay=b.dy*1100;b.alpha-=dt/1.2;}
   else{
    let tx,ty,k,c;
    if(b.mode==='home'){tx=b.tx;ty=b.ty;k=11;c=4.6;}
    // in den Buchstaben fliegen: zügig, ohne Überschwingen; kurz vor dem Ziel verblasst der Vogel
    else if(b.mode==='land'){tx=b.tx;ty=b.ty;k=150;c=23;}
    else{const p=histAt(clock-b.lag);b.ang+=b.spin*dt;tx=p.x+Math.cos(b.ang)*b.r*spread.x;ty=p.y+Math.sin(b.ang)*b.r*spread.y;k=38;c=8.5;}
    ax=(tx-b.x)*k-b.vx*c;ay=(ty-b.y)*k-b.vy*c;
   }
   ax+=(Math.random()-.5)*300;ay+=(Math.random()-.5)*300;
   b.vx+=ax*dt;b.vy+=ay*dt;
   const sp=Math.hypot(b.vx,b.vy);if(sp>1200){b.vx*=1200/sp;b.vy*=1200/sp;}
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.flap+=b.rate*dt;
   if(b.mode==='land'){
    const d=Math.hypot(b.tx-b.x,b.ty-b.y);b.alpha=Math.min(1,d/16);
    if(d<5||clock-b.t0>520){b.dead=true;lit(b.ch);continue;}
   }
   drawBird(b);
  }
  birds=birds.filter(b=>!b.dead&&(b.mode!=='leave'||(b.alpha>0&&b.x>-40&&b.x<W+40&&b.y>sy-40&&b.y<H+40)));
  for(const p of sparks){
   p.life-=dt/.6;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=260*dt;
   ctx.globalAlpha=Math.max(0,p.life);ctx.strokeStyle=p.c;ctx.lineWidth=2.2;
   ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();
  }
  ctx.globalAlpha=1;sparks=sparks.filter(p=>p.life>0);
  if(litQ.length){post({t:'lit',ids:litQ,at:now()});litQ=[];}
  if(unlitQ.length){post({t:'unlit',ids:unlitQ});unlitQ=[];}
  if(shownQ.length){post({t:'shown',ids:shownQ});shownQ=[];}
  if(tweens.length||sparks.length||birds.length||busy)loop();
 }

 // ---- Schwarm ----
 const newBird=(x,y,mint)=>({x,y,vx:0,vy:0,mode:'follow',mint,alpha:1,
  lag:mint?70:Math.random()*380,r:mint?.3:Math.sqrt(Math.random()),ang:Math.random()*6.28,spin:(Math.random()<.5?-1:1)*(1.2+Math.random()*2.6),
  size:mint?10:3.4+Math.random()*3,flap:Math.random()*6.28,rate:17+Math.random()*10});
 function leave(b){const a=-(.25+Math.random()*1.1)*(Math.random()<.8?1:2.4);b.mode='leave';b.dx=Math.cos(a);b.dy=Math.sin(a);}
 // Gäste: der Schwarm kreist in der Bildmitte
 function begin(count,vh){
  first=true;VH=vh;birds=[];sparks=[];hist=[];
  for(let i=0;i<count;i++){
   const a=Math.random()*Math.PI*2,R=Math.max(W,VH)*.75,b=newBird(W/2+Math.cos(a)*R,VH/2+Math.sin(a)*R,i===0);
   birds.push(b);
  }
  spread={x:Math.max(70,W*.12),y:Math.max(60,VH*.13)};tight={x:34,y:14,k:.42};absorb=false;mode='circle';
  att={x:W/2,y:VH*.45};loop();
 }
 // Angemeldete: zuerst nur der farbige Vogel, er startet im Logo (`m`: Mittelpunkt)
 function beginFrom(m,loose,vh){
  first=false;VH=vh;
  birds=[newBird(m.cx,m.cy,true)];sparks=[];hist=[];
  spread={x:loose?.x??34,y:loose?.y??16};tight={x:loose?.tx??34,y:loose?.ty??14,k:loose?.tk??.42};absorb=!!loose?.absorb;mode='';att={x:m.cx,y:m.cy};loop();
 }
 const boxes=ids=>ids.map(id=>glyphs.get(id)).filter(Boolean).map(g=>({id:g.id,l:g.l,r:g.r,t:g.t,b:g.b,cx:(g.l+g.r)/2,cy:(g.t+g.b)/2}));
 // Der farbige Vogel fliegt an den Anfang der Zeichen und zieht darüber hinweg. Jedes überflogene Zeichen
 // verschwindet und wird zu Vögeln – am Ende sind es `count`.
 async function dissolve(ids,count,flyMs=520,speed=.8){
  const pos=boxes(ids).sort((a,b)=>a.cx-b.cx);
  if(!pos.length)return true;
  const x0=Math.max(14,pos[0].l-24),x1=Math.max(...pos.map(p=>p.r))+50,h=Math.max(...pos.map(p=>p.b-p.t));
  const cy=pos.reduce((sum,p)=>sum+p.cy,0)/pos.length,from={...att};
  if(!await tween(flyMs,p=>{const e=ease(p);att.x=lerp(from.x,x0,e);att.y=lerp(from.y,cy,e)-Math.sin(p*Math.PI)*h*.5;}))return false;
  let made=0,gone=0;
  const burst=c=>{
   unlit(c);gone++;
   for(const want=Math.round(count*gone/pos.length);made<want;made++){
    const b=newBird(c.cx+(Math.random()-.5)*(c.r-c.l),c.cy+(Math.random()-.5)*(c.b-c.t)*.6,false);
    b.vx=40+Math.random()*90;b.vy=-(20+Math.random()*90);birds.push(b);
   }
  };
  const ok=await tween(Math.max(520,(x1-x0)/speed),p=>{
   att.x=lerp(x0,x1,p);att.y=cy+Math.sin(p*Math.PI*2)*h*.14;
   for(const c of pos)if(!c.done&&c.cx<att.x-12){c.done=true;burst(c);}
  });
  for(const c of pos)if(!c.done){c.done=true;if(ok)burst(c);else unlit(c);}
  return ok;
 }
 // Schreibt die Zeichen, Zeile für Zeile. `speed`: px je ms.
 async function write(ids,speed=.62){
  mode='';
  const pos=boxes(ids),rows=[];
  for(const p of pos){const row=rows.find(r=>Math.abs(r.cy-p.cy)<(p.b-p.t)*.5);if(row)row.items.push(p);else rows.push({cy:p.cy,h:p.b-p.t,items:[p]});}
  // Im Intro für Angemeldete erschafft der Schwarm den Satz: Für jeden Buchstaben lösen sich die nächsten Vögel,
  // fliegen hinein und gehen darin auf – der Buchstabe erscheint, wenn der erste ankommt. Der Schwarm wird dabei
  // kleiner; übrig bleiben der farbige Vogel, die zwei Schwalben und ein paar, die am Ende davonfliegen.
  const total=pos.length;let used=0,seen=0;
  const pool=absorb?Math.max(0,birds.filter(b=>!b.mint&&b.mode==='follow').length-(birds.length>60?9:5)):0;
  const give=c=>{
   seen++;const want=Math.round(pool*seen/total)-used;if(want<=0)return false;
   const free=birds.filter(b=>!b.mint&&b.mode==='follow').map(b=>({b,d:Math.hypot(b.x-c.cx,b.y-c.cy)})).sort((a,z)=>a.d-z.d).slice(0,want);
   for(const {b} of free){b.mode='land';b.t0=clock;b.ch=c;b.tx=lerp(c.l,c.r,.25+Math.random()*.5);b.ty=lerp(c.t,c.b,.3+Math.random()*.45);}
   used+=free.length;return free.length>0;
  };
  for(const row of rows){
   const x0=Math.max(14,Math.min(...row.items.map(p=>p.l))-30),x1=Math.max(...row.items.map(p=>p.r))+70;
   const from={...att},s0={...spread},s1={x:tight.x,y:Math.max(tight.y,row.h*tight.k)};
   if(first){
    if(!await tween(480,p=>{const e=ease(p);att.x=lerp(from.x,x0,e);att.y=lerp(from.y,row.cy,e)-Math.sin(p*Math.PI)*row.h*.9;spread.x=lerp(s0.x,s1.x,e);spread.y=lerp(s0.y,s1.y,e);}))return false;
   }else{
    // Von Zeile zu Zeile in einem Bogen, ohne anzuhalten: Der Schwarm fliegt in seiner Richtung weiter, zieht nach
    // oben weg, kommt in einer Schleife zurück und geht von links oben in die neue Zeile über – am Anfang und am
    // Ende so schnell, wie er schreibt, dazwischen etwas schneller. So kommen auch die Nachzügler rechtzeitig an.
    const L=Math.hypot(x0-from.x,row.cy-from.y),ms=absorb?Math.max(900,L*2.3+400):Math.max(800,L*1.2+330),reach=speed*ms/3; // Gäste: zügiger und flacher
    const room=(Math.min(from.y,row.cy)-sy-28)/.75,A=Math.max(row.h*.6,Math.min(reach*(absorb?.83:.6),room)),k=Math.min(260,Math.sqrt(Math.max(reach*reach-A*A,3600)));
    const lower=row.cy-from.y>row.h*1.5; // neue Zeile liegt deutlich tiefer: am Anfang nur leicht ansteigen
    const p1={x:from.x+k,y:from.y-A*(lower?.3:1)},p2={x:x0-k,y:row.cy-A};
    if(!await tween(ms,p=>{
     const q=1-p,a=q*q*q,b=3*q*q*p,c=3*q*p*p,d=p*p*p,e=ease(p);
     att.x=a*from.x+b*p1.x+c*p2.x+d*x0;att.y=a*from.y+b*p1.y+c*p2.y+d*row.cy;
     spread.x=lerp(s0.x,s1.x,e);spread.y=lerp(s0.y,s1.y,e);
    }))return false;
   }
   first=false;
   if(!await tween(Math.max(650,(x1-x0)/speed),p=>{
    att.x=lerp(x0,x1,p);att.y=row.cy+Math.sin(p*Math.PI*3)*row.h*.14;
    for(const c of row.items){
     if(pool){if(!c.given&&c.cx<att.x+6){c.given=true;c.wait=give(c);}if(c.wait&&c.cx>att.x-170)continue;}
     if(c.cx<att.x-28&&!c.on){c.on=true;lit(c);}
    }
   }))return false;
   row.items.forEach(c=>{if(!c.on){c.on=true;lit(c);}});
  }
  return true;
 }
 // Der Schwarm fliegt davon, zwei bleiben in der Luft, der farbige Vogel fliegt zu `m` (Mittelpunkt des Logos).
 // Fertig, wenn er dort ankommt (dann sprühen ein paar Funken).
 async function release(m){
  let mint=null,kept=0;
  mode='wander';spread={x:70,y:40};
  for(const b of birds){
   if(b.mint&&m){mint=b;b.mode='home';b.tx=m.cx;b.ty=m.cy;continue;}
   if(!b.mint&&kept<2&&b.mode==='follow'){b.pet=true;b.lag=60+kept*90;b.r=.35;b.size=PET_SIZE;kept++;continue;}
   leave(b);
  }
  loop();
  const end=clock+1700;
  while(mint&&Math.hypot(mint.x-m.cx,mint.y-m.cy)>12&&clock<end)if(!await wait(30))return false;
  birds=birds.filter(b=>!b.mint);
  if(m)for(let i=0;i<12;i++){const a=i/12*6.28+Math.random()*.4,v=90+Math.random()*120;sparks.push({x:m.cx,y:m.cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-60,life:1,c:i%2?col.line:col.mint});}
  loop();return true;
 }

 const ops={wait,write,dissolve,release};
 function handle(msg){
  switch(msg.t){
   case 'init':
    cv=msg.canvas;ctx=cv.getContext('2d');dpr=msg.dpr;sy=msg.sy||0;if(msg.col)col=msg.col;size(msg.w,msg.h);post({t:'ready'});break;
   case 'colors':col=msg.col;loop();break;
   case 'size':size(msg.w,msg.h);loop();break;
   case 'begin':begin(msg.count,msg.vh);break;
   case 'beginFrom':beginFrom(msg.mark,msg.loose,msg.vh);break;
   case 'glyphs':
    // Unscharfe Bildchen werden geteilt (gleiche Buchstaben, gleiche Schrift), scharfe gehören je einem Buchstaben.
    for(const b of msg.blurs||[])blurs.set(b.key,b);
    for(const g of msg.list){
     const B=blurs.get(g.bk);
     glyphs.set(g.id,{...g,drawn:false,t0:null,blur:B?.bmp,bx:B?g.gx+B.ox:0,by:B?g.gy+B.oy:0,bw:B?.w,bh:B?.h});
    }
    loop();break;
   case 'drop':for(const id of msg.ids){glyphs.get(id)?.sharp?.close?.();glyphs.delete(id);}loop();break;
   case 'run':{
    const fn=ops[msg.op];
    Promise.resolve(fn?fn(...(msg.args||[])):false).then(ok=>post({t:'done',id:msg.id,ok:!!ok&&!stopped}));
    break;
   }
   case 'pets':{
    // Übergabe der zwei Schwalben an die Seite: Zustand melden und hier nicht mehr zeichnen.
    const list=birds.filter(b=>b.pet).map(b=>({x:b.x,y:b.y,vx:b.vx,vy:b.vy,flap:b.flap}));
    birds=birds.filter(b=>!b.pet);loop();
    post({t:'pets',list});break;
   }
   case 'stop':
    stopped=true;tweens.splice(0).forEach(t=>t.resolve(false));
    for(const g of glyphs.values())g.sharp?.close?.();
    for(const b of blurs.values())b.bmp?.close?.();
    glyphs.clear();blurs.clear();birds=[];break;
  }
 }
 return {handle};
}
