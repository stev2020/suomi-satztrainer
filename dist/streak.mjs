// Vanamo – Animation für die Tagesserie (Angemeldete).
// Kommt einmal am Tag: beim ersten abgeschlossenen Block (Wiederholen, Übung, neue Sätze), auf dem Abschlussbildschirm.
// Ablauf (gut 4 s, ein Klick spult vor): Der Schwarm fliegt herein und schwenkt in eine Kreisbahn um die Bildmitte,
// der goldene Vogel vorneweg. In der ersten Runde entsteht hinter ihm die Zahl der Serie (wie von einem Uhrzeiger
// aufgedeckt), in der zweiten zieht der Schwarm ab. Dann schießt der goldene Vogel nach oben in die Pille
// „heute geübt" und zerplatzt dort; die Pille zeigt gut eine Sekunde die Serie in Gold und wird wieder normal.
// Bei „Bewegung reduzieren" wird nur die Pille kurz gold. Farben: --gold, --gold-hi, --gold-deep je Farbschema (style.css).
import {t} from './i18n.mjs?v=24';
import {practiceStreak,weekActivity} from './home-extras.mjs?v=11';

const KEY='vanamo-streak-day';
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const escape=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dayKey=d=>d.toLocaleDateString('sv-SE');
// „Tage in Folge" ohne Zahl – aus den vorhandenen Texten, damit die Übersetzung mitkommt.
const streakLabel=n=>(n===1?t('1 Tag in Folge').replace(/1\s*/,''):t('{0} Tage in Folge','')).trim();

/** Zeigt die Animation, wenn heute geübt wurde und sie heute noch nicht kam. Gibt true zurück, wenn sie startet. */
export function celebrateStreak(daily={},{date=new Date(),force=false,delay=200}={}){
 try{
  const today=dayKey(date),streak=practiceStreak(daily,date);
  const pill=document.querySelector('header>.today.is-account');
  if(!pill||!(Number(daily[today])>0)||!streak)return false;
  if(!force){
   if(navigator.webdriver||localStorage.getItem(KEY)===today)return false;
   localStorage.setItem(KEY,today);
  }
  setTimeout(()=>playStreak(streak,pill,{label:streakLabel(streak),week:weekActivity(daily,date)}).catch(()=>{}),delay);
  return true;
 }catch{return false;}
}

const html=document.documentElement;
const lerp=(a,b,p)=>a+(b-a)*p,ease=p=>p<.5?2*p*p:1-Math.pow(-2*p+2,2)/2,easeOut=p=>1-Math.pow(1-p,3);

// Glatte Bahn durch Punkte (Catmull-Rom), gleichmäßig nach Weglänge abgetastet
function makePath(pts){
 const P=pts.map(p=>({x:p[0],y:p[1]})),out=[];
 const cr=(a,b,c,d,t)=>.5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t);
 for(let i=0;i<P.length-1;i++){
  const a=P[Math.max(0,i-1)],b=P[i],c=P[i+1],d=P[Math.min(P.length-1,i+2)];
  for(let k=0;k<24;k++){const t=k/24;out.push({x:cr(a.x,b.x,c.x,d.x,t),y:cr(a.y,b.y,c.y,d.y,t)});}
 }
 out.push(P[P.length-1]);
 const acc=[0];for(let i=1;i<out.length;i++)acc.push(acc[i-1]+Math.hypot(out[i].x-out[i-1].x,out[i].y-out[i-1].y));
 const len=acc[acc.length-1]||1;
 return {len,at(p){const s=Math.max(0,Math.min(1,p))*len;let i=1;while(i<acc.length-1&&acc[i]<s)i++;const q=(s-acc[i-1])/((acc[i]-acc[i-1])||1);return {x:lerp(out[i-1].x,out[i].x,q),y:lerp(out[i-1].y,out[i].y,q)};}};
}

