import assert from 'node:assert/strict';
import {mountSearch} from './dist/wordsearch-ui.mjs';

// Exercise the production pointer handlers without a browser dependency.
function setup(){
 const nodes=new Map(),captures=new Set(),buttons=[];
 const node=()=>({textContent:'',style:{setProperty(){}},classList:{toggle(){}},setAttribute(){},append(){},replaceChildren(){}});
 const grid=node();grid.append=b=>buttons.push(b);grid.contains=b=>buttons.includes(b);
 grid.setPointerCapture=id=>captures.add(id);grid.hasPointerCapture=id=>captures.has(id);grid.releasePointerCapture=id=>captures.delete(id);
 nodes.set('.search-grid',grid);nodes.set('.search-scroll',{scrollLeft:100});
 const doc={createElement(){const b=node();b.dataset={};b.closest=()=>b;return b;},elementFromPoint(x){return buttons[Math.floor(x/10)]||null;}};
 const container={ownerDocument:doc,querySelector(key){if(!nodes.has(key))nodes.set(key,node());return nodes.get(key);}};
 const puzzle={size:3,grid:Array.from('KISAAAXXX'),words:['KIS','AAA'],placements:[],difficulty:'easy',found:[],foundCells:[],hint:null};
 let completed=0;mountSearch(container,puzzle,()=>completed++);
 const event=(id,x,type='touch')=>({pointerId:id,clientX:x,clientY:5,pointerType:type,isPrimary:id===1,button:0});
 return {grid,puzzle,scroll:nodes.get('.search-scroll'),event,completed:()=>completed};
}
{
 const {grid,puzzle,event}=setup();
 grid.onpointerdown(event(1,5));grid.onpointermove(event(1,25));grid.onpointerup(event(1,25));
 assert.deepEqual(puzzle.found,['KIS'],'one finger marks a word');
}
{
 const {grid,puzzle,scroll,event}=setup();
 grid.onpointerdown(event(1,25));grid.onpointerdown(event(2,55));
 grid.onpointermove(event(1,5));grid.onpointermove(event(2,35));
 assert.equal(scroll.scrollLeft,120,'two fingers pan by their center movement');
 grid.onpointerup(event(2,35));grid.onpointermove(event(1,25));grid.onpointerup(event(1,25));
 assert.deepEqual(puzzle.found,[],'lifting one finger does not turn a pan into a selection');
 grid.onpointerdown(event(1,5));grid.onpointerup(event(1,5));
 grid.onpointerdown(event(1,25));grid.onpointerup(event(1,25));
 assert.deepEqual(puzzle.found,['KIS'],'tap endpoints still work after panning');
}
for(const cancelled of ['onpointercancel','onlostpointercapture']){
 const {grid,puzzle,event}=setup();grid.onpointerdown(event(1,5));grid[cancelled](event(1,25));
 assert.deepEqual(puzzle.found,[]);
 grid.onpointerdown(event(1,5));grid.onpointerup(event(1,25));assert.deepEqual(puzzle.found,['KIS']);
}
{
 const {grid,puzzle,event}=setup();grid.onpointerdown(event(1,5,'mouse'));grid.onpointerup(event(1,25,'mouse'));
 assert.deepEqual(puzzle.found,['KIS'],'mouse dragging is unchanged');
}
console.log('Wortsel touch: drag, two-finger pan, lift, cancel, recovery, taps and mouse passed.');
