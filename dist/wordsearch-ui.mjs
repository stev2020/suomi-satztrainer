import {selectionCells,selectSearch,searchHint} from './wordsearch.mjs';
export function searchInstructions(puzzle){
 return `Finde die finnischen Wörter zum deutschen Satz. ${puzzle.difficulty==='hard'?'Waagerecht, senkrecht und diagonal – auch rückwärts.':'Von links nach rechts oder von oben nach unten.'} Ziehe über ein Wort oder tippe seinen ersten und letzten Buchstaben an. Gleiche Wörter suchst du nur einmal. Auf dem Smartphone: Mit einem Finger Wörter markieren, mit zwei Fingern das Rätsel seitlich verschieben.`;
}
export function mountSearch(container,puzzle,onComplete,prompt=''){
 const doc=container.ownerDocument;
 container.innerHTML='<p class="sentence search-prompt" lang="de"></p><p class="search-count" role="status"></p><div class="search-scroll" tabindex="0" aria-label="Buchstabengitter, bei Bedarf seitlich scrollen"><div class="search-grid" role="group" aria-label="Finnische Wörter suchen" lang="fi"></div></div><p class="search-feedback" role="status"></p><div class="search-found" aria-label="Gefundene Wörter"></div><button type="button" class="quiet search-hint">Hinweis</button><p class="search-hint-text" role="status"></p>';
 const grid=container.querySelector('.search-grid'),feedback=container.querySelector('.search-feedback');
 container.querySelector('.search-prompt').textContent=prompt;
 grid.style.setProperty('--search-size',puzzle.size);
 const buttons=puzzle.grid.map((letter,i)=>{const b=doc.createElement('button');b.type='button';b.textContent=letter;b.dataset.cell=i;b.setAttribute('aria-label',`${letter}, Zeile ${Math.floor(i/puzzle.size)+1}, Spalte ${i%puzzle.size+1}`);grid.append(b);return b;});
 let anchor=null,down=null;
 const scroll=container.querySelector('.search-scroll'),touches=new Map();
 let panning=false,center=null;
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
  const i=indexAt(e);if(i===null)return;down=i;grid.setPointerCapture(e.pointerId);
 };
 grid.onpointermove=e=>{
  if(touches.has(e.pointerId)){
   touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
   if(panning){const next=touchCenter();if(center&&next)scroll.scrollLeft+=center.x-next.x;center=next;return;}
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
 container.querySelector('.search-hint').onclick=()=>{searchHint(puzzle);update();};update();
}
