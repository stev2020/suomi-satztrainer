import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDifficultDeck,slug,readLookups,saveLookup,MIN_DIFFICULT_WORDS} from './dist/difficult-words.mjs';
import {validateGames} from './dist/games-progress.mjs';
const lexicon=JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8'));
const payload=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8'));

assert.equal(buildDifficultDeck({lexicon}).entries.length,0,'ohne Fehler keine Wörter');
const level3=payload.sentences.filter(s=>s.level===3).slice(0,20);
const reviews=Object.fromEntries(level3.map((s,i)=>[`${s.id}:fi-de`,{due:0,interval:i<12?1:30,repetitions:2,updatedAt:1000+i}]));
const deck=buildDifficultDeck({lexicon,reviews});
assert.ok(deck.entries.length>=MIN_DIFFICULT_WORDS,'Sätze mit „Nochmal“ liefern Wörter');
assert.ok(deck.entries.length<=40);
for(const e of deck.entries){
 assert.match(e.id,/^[A-Za-z0-9_.:-]{1,80}$/,'ID passt zum Spiel-Lernstand');
 assert.ok(e.source&&e.target);
 assert.ok(!['olla','ei','minä'].includes(e.target),'keine Allerweltswörter');
 assert.doesNotMatch(e.target,/\d/);
}
assert.equal(new Set(deck.entries.map(e=>e.source.toLowerCase())).size,deck.entries.length,'eindeutige deutsche Bedeutungen');
assert.equal(new Set(deck.entries.map(e=>e.id)).size,deck.entries.length);
// Only easy reviews: nothing difficult.
const easy=Object.fromEntries(level3.map(s=>[`${s.id}:fi-de`,{due:0,interval:30,repetitions:3,updatedAt:1}]));
assert.equal(buildDifficultDeck({lexicon,reviews:easy}).entries.length,0);
// Lookups and missed gaps count.
const viaLookups=buildDifficultDeck({lexicon,lookups:[{lemma:'parveke',at:5}],missed:['368188:2']});
assert.deepEqual(viaLookups.entries.map(e=>e.target).sort(),['japani','parveke']);
assert.equal(viaLookups.entries.find(e=>e.target==='parveke').id,'sw-parveke');
assert.equal(slug('hyvä'),'hyva2');
// Progress entries validate with the synced game progress.
const progress={hyppy:{schwer:Object.fromEntries(deck.entries.map(e=>[e.id,{box:1,right:1,wrong:0,last:1}]))}};
assert.equal(Object.keys(validateGames(progress).hyppy.schwer).length,deck.entries.length);
// Lookup storage is bounded and tolerant.
const store=new Map(),storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
for(let i=0;i<310;i++)saveLookup('talo',storage,i);
assert.equal(readLookups(storage).length,300);
store.set('suomi-word-lookups','kaputt');assert.deepEqual(readLookups(storage),[]);
console.log(`Schwierige Wörter: ${deck.entries.length} Wörter aus Bewertungen, Nachschlagen und Endungen geprüft.`);
