// Vanamo – Himmel hinter dem Kopf der Seite und der Sonnen-Knopf für Tag und Nacht.
//
// Tag: ein zarter Himmel in der Farbe der Palette, durch den sehr langsam zwei weiche Wolken ziehen.
// Nacht (Palette Kaamos): dunkler Himmel mit funkelnden Sternen, ab und zu einer Sternschnuppe und in
// unbestimmten Abständen einem wogenden Nordlicht (grün, nach oben violett, an den Spitzen leicht rötlich).
// Der Knopf im Kopf der Seite lässt die Sonne im Knopf untergehen und den Mond aufgehen (und umgekehrt);
// dabei zieht ein Abendrot über den Himmel und die Seite wechselt weich die Farben.
// Die Farben selbst und die Wahl der Palette stehen in themes.mjs.
import {isNight,setNight,setTheme,THEMES} from './themes.mjs?v=7';

const DUR=2200;
const html=document.documentElement;
const reduced=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
const cl=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),sm=t=>t*t*(3-2*t),seg=(x,a,b)=>sm(cl((x-a)/(b-a)));

const SUN_RAYS=Array.from({length:8},(_,i)=>{const a=i/8*Math.PI*2;return `<line x1="${(Math.cos(a)*8.5).toFixed(2)}" y1="${(Math.sin(a)*8.5).toFixed(2)}" x2="${(Math.cos(a)*13).toFixed(2)}" y2="${(Math.sin(a)*13).toFixed(2)}"/>`;}).join('');
const sunSVG=y=>`<g class="sky-sun" transform="translate(0,${y.toFixed(2)})">${SUN_RAYS}<circle r="5.5"/></g>`;
const moonSVG=y=>`<g class="sky-moon" transform="translate(0,${y.toFixed(2)}) rotate(-40)"><path d="M1,-8a8,8 0 1 0 6,12.5A6.5,6.5 0 0 1 1,-8Z"/></g>`;

