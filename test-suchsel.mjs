import assert from 'node:assert/strict';
import fs from 'node:fs';
import {searchWords,canSearch,createSearch,selectionCells,selectSearch,searchHint} from './dist/wordsearch.mjs';
assert.deepEqual(searchWords('Tänään, tänään! Minä juon.'),['TÄNÄÄN','MINÄ','JUON']);
assert.equal(canSearch({text:'Olen 20-vuotias.'}),false);
const corpus=JSON.parse(fs.readFileSync('dist/sentences.json')).sentences.filter(canSearch);
let seed=42;const random=()=>((seed=(seed*1664525+1013904223)>>>0)/4294967296);
for(const difficulty of ['easy','hard'])for(const sentence of [{text:'Juon tänään kahvia.'},...corpus.filter((_,i)=>i%40===0)]){
 const p=createSearch(sentence,difficulty,random);assert.equal(p.placements.length,p.words.length);assert.equal(p.grid.length,p.size*p.size);
 assert.equal(p.grid.some(c=>!/^\p{L}$/u.test(c)),false);
 assert.deepEqual(selectionCells(p,-1,3),[]);
 const hint=searchHint(p);assert.ok(hint);assert.equal(p.found.length,0);
 for(const placement of [...p.placements].reverse()){
  assert.equal(placement.cells.map(i=>p.grid[i]).join(''),placement.word);
  const start=placement.cells[0],end=placement.cells.at(-1);
  if(difficulty==='easy')assert.ok(start<=end&&(Math.floor(start/p.size)===Math.floor(end/p.size)||start%p.size===end%p.size));
  const result=selectSearch(p,start,end);assert.equal(result.status,'found');assert.equal(selectSearch(p,start,end).status,'already');
 }
 assert.equal(p.found.length,p.words.length);assert.equal(searchHint(p),null);
}
const p=createSearch({text:'Kahvia tänään.'},'easy');assert.deepEqual(selectionCells(p,9,0),[]);p.difficulty='hard';assert.ok(selectionCells(p,9,0).length);
console.log('Suchsel: placement, directions, Finnish letters, duplicates, hints and completion passed across corpus samples.');
