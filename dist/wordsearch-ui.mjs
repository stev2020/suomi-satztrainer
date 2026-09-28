import {selectionCells,selectSearch,searchHint} from './wordsearch.mjs';
export function searchInstructions(puzzle){
 return `Finde die finnischen Wörter zum deutschen Satz. ${puzzle.difficulty==='hard'?'Waagerecht, senkrecht und diagonal – auch rückwärts.':'Von links nach rechts oder von oben nach unten.'} Ziehe über ein Wort oder tippe seinen ersten und letzten Buchstaben an. Gleiche Wörter suchst du nur einmal.`;
}
export function mountSearch(container,puzzle,onComplete,prompt=''){
 const doc=container.ownerDocument;
 container.innerHTML='<p class="sentence search-prompt" lang="de"></p><p class="search-count" role="status"></p><p class="search-pan-hint" role="note" hidden><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="9.5" cy="6" r="2.2" fill="currentColor"/><circle cx="14.5" cy="6" r="2.2" fill="currentColor"/><path d="M3 15h18M3 15l3-3M3 15l3 3M21 15l-3-3M21 15l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Das Rätsel ist breiter als der Bildschirm. Mit zwei Fingern seitlich schieben.</span></p><div class="search-scroll-frame"><div class="search-scroll" tabindex="0" aria-label="Buchstabengitter, bei Bedarf seitlich scrollen"><div class="search-grid" role="group" aria-label="Finnische Wörter suchen" data-i18n-attrs lang="fi"></div></div></div><p class="search-feedback" role="status"></p><div class="search-found" aria-label="Gefundene Wörter"></div><div class="search-footer"><button type="button" class="quiet search-hint">Hinweis</button><div class="search-inline-difficulty" role="group" aria-label="Schwierigkeit"><button type="button" data-search-inline-difficulty="easy">Leicht</button><button type="button" data-search-inline-difficulty="hard">Schwer</button></div><p class="search-inline-note"></p></div><p class="search-hint-text" role="status"></p>';
 const grid=container.querySelector('.search-grid'),feedback=container.querySelector('.search-feedback');
 container.querySelector('.search-prompt').textContent=prompt;
 grid.style.setProperty('--search-size',puzzle.size);
 const buttons=puzzle.grid.map((letter,i)=>{const b=doc.createElement('button');b.type='button';b.textContent=letter;b.dataset.cell=i;b.setAttribute('data-i18n-attrs','');b.setAttribute('aria-label',`${letter}, Zeile ${Math.floor(i/puzzle.size)+1}, Spalte ${i%puzzle.size+1}`);grid.append(b);return b;});
 let anchor=null,down=null;
 const scroll=container.querySelector('.search-scroll'),touches=new Map();
 let panning=false,center=null,panned=0,panDone=false,nudged=false;
 const frame=container.querySelector('.search-scroll-frame'),panHint=container.querySelector('.search-pan-hint'),win=doc.defaultView,PAN_LEARNED='vanamo-search-pan-learned';
 const panLearned=()=>{try{return win?.localStorage?.getItem(PAN_LEARNED)==='1';}catch{return false;}};
 const coarse=()=>Boolean(win?.matchMedia?.('(pointer: coarse)').matches);
 // Shows fades at edges with hidden letters and, on touch screens, the two-finger hint while the grid overflows.
 function edges(){const max=(scroll.scrollWidth||0)-(scroll.clientWidth||0),over=max>2;frame.classList.toggle('more-left',over&&scroll.scrollLeft>2);frame.classList.toggle('more-right',over&&scroll.scrollLeft<max-2);if(!over)panHint.hidden=true;else if(coarse()&&!panDone&&!panLearned())panHint.hidden=false;return over;}
 function nudge(){if(nudged)return;nudged=true;panHint.hidden=false;panHint.classList.remove('nudge');void panHint.offsetWidth;panHint.classList.add('nudge');}
 scroll.addEventListener?.('scroll',edges,{passive:true});
 if(win?.ResizeObserver)new win.ResizeObserver(edges).observe(scroll);
 const touchCenter=()=>{const points=[...touches.values()];return points.length<2?null:{x:points.reduce((sum,p)=>sum+p.x,0)/points.length,y:points.reduce((sum,p)=>sum+p.y,0)/points.length};};
 function paint(preview=[]){const found=new Set(puzzle.foundCells.flat());buttons.forEach((b,i)=>{b.classList.toggle('found',found.has(i));b.classList.toggle('preview',preview.includes(i));b.classList.toggle('anchor',anchor===i);b.classList.toggle('hint',puzzle.hint?.cells[0]===i);b.setAttribute('aria-pressed',String(anchor===i));});}
 function update(){container.querySelector('.search-count').textContent=`${puzzle.found.length} von ${puzzle.words.length} Wörtern gefunden`;const list=container.querySelector('.search-found');list.replaceChildren(...puzzle.found.map(word=>{const span=doc.createElement('span');span.lang='fi';span.textContent=word;return span;}));container.querySelector('.search-hint-text').textContent=puzzle.hint?`Suche ${puzzle.hint.word}. Der Anfangsbuchstabe ist markiert.`:'';paint();}
 function select(start,end){const result=selectSearch(puzzle,start,end);anchor=null;feedback.textContent=result.status==='found'?`${result.word} gefunden!`:result.status==='already'?'Dieses Wort hast du schon gefunden.':'Noch kein gesuchtes Wort. Versuche es noch einmal.';update();if(result.complete)onComplete();}
 function tap(i){if(anchor===null){anchor=i;if(puzzle.words.includes(puzzle.grid[i]))select(i,i);else{feedback.textContent='Jetzt den letzten Buchstaben antippen.';paint();}}else select(anchor,i);}
 const indexAt=e=>{const b=doc.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');return b&&grid.contains(b)?Number(b.dataset.cell):null;};
 grid.onpointerdown=e=>{
  if(e.pointerType==='touch'){
   touches.set(e.pointerId,{x:e.clientX,y:e.clientY});grid.setPointerCapture(e.pointerId);
   if(touches.size>1){panning=true;down=null;center=touchCenter();paint();return;}
   if(panning)return;
  }else if(e.button!==0||!e.isPrimary||touches.size)return;
  const i=indexAt(e);if(i===null)return;down=i;nudged=false;grid.setPointerCapture(e.pointerId);
 };
 grid.onpointermove=e=>{
  if(touches.has(e.pointerId)){
   touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(panning){const next=touchCenter();if(center&&next){scroll.scrollLeft+=center.x-next.x;panned+=Math.abs(center.x-next.x);if(panned>40&&!panDone){panDone=true;panHint.hidden=true;try{win?.localStorage?.setItem(PAN_LEARNED,'1');}catch{}}}center=next;return;}
   // One finger dragged against an edge with more letters behind it: remind the user of the two-finger gesture.
   if(down!==null&&scroll.getBoundingClientRect){const r=scroll.getBoundingClientRect();if((e.clientX>r.right-28&&frame.classList.contains('more-right'))||(e.clientX<r.left+28&&frame.classList.contains('more-left')))nudge();}
  }
  if(down===null)return;const i=indexAt(e);paint(i===null?[]:selectionCells(puzzle,down,i));
 };
 function release(e,cancelled=false){
  const wasPanning=panning;touches.delete(e.pointerId);center=touchCenter();
  if(!touches.size)panning=false;
  if(grid.hasPointerCapture(e.pointerId))grid.releasePointerCapture(e.pointerId);
  if(wasPanning||cancelled){down=null;paint();return;}
  if(down===null)return;const start=down,end=indexAt(e);down=null;
  if(end===null){paint();return;}if(start!==end)select(start,end);else tap(end);
 }
 grid.onpointerup=e=>release(e);
 grid.onpointercancel=e=>release(e,true);
 grid.onlostpointercapture=e=>{if(touches.has(e.pointerId))release(e,true);};
 grid.onclick=e=>{if(e.detail!==0)return;const b=e.target.closest('[data-cell]');if(b)tap(Number(b.dataset.cell));};
 grid.onkeydown=e=>{const b=e.target.closest('[data-cell]');if(!b)return;const i=Number(b.dataset.cell),offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-puzzle.size,ArrowDown:puzzle.size}[e.key];if(offset!==undefined){e.preventDefault();buttons[Math.max(0,Math.min(buttons.length-1,i+offset))].focus();}if(e.key==='Escape'){anchor=null;paint();}};
 container.querySelector('.search-hint').onclick=()=>{searchHint(puzzle);update();};update();edges();
}