export function createSky(){
 if(document.querySelector('.sky'))return null;
 const sky=document.createElement('div');sky.className='sky';sky.setAttribute('aria-hidden','true');
 sky.innerHTML='<div class="sky-day"></div><div class="sky-clouds"><b></b><b></b></div><div class="sky-dusk"></div><div class="sky-night"></div><canvas class="sky-aurora"></canvas><div class="sky-stars"></div>';
 document.body.prepend(sky);
 const $=s=>sky.querySelector(s);
 const stars=$('.sky-stars'),aurora=$('.sky-aurora'),ax=aurora.getContext('2d');
 for(let i=0;i<70;i++){const s=document.createElement('i'),z=Math.random()<.15?3:2;s.style.cssText=`left:${(Math.random()*100).toFixed(2)}%;top:${(Math.random()*58).toFixed(2)}%;width:${z}px;height:${z}px;animation-delay:${(-Math.random()*4).toFixed(2)}s;animation-duration:${(3+Math.random()*4).toFixed(2)}s`;stars.append(s);}

 // ---- Knopf im Kopf der Seite ----
 const button=document.createElement('button');
 button.type='button';button.className='sky-toggle';
 button.innerHTML='<svg viewBox="-20 -20 40 40" aria-hidden="true" focusable="false"><defs><clipPath id="sky-toggle-clip"><circle r="19"/></clipPath></defs><g clip-path="url(#sky-toggle-clip)"></g></svg>';
 const icon=button.querySelector('g');
 // Desktop: rechts neben dem Logo vor „heute geübt“; am Handy vorn in der Knopfreihe (sonst bräuchte er eine eigene Zeile)
 const brand=document.querySelector('header>.brand'),nav=document.querySelector('header .header-nav');
 const narrow=typeof matchMedia==='function'?matchMedia('(max-width: 700px)'):null;
 const place=()=>{if(narrow?.matches&&nav){if(button.parentElement!==nav)nav.prepend(button);}else if(button.previousElementSibling!==brand)brand?.after(button);};
 place();narrow?.addEventListener?.('change',place);

 let p=isNight()?1:0,from=p,target=p,t0=0,raf=0,switched=true;
 function label(){const night=target>.5;button.setAttribute('aria-label',night?'Sonne aufgehen lassen':'Sonne untergehen lassen');button.title=night?'Tag':'Nacht';button.setAttribute('aria-pressed',String(night));}
 function still(){icon.innerHTML=p>.5?moonSVG(0):sunSVG(0);}
 // Sonne und Mond gehen nur im Knopf unter und auf: erst sinkt der eine aus dem Kreis, dann steigt der andere herein.
 function iconAt(k,toNight){
  const first=toNight?sunSVG:moonSVG,second=toNight?moonSVG:sunSVG,D=34;
  icon.innerHTML=k<.5?first(D*sm(k/.5)):second(D*(1-(1-Math.pow(1-(k-.5)/.5,3))));
 }
 function paint(){
  const dusk=Math.sin(Math.PI*cl(p)),dark=seg(p,.3,.8);
  sky.style.setProperty('--sky-dark',dark.toFixed(3));
  sky.style.setProperty('--sky-dusk',(dusk*.9).toFixed(3));
  sky.style.setProperty('--sky-sunset',p.toFixed(3));
  sky.style.setProperty('--sky-stars',seg(p,.55,1).toFixed(3));
  sky.classList.toggle('is-night',p>.5);
  sky.classList.toggle('is-day',p<.99);
 }
 function frame(now){
  raf=0;
  if(t0){
   const k=cl((now-t0)/DUR);p=from+(target-from)*sm(k);iconAt(k,target>from);
   // Mitten im Abendrot wechselt die Seite ihre Farben
   if(!switched&&k>=.45){switched=true;swap();}
   if(k>=1){t0=0;still();night();}
  }
  paint();
  if(t0)raf=requestAnimationFrame(frame);
 }
 let swap=()=>{};
 function go(toNight,apply){
  if(toNight===(target>.5)&&!t0){apply();return;}
  target=toNight?1:0;label();
  swap=()=>{html.classList.add('theme-switching');apply();setTimeout(()=>html.classList.remove('theme-switching'),900);};
  if(reduced()){p=target;swap();still();paint();night();return;}
  from=p;t0=performance.now();switched=false;
  if(!raf)raf=requestAnimationFrame(frame);
 }
 button.addEventListener('click',()=>go(target<.5,()=>setNight(target>.5)));
 // Farbwahl im Fuß der Seite: Wechsel zwischen hell und Kaamos geht auch über den Himmel
 document.addEventListener('vanamo-theme-request',e=>{
  const theme=THEMES.find(t=>t.id===e.detail?.id);if(!theme||theme.dark===(target>.5))return;
  e.preventDefault();go(theme.dark,()=>setTheme(theme.id));
 });
 // Palette von anderswo geändert (anderer Tab, Gerät): ohne Animation nachziehen
 document.addEventListener('vanamo-theme',e=>{
  if(t0)return;const n=e.detail?.dark?1:0;if(n===target)return;
  p=from=target=n;label();still();paint();night();
 });

 // ---- Nacht: Sternschnuppen und Nordlicht ----
 let shootTimer=0,auroraTimer=0,auroraUntil=0,auroraA=0,auroraRaf=0;
 function shoot(){
  if(p<.99||document.hidden)return;
  const r=sky.getBoundingClientRect(),e=document.createElement('div');e.className='sky-shoot';
  const x=r.width*(.25+Math.random()*.6),y=r.height*(.04+Math.random()*.22),ang=150+Math.random()*25,len=110+Math.random()*120,dist=180+Math.random()*160,rad=ang*Math.PI/180;
  e.style.cssText=`left:${x}px;top:${y}px;width:${len}px`;stars.append(e);
  e.animate([{opacity:0,transform:`rotate(${ang}deg) scaleX(.2)`},{opacity:1,offset:.2},{opacity:0,transform:`translate(${Math.cos(rad)*dist}px,${Math.sin(rad)*dist}px) rotate(${ang}deg) scaleX(1)`}],{duration:900+Math.random()*500,easing:'cubic-bezier(.3,.6,.4,1)'}).onfinish=()=>e.remove();
 }
 function scheduleShoot(){clearTimeout(shootTimer);shootTimer=setTimeout(()=>{shoot();scheduleShoot();},5000+Math.random()*12000);}
 function startAurora(){if(p<.99||document.hidden)return;auroraUntil=performance.now()+9000+Math.random()*7000;if(!auroraRaf)auroraRaf=requestAnimationFrame(drawAurora);}
 function scheduleAurora(first){clearTimeout(auroraTimer);auroraTimer=setTimeout(()=>{startAurora();scheduleAurora(false);},first?4000:20000+Math.random()*40000+16000);}
 // Nordlicht als wogender Vorhang: viele senkrechte Strahlen entlang einer welligen Linie
 function drawAurora(now){
  auroraRaf=0;
  const r=aurora.getBoundingClientRect(),AW=Math.max(1,Math.round(r.width/2)),AH=Math.max(1,Math.round(r.height/2));
  if(aurora.width!==AW||aurora.height!==AH){aurora.width=AW;aurora.height=AH;}
  const want=now<auroraUntil&&p>.99?1:0;auroraA+=(want-auroraA)*(want?.012:.008);
  ax.clearRect(0,0,AW,AH);
  if(auroraA<.003&&!want){aurora.style.opacity=0;return;}
  const t=now/1000,c=AW*(.5+.18*Math.sin(t*.05)),step=2;
  for(let x=0;x<AW;x+=step){
   const u=x/AW;
   const base=AH*(.62+.10*Math.sin(u*5.2+t*.35)+.05*Math.sin(u*13-t*.8)+.025*Math.sin(u*31+t*1.6));
   const env=Math.exp(-Math.pow((x-c)/(AW*.38),2));
   const rays=.55+.45*Math.sin(u*90+t*2.1+Math.sin(u*7+t*.6)*3)*Math.sin(u*23-t*1.1);
   const I=Math.max(0,env*rays*(.65+.35*Math.sin(u*8-t*1.4)));if(I<.02)continue;
   const h=AH*(.38+.22*Math.sin(u*9+t*.45)+.08*Math.sin(u*41-t*2.3));
   const g=ax.createLinearGradient(0,base-h,0,base+AH*.05);
   g.addColorStop(0,'rgba(235,75,100,0)');
   g.addColorStop(.1,`rgba(235,85,110,${.2*I})`);
   g.addColorStop(.22,`rgba(140,100,255,${.12*I})`);
   g.addColorStop(.38,`rgba(130,110,255,${.22*I})`);
   g.addColorStop(.75,`rgba(70,230,170,${.55*I})`);
   g.addColorStop(.93,`rgba(120,255,200,${.9*I})`);
   g.addColorStop(1,'rgba(80,240,180,0)');
   ax.fillStyle=g;ax.fillRect(x,base-h,step+.6,h+AH*.05);
  }
  aurora.style.opacity=(auroraA*.8).toFixed(3);
  auroraRaf=requestAnimationFrame(drawAurora);
 }
 function night(){
  clearTimeout(shootTimer);clearTimeout(auroraTimer);
  if(p>.99&&!reduced()){scheduleShoot();scheduleAurora(true);}
  else{auroraUntil=0;}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)night();});

 label();still();paint();night();
 return {button,sky};
}

if(typeof document!=='undefined'&&document.querySelector('header>.brand'))createSky();
