// Vanamo – Schwarm auf der Seite „Unterstützen“.
//
// Wie ein Starenschwarm (Murmuration): Die Punkte stehen für alle, die mit Vanamo lernen (eine feste
// Zahl, keine Zählung), die Vornamen sind die Menschen, die Vanamo möglich machen. Mitwirkende stehen
// in der Akzentfarbe. Frühere Unterstützer (Name nach 6 Monaten gelöscht) fliegen als dunklere Punkte mit,
// ebenso alle Namen über MAX_NAMES hinaus – sonst wird es unlesbar.
// Bewegt sich die Maus durch den Schwarm, weichen die Punkte sanft aus und kehren im Bogen zurück.
// Über einem Namen (am Handy: antippen) hält er an und wird etwas größer.
// Ohne Bewegungswunsch (prefers-reduced-motion) steht ein ruhiges Standbild da.

export const DOTS_WIDE=400,DOTS_NARROW=220;
export const MAX_NAMES_WIDE=70,MAX_NAMES_NARROW=28;
export const NARROW=560;

/** Vorname vereinheitlichen; null, wenn er nicht passt (2–20 Buchstaben, Leerzeichen/Bindestrich/Apostroph dazwischen). */
export function cleanName(raw){
 const n=String(raw??'').trim().replace(/\s+/g,' ');
 if(n.length<2||n.length>20)return null;
 return /^\p{L}+([ '’-]\p{L}+)*$/u.test(n)?n:null;
}
/** Welche Einträge als Name erscheinen: die neuesten max (die Liste ist alt → neu sortiert). */
export function shownNames(list,max){
 const names=Array.isArray(list)?list:[];
 const first=Math.max(0,names.length-max);
 return {shown:names.slice(first),older:first};
}
/** Wie viele Punkte bei dieser Breite fliegen. */
export function dotCount(width,former=0){
 return (width<NARROW?DOTS_NARROW:DOTS_WIDE)+Math.min(200,Math.max(0,former|0));
}

// Formen der Wolke: langsam gedehnt, gefaltet, mit Zipfel – wie im Starenvideo.
function shape(hx,hy,t){
 let x=hx*(1+.25*Math.sin(t*.17))+.2*Math.sin(hy*3.4+t*.5)*Math.sin(t*.13+.5);
 let y=hy*(1+.4*Math.sin(t*.21+1))+.26*Math.sin(hx*2.3+t*.4)*(.6+.4*Math.sin(t*.09))+.2*hx*hx*Math.sin(t*.15);
 const tail=Math.max(0,hx-.4);x+=tail*.7*(.5+.5*Math.sin(t*.19));y+=tail*tail*1.1*Math.sin(t*.27+2);
 const th=.3*Math.sin(t*.11),c=Math.cos(th),s=Math.sin(th);return [x*c-y*s,x*s+y*c];
}
function home(sx,sy){const r=Math.pow(Math.random(),.7),a=Math.random()*6.2832;return [Math.cos(a)*r*sx,Math.sin(a)*r*sy];}

export function createSwarm(canvas,{reducedMotion=false}={}){
 const ctx=canvas.getContext('2d');
 let W=0,H=0,t=0,raf=0,visible=true,cx=0,cy=0;
 let dots=[],names=[],former=0,col={ink:[23,44,56],accent:[101,71,139],orange:[255,147,92],bg:[250,247,240]};
 const mouse={x:-999,y:-999,px:-999,py:-999};let tapped=null,tapUntil=0;
 const FONT=()=>`500 ${W<NARROW?12:13}px Fraunces, Georgia, serif`;
 const FONT_BIG=()=>`700 ${W<NARROW?12:13}px Fraunces, Georgia, serif`;

 const probe=document.createElement('canvas').getContext('2d');
 function rgb(value,fallback){
  if(!value)return fallback;
  probe.fillStyle='#000';probe.fillStyle=value;const v=probe.fillStyle;
  if(v[0]==='#')return [1,3,5].map(i=>parseInt(v.slice(i,i+2),16));
  const m=v.match(/[\d.]+/g);return m?m.slice(0,3).map(Number):fallback;
 }
 function readColors(){
  const cs=getComputedStyle(canvas);
  col={ink:rgb(cs.getPropertyValue('--ink').trim(),col.ink),accent:rgb(cs.getPropertyValue('--heading-accent').trim(),col.accent),
   orange:rgb(cs.getPropertyValue('--orange').trim(),col.orange),bg:rgb(cs.getPropertyValue('--bg').trim(),col.bg)};
 }
 const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
 const mix=(a,b,k)=>a.map((v,i)=>Math.round(v+(b[i]-v)*k));

 function size(){
  const r=canvas.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);
  if(!r.width)return;
  const narrowBefore=W<NARROW;W=r.width;H=r.height;
  canvas.width=Math.round(W*d);canvas.height=Math.round(H*d);ctx.setTransform(d,0,0,d,0,0);
  if(!dots.length||narrowBefore!==(W<NARROW))makeDots();
  measure();
 }
 function makeDot(x,y){const [hx,hy]=home(.95,.42);return {hx,hy,x,y,vx:0,vy:0,k:.008+Math.random()*.014,ph:Math.random()*6.28,f:.5+Math.random(),z:Math.random(),sc:0,cool:0,fx:0,fy:0};}
 function makeDots(){
  const n=dotCount(W,former);const old=dots;dots=[];
  for(let i=0;i<n;i++){const o=old[i];dots.push(o||makeDot(W/2+(Math.random()-.5)*W*.4,H/2+(Math.random()-.5)*H*.4));}
  for(const d of dots)d.former=false;
  for(let i=0;i<Math.min(200,former);i++)dots[dots.length-1-i].former=true;
 }
 function makeName(entry,x,y){const [hx,hy]=home(.9,.4);return {text:entry.name,contributor:!!entry.contributor,w:0,hx,hy,x,y,vx:0,vy:0,k:.006+Math.random()*.006,ph:Math.random()*6.28,f:.4+Math.random()*.6,fresh:0,hold:0};}
 function measure(){ctx.font=FONT();for(const n of names)n.w=ctx.measureText(n.text).width;}

 function setData({names:list=[],former:f=0}={},{freshName=''}={}){
  former=Math.max(0,f|0);makeDots();
  const old=new Map(names.map(n=>[n.text+'|'+n.contributor,n]));
  names=list.map(e=>{const k=e.name+'|'+!!e.contributor,o=old.get(k);if(o){old.delete(k);return o;}
   return makeName(e,W/2+(Math.random()-.5)*W*.5,H/2+(Math.random()-.5)*H*.5);});
  if(freshName){for(let i=names.length-1;i>=0;i--){if(names[i].text===freshName){const n=names[i];n.fresh=1;n.x=W+40;n.y=H*.4;n.vx=-1.6;n.vy=0;break;}}}
  measure();
  if(reducedMotion)settle();
 }

 function step(){
  t+=1/60;
  cx=W/2+W*.1*Math.sin(t*.07);cy=H/2+H*.05*Math.sin(t*.13);
  const moving=!reducedMotion&&mouse.x>-900&&Math.hypot(mouse.x-mouse.px,mouse.y-mouse.py)>.5;
  const spread=W<NARROW?.4:.34;
  for(const p of dots){
   const [rx,ry]=shape(p.hx,p.hy,t);const tx=cx+rx*W*spread+Math.sin(t*p.f+p.ph)*1.5,ty=cy+ry*H*.82+Math.cos(t*p.f*1.3+p.ph);
   if(moving&&p.cool<=0){const mx=p.x-mouse.x,my=p.y-mouse.y,md=Math.hypot(mx,my);
    if(md<45&&md>.1){const a=Math.atan2(my,mx)+(Math.random()-.5)*.9,f=.07+Math.random()*.05;p.fx=Math.cos(a)*f;p.fy=Math.sin(a)*f;p.sc=1;p.cool=2.5;}}
   if(p.cool>0)p.cool-=1/60;
   if(p.sc>0){const e=p.sc*p.sc;p.vx+=p.fx*e*(1-e)*4+p.fx*e*.6;p.vy+=p.fy*e*(1-e)*4+p.fy*e*.6;p.sc=Math.max(0,p.sc-1/80);}
   const kk=p.k*(1-.8*p.sc),dmp=.9+.05*p.sc;p.vx=(p.vx+(tx-p.x)*kk)*dmp;p.vy=(p.vy+(ty-p.y)*kk)*dmp;p.x+=p.vx;p.y+=p.vy;
  }
  const max=W<NARROW?MAX_NAMES_NARROW:MAX_NAMES_WIDE,{older}=shownNames(names,max);
  const shown=names.slice(older);
  const hov=hovered(shown);
  for(let i=0;i<shown.length;i++){const a=shown[i];for(let j=i+1;j<shown.length;j++){const b=shown[j],dx=b.x-a.x,dy=b.y-a.y,ox=(a.w+b.w)/2+8-Math.abs(dx),oy=17-Math.abs(dy);
   if(ox>0&&oy>0){if(oy<ox){const s=(dy>=0?1:-1)*oy*.04;if(a!==hov)a.vy-=s;if(b!==hov)b.vy+=s;}else{const s=(dx>=0?1:-1)*ox*.02;if(a!==hov)a.vx-=s;if(b!==hov)b.vx+=s;}}}}
  const sp=Math.min(1.25,.85+shown.length/180)*(W<NARROW?1.1:1);
  names.forEach((n,i)=>{
   const [rx,ry]=shape(n.hx,n.hy,t);const tx=cx+rx*W*.36*sp+Math.sin(t*n.f+n.ph)*3,ty=cy+ry*H*.85+Math.cos(t*n.f*1.2+n.ph)*2;
   n.hold+=((n===hov?1:0)-n.hold)*.12;
   const fr=n.fresh,kk=n.k*(1-.7*fr)*(1-n.hold),dmp=(.9+.06*fr)*(1-.6*n.hold);
   n.vx=(n.vx+(tx-n.x)*kk)*dmp;n.vy=(n.vy+(ty-n.y)*kk)*dmp;
   if(i>=older){if(n.y<14)n.vy+=.3;if(n.y>H-14)n.vy-=.3;if(n.x<n.w/2+6)n.vx+=.6;if(n.x>W-n.w/2-6)n.vx-=.6;}
   n.x+=n.vx;n.y+=n.vy;
   if(n.fresh>0)n.fresh=Math.max(0,n.fresh-1/420);
  });
  return {older,shown,hov};
 }
 function hovered(shown){
  if(tapped&&performance.now()<tapUntil&&shown.includes(tapped))return tapped;
  tapped=null;
  if(mouse.x<-900)return null;
  for(let i=shown.length-1;i>=0;i--){const n=shown[i];if(Math.abs(mouse.x-n.x)<n.w/2+4&&Math.abs(mouse.y-n.y)<10)return n;}
  return null;
 }
 function draw({older,shown,hov}){
  ctx.clearRect(0,0,W,H);
  const big=new Path2D(),small=new Path2D(),dark=new Path2D();
  for(const p of dots){const z=1+p.z*.7;(p.former?dark:p.z>.45?big:small).rect(p.x-z/2,p.y-z/2,z,z);}
  for(let i=0;i<older;i++){const n=names[i];dark.rect(n.x-1.1,n.y-1.1,2.2,2.2);}
  ctx.fillStyle=rgba(col.ink,.32);ctx.fill(big);ctx.fillStyle=rgba(col.ink,.24);ctx.fill(small);ctx.fillStyle=rgba(col.ink,.6);ctx.fill(dark);
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=FONT();
  for(const n of shown){
   if(n===hov&&n.hold>.05)continue;
   const base=n.contributor?col.accent:col.ink;
   ctx.fillStyle=n.fresh>0?rgba(mix(base,col.orange,n.fresh*.75),.9):rgba(base,n.contributor?.88:.74);
   ctx.fillText(n.text,n.x,n.y);
  }
  if(hov&&hov.hold>.05){const s=1+.4*hov.hold;ctx.save();ctx.translate(hov.x,hov.y);ctx.scale(s,s);
   ctx.fillStyle=rgba(col.bg,.9);ctx.fillRect(-hov.w/2-6,-10,hov.w+12,20);
   ctx.font=FONT_BIG();ctx.fillStyle=rgba(hov.contributor?col.accent:col.ink,1);ctx.fillText(hov.text,0,1);ctx.restore();}
  mouse.px=mouse.x;mouse.py=mouse.y;
 }
 function frame(){raf=0;if(!visible||document.hidden)return;draw(step());raf=requestAnimationFrame(frame);}
 function settle(){for(const n of names)n.fresh=0;let s;for(let i=0;i<360;i++)s=step();draw(s);}
 function run(){if(reducedMotion){settle();return;}if(!raf&&visible&&!document.hidden)raf=requestAnimationFrame(frame);}

 const local=e=>{const r=canvas.getBoundingClientRect();return [e.clientX-r.left,e.clientY-r.top];};
 canvas.addEventListener('pointermove',e=>{[mouse.x,mouse.y]=local(e);});
 canvas.addEventListener('pointerleave',()=>{mouse.x=mouse.px=-999;mouse.y=mouse.py=-999;});
 canvas.addEventListener('pointerdown',e=>{
  const [x,y]=local(e);const max=W<NARROW?MAX_NAMES_NARROW:MAX_NAMES_WIDE,{older}=shownNames(names,max);
  for(let i=names.length-1;i>=older;i--){const n=names[i];if(Math.abs(x-n.x)<n.w/2+8&&Math.abs(y-n.y)<14){tapped=n;tapUntil=performance.now()+2500;if(reducedMotion)draw({older,shown:names.slice(older),hov:n});return;}}
 });

 readColors();size();
 const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(()=>{size();if(reducedMotion)settle();}):null;ro?.observe(canvas);
 const io=typeof IntersectionObserver!=='undefined'?new IntersectionObserver(es=>{visible=es.some(e=>e.isIntersecting);run();}):null;io?.observe(canvas);
 document.addEventListener('visibilitychange',run);
 new MutationObserver(()=>{readColors();if(reducedMotion)settle();}).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
 document.fonts?.ready.then(()=>{measure();if(reducedMotion)settle();});
 run();
 return {setData,get names(){return names.map(n=>n.text);},get dots(){return dots.length;}};
}