let running=null;
async function playStreak(streak,pill,{label,week}){
 if(running)running.stop();
 if(reducedMotion()){await goldPill(pill,streak,label,ms=>new Promise(r=>setTimeout(r,ms)));return;}
 if(pill.getBoundingClientRect().top<0)scrollTo({top:0,behavior:'smooth'});
 try{await document.fonts.load("600 100px Fraunces");}catch{}
 const cs=getComputedStyle(html),v=n=>cs.getPropertyValue(n).trim();
 const col={ink:v('--ink'),gold:v('--gold'),hi:v('--gold-hi'),deep:v('--gold-deep')};
 const dark=html.getAttribute('data-theme-mode')==='dark';
 const W=html.clientWidth,H=innerHeight,dpr=Math.min(devicePixelRatio||1,2),small=W<700;

 const veil=document.createElement('div');veil.className='streak-veil';
 const cv=document.createElement('canvas');cv.className='streak-canvas';cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
 const cap=document.createElement('div');cap.className='streak-caption';
 veil.setAttribute('aria-hidden','true');cv.setAttribute('aria-hidden','true');cap.setAttribute('data-no-i18n','');cap.setAttribute('role','status');
 const wd=week.findIndex(d=>d.today);
 cap.innerHTML=`<p><span class="sr-only">${streak} </span>${escape(label)}</p><ol aria-hidden="true">${week.map(d=>`<li class="${d.count&&!d.today?'done':''}">${escape(d.short)}</li>`).join('')}</ol>`;
 document.body.append(veil,cap,cv);
 const ctx=cv.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineCap='round';ctx.lineJoin='round';

 // ---- Zahl ausmessen ----
 const text=String(streak),fs=Math.round(Math.min(H*.24,W*(text.length>2?.26:.32),180)),font=`600 ${fs}px Fraunces, Georgia, serif`;
 ctx.font=font;
 const total=ctx.measureText(text).width,cx=W/2,cy=H*.43;
 let x=cx-total/2,top=1e9,bottom=-1e9;const glyphs=[];
 for(const ch of text){const m=ctx.measureText(ch);glyphs.push({ch,x,l:x-m.actualBoundingBoxLeft,r:x+m.actualBoundingBoxRight,a:m.actualBoundingBoxAscent,d:m.actualBoundingBoxDescent});x+=m.width;top=Math.min(top,-m.actualBoundingBoxAscent);bottom=Math.max(bottom,m.actualBoundingBoxDescent);}
 const base=cy-(top+bottom)/2,pad=Math.round(fs*.3);
 const box={x:Math.floor(glyphs[0].l-pad),y:Math.floor(base+top-pad),w:Math.ceil(glyphs[glyphs.length-1].r-glyphs[0].l+2*pad),h:Math.ceil(bottom-top+2*pad)};
 const hw=box.w/2-pad,hh=box.h/2-pad;
 cap.style.top=Math.round(base+bottom+fs*.16)+'px';
 const mk=()=>{const c=document.createElement('canvas');c.width=Math.round(box.w*dpr);c.height=Math.round(box.h*dpr);const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,-box.x*dpr,-box.y*dpr);g.lineCap='round';g.lineJoin='round';return [c,g];};
 const [num,nctx]=mk();
 let numA=0,wrote=false,revealF=0;const softF=.07,A0=Math.PI;
 function drawNumber(){
  if(!wrote||numA<=0)return;
  nctx.save();nctx.globalCompositeOperation='source-over';nctx.clearRect(box.x,box.y,box.w,box.h);nctx.font=font;nctx.fillStyle=col.gold;nctx.fillText(text,glyphs[0].x,base);
  const fa=Math.min(1,Math.max(0,revealF-softF)),fb=Math.min(1,revealF);if(fa<1){const g=nctx.createConicGradient(A0,cx,cy);g.addColorStop(0,'#000');g.addColorStop(fa,'#000');g.addColorStop(fb,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,0)');nctx.globalCompositeOperation='destination-in';nctx.fillStyle=g;nctx.fillRect(box.x,box.y,box.w,box.h);}
  nctx.restore();
  ctx.save();ctx.globalAlpha=numA;ctx.shadowColor=col.hi;ctx.shadowBlur=dark?22:12;ctx.drawImage(num,box.x,box.y,box.w,box.h);ctx.restore();
 }

 // ---- Uhr ----
 let clock=0,last=performance.now(),raf=0,speed=1,alive=true;const tweens=[];
 const tween=(ms,fn)=>new Promise(res=>tweens.push({start:clock,ms,fn,res}));
 const wait=ms=>tween(ms,()=>{});
 const skip=()=>{speed=7;};veil.addEventListener('click',skip);

 // ---- Vögel ----
 const gold={x:-80,y:H*.72,vx:300,vy:-60,flap:0,size:small?8.5:9.5,alpha:1,on:true};
 const hist=[],ribbon=[],dust=[],sparks=[],rings=[];
 const N=small?34:64,birds=[];
 for(let i=0;i<N;i++)birds.push({x:gold.x-40-Math.random()*260,y:gold.y+(Math.random()-.5)*240,vx:260,vy:-40,flap:Math.random()*6,rate:12+Math.random()*6,size:5+Math.random()*3.2,alpha:.5+Math.random()*.4,lag:70+Math.random()*1150,ang:Math.random()*6.28,spin:(Math.random()<.5?-1:1)*(1+Math.random()*1.8),r:.25+Math.random()*.75,mode:'follow'});
 let spread={x:70,y:46};
 const histAt=t=>{for(let i=hist.length-1;i>=0;i--)if(hist[i].t<=t)return hist[i];return hist[0]||gold;};
 function drawBird(b,isGold){
  const f=.3+.7*Math.sin(b.flap),w=b.size,h=b.size*.8*f;
  const tilt=Math.max(-.6,Math.min(.6,Math.atan2(b.vy,Math.abs(b.vx)+80)))*(b.vx<0?-1:1);
  ctx.save();ctx.translate(b.x,b.y);ctx.rotate(tilt);ctx.globalAlpha=Math.max(0,Math.min(1,b.alpha));
  ctx.beginPath();ctx.moveTo(-w,-h);ctx.quadraticCurveTo(-w*.45,-h*.5-w*.3,0,0);ctx.quadraticCurveTo(w*.45,-h*.5-w*.3,w,-h);
  if(isGold){ctx.lineWidth=4.6;ctx.strokeStyle=col.deep;ctx.stroke();ctx.shadowColor=col.hi;ctx.shadowBlur=dark?10:5;ctx.lineWidth=2.4;ctx.strokeStyle=dark?col.hi:col.gold;ctx.stroke();}
  else{ctx.lineWidth=1.5;ctx.strokeStyle=col.ink;ctx.stroke();}
  ctx.restore();
 }
 let dustLife=.65;
 function moveGold(p,dt){
  if(dt>0){gold.vx=(p.x-gold.x)/dt;gold.vy=(p.y-gold.y)/dt;}
  gold.x=p.x;gold.y=p.y;
 }
 let frameDt=0;
 const fly=(path,ms,e=ease)=>tween(ms,p=>moveGold(path.at(e(p)),frameDt));

 function frame(now){
  if(!alive)return;
  const dt=Math.min((now-last)/1000,.05)*speed;last=now;clock+=dt*1000;frameDt=dt;
  for(const t of [...tweens]){const p=t.ms<=0?1:Math.min(1,(clock-t.start)/t.ms);t.fn(p);if(p>=1){tweens.splice(tweens.indexOf(t),1);t.res();}}
  hist.push({t:clock,x:gold.x,y:gold.y});while(hist.length>2&&clock-hist[0].t>1400)hist.shift();
  ctx.clearRect(0,0,W,H);
  drawNumber();
  for(const b of birds){
   let ax,ay;
   if(b.mode==='leave'){ax=b.dx*420;ay=b.dy*420;b.alpha-=dt/1.9;}
   else{const p=histAt(clock-b.lag);b.ang+=b.spin*dt;const tx=p.x+Math.cos(b.ang)*b.r*spread.x,ty=p.y+Math.sin(b.ang)*b.r*spread.y;ax=(tx-b.x)*22-b.vx*7.5;ay=(ty-b.y)*22-b.vy*7.5;}
   ax+=(Math.random()-.5)*220;ay+=(Math.random()-.5)*220;
   b.vx+=ax*dt;b.vy+=ay*dt;const sp=Math.hypot(b.vx,b.vy);if(sp>1100){b.vx*=1100/sp;b.vy*=1100/sp;}
   b.x+=b.vx*dt;b.y+=b.vy*dt;b.flap+=b.rate*dt;
   if(b.alpha>0)drawBird(b,false);
  }
  if(gold.on){
   // Sternschnuppenschweif
   ribbon.push({x:gold.x,y:gold.y});while(ribbon.length>30)ribbon.shift();
   for(let i=1;i<ribbon.length;i++){const k=i/ribbon.length;ctx.beginPath();ctx.moveTo(ribbon[i-1].x,ribbon[i-1].y);ctx.lineTo(ribbon[i].x,ribbon[i].y);ctx.globalAlpha=k*k*.8;ctx.lineWidth=.5+k*2.7;ctx.strokeStyle=col.gold;ctx.stroke();}
   ctx.globalAlpha=1;
   if(dt>0&&Math.random()<.55)dust.push({x:gold.x+(Math.random()-.5)*5,y:gold.y+(Math.random()-.5)*5,vx:(Math.random()-.5)*14,vy:(Math.random()-.5)*14,life:1,dur:dustLife*(.6+Math.random()),r:.6+Math.random()*1});
  }
  for(const p of dust){p.life-=dt/p.dur;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=8*dt;if(p.life<=0)continue;const tw=.6+.4*Math.sin(clock/60+p.x);ctx.globalAlpha=Math.min(1,p.life*1.4)*tw*.8;ctx.fillStyle=col.gold;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,6.29);ctx.fill();}
  for(let i=dust.length-1;i>=0;i--)if(dust[i].life<=0)dust.splice(i,1);
  for(const r of rings){r.life-=dt/.55;if(r.life<=0)continue;const k=Math.max(0,1-r.life);ctx.globalAlpha=Math.min(1,r.life)*.8;ctx.lineWidth=1.4*Math.min(1,r.life)+.3;ctx.strokeStyle=col.hi;ctx.beginPath();ctx.arc(r.x,r.y,8+k*r.max,0,6.29);ctx.stroke();}
  for(const p of sparks){p.life-=dt/p.dur;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=220*dt;p.vx*=1-1.6*dt;if(p.life<=0)continue;ctx.globalAlpha=Math.min(1,p.life*1.6);ctx.strokeStyle=p.c;ctx.lineWidth=p.r;ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-p.vx*.035,p.y-p.vy*.035);ctx.stroke();}
  ctx.globalAlpha=1;
  if(gold.on)drawBird(gold,true);
  gold.flap+=10.5*dt;
  raf=requestAnimationFrame(frame);
 }
 raf=requestAnimationFrame(frame);
 const done=()=>{alive=false;cancelAnimationFrame(raf);veil.remove();cap.remove();cv.remove();if(running===ctl)running=null;};
 const ctl={stop(){tweens.length=0;done();restorePill(pill);}};running=ctl;
 try{

 // ---- Ablauf ----
 requestAnimationFrame(()=>veil.classList.add('on'));
 const rx=hw+fs*.46,ry=hh+fs*.4,on=a=>({x:cx+Math.cos(a)*rx,y:cy+Math.sin(a)*ry});
 const circle=(from,to,ms,e,fn)=>tween(ms,p=>{const q=e(p);moveGold(on(lerp(from,to,q)),frameDt);fn&&fn(q);});
 // 1) Schwarm fliegt herein und schwenkt links in die Kreisbahn ein
 await fly(makePath([[-80,H*.78],[cx-rx*1.9,cy+ry*1.5],[cx-rx*1.12,cy+ry*.75],[cx-rx,cy]]),600,p=>lerp(p,easeOut(p),.3));
 // 2) Eine Runde im Kreis – hinter dem goldenen Vogel entsteht die Zahl wie ein Uhrzeiger
 spread={x:fs*.2,y:fs*.2};dustLife=1.5;wrote=true;numA=1;
 await circle(A0,A0+Math.PI*2,1300,p=>lerp(p,ease(p),.35),q=>{revealF=q*(1+softF);});
 revealF=2;cap.classList.add('on');
 setTimeout(()=>cap.querySelectorAll('li')[wd]?.classList.add('gold'),250/speed);
 // 3) Zweite Runde: der Schwarm löst sich und zieht ab
 dustLife=.8;
 setTimeout(()=>birds.forEach(b=>{const a=-Math.PI/2+(Math.random()-.5)*2.4;b.mode='leave';b.dx=Math.cos(a);b.dy=Math.sin(a);}),250/speed);
 await circle(A0,A0+Math.PI*2,1000,p=>p);
 // 4) … und der goldene Vogel schießt nach oben in die Pille
 const pr=pill.getBoundingClientRect(),tx=pr.left+pr.width/2,ty=pr.top+pr.height/2;
 veil.classList.remove('on');cap.classList.remove('on');
 tween(280,p=>{numA=1-ease(p);});
 await fly(makePath([[cx-rx,cy],[cx-rx*.92,cy-ry*.5],[lerp(cx-rx,tx,.3),Math.min(cy-ry*1.25,lerp(cy,ty,.7))],[lerp(cx,tx,.8),lerp(cy-ry,ty,.75)],[tx,ty]]),550,p=>lerp(p,p*p*p,.8));
 // 5) Einschlag
 gold.on=false;ribbon.length=0;
 for(let i=0;i<(small?24:34);i++){const a=Math.random()*6.28,s=90+Math.random()*330;sparks.push({x:tx,y:ty,vx:Math.cos(a)*s*1.3,vy:Math.sin(a)*s-40,life:1,dur:.5+Math.random()*.5,r:1+Math.random()*1.5,c:[col.gold,col.hi,col.gold][i%3]});}
 rings.push({x:tx,y:ty,life:1,max:64},{x:tx,y:ty,life:1.2,max:36});
 await goldPill(pill,streak,label,wait);
 await wait(100);
 }finally{if(alive)done();}
}

// Pille: 1 s Serie in Gold, dann wieder „heute geübt". Zähler und Beschriftung bleiben im Dokument (nur ausgeblendet),
// damit renderToday() und die Klick-Logik der Pille ungestört weiterlaufen.
function restorePill(pill){pill.querySelectorAll('.streak-swap').forEach(el=>el.remove());pill.classList.remove('streak-gold');pill.style.minWidth='';}
async function goldPill(pill,streak,label,wait){
 const ring=pill.querySelector('.today-ring'),lab=pill.querySelector('.today-label');
 if(!ring||!lab)return;
 restorePill(pill);
 pill.style.minWidth=pill.getBoundingClientRect().width+'px';
 pill.classList.add('streak-gold');
 ring.insertAdjacentHTML('beforeend',`<span class="streak-swap" data-no-i18n aria-hidden="true">${streak}</span>`);
 lab.insertAdjacentHTML('beforeend',`<span class="streak-swap streak-label" data-no-i18n aria-hidden="true"><span class="streak-flame"></span>${escape(label)}</span>`);
 await wait(1100);
 restorePill(pill);
 const count=pill.querySelector('#today-count');
 if(count){count.classList.add('streak-back');setTimeout(()=>count.classList.remove('streak-back'),400);}
}
