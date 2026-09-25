import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDifficultDeck,slug,mixDifficultWords,seededProgress,DIFFICULT_SEED} from './dist/difficult-words.mjs';
import {validateGames} from './dist/games-progress.mjs';
const lexicon=JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8'));
const payload=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8'));

assert.equal(buildDifficultDeck({lexicon}).entries.length,0,'ohne Fehler keine Wörter');
const level3=payload.sentences.filter(s=>s.level===3).slice(0,20);
const reviews=Object.fromEntries(level3.map((s,i)=>[`${s.id}:fi-de`,{due:0,interval:i<12?1:30,repetitions:2,updatedAt:1000+i}]));
const deck=buildDifficultDeck({lexicon,reviews});
assert.ok(deck.entries.length>=10,'Sätze mit „Nochmal“ liefern Wörter');
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
// Missed gaps count; looking words up does not (tapping is also used to read grammar).
const viaMissed=buildDifficultDeck({lexicon,missed:['368188:2'],lookups:[{lemma:'parveke',at:5}]});
assert.deepEqual(viaMissed.entries.map(e=>e.target),['japani']);
assert.equal(slug('hyvä'),'hyva2');
// Progress entries validate with the synced game progress.
const progress={hyppy:{schwer:Object.fromEntries(deck.entries.map(e=>[e.id,{box:1,right:1,wrong:0,last:1}]))}};
assert.equal(Object.keys(validateGames(progress).hyppy.schwer).length,deck.entries.length);
// Mixing into the basic list: no duplicates, existing entries are marked instead.
const grund=JSON.parse(readFileSync(new URL('./dist/games/hyppy/words-de-fi.json',import.meta.url),'utf8'));
const withKnown={entries:[...deck.entries,{id:'sw-kiitos',source:'danke',target:'kiitos',lemma:'kiitos'}]};
const {words,ids}=mixDifficultWords(grund,withKnown);
const plain=t=>t.toLowerCase().replace(/[!?.,…]+/g,'').trim(),inGrund=new Set(grund.entries.map(e=>plain(e.target)));
const fresh=withKnown.entries.filter(e=>!inGrund.has(plain(e.target)));
assert.ok(fresh.length<withKnown.entries.length,'Testdaten enthalten auch schon vorhandene Wörter');
assert.equal(words.entries.length,grund.entries.length+fresh.length,'bekannte Wörter nicht doppelt');
assert.equal(ids.length,withKnown.entries.length,'jedes schwierige Wort wird hervorgehoben');
assert.ok(ids.includes('gw-kiitos'),'vorhandener Eintrag wird hervorgehoben');
assert.equal(new Set(words.entries.map(e=>e.id)).size,words.entries.length);
assert.equal(words.meta.title,grund.meta.title);
// Seeding: unseen difficult words start as "missed once"; own progress is never overwritten.
const own={[ids[0]]:{box:3,right:4,wrong:0,last:99}};
const seeded=seededProgress(own,ids);
assert.deepEqual(seeded[ids[0]],own[ids[0]]);
assert.deepEqual(seeded[ids[1]],DIFFICULT_SEED);
assert.equal(own[ids[1]],undefined,'gespeicherter Stand bleibt unverändert');
console.log(`Schwierige Wörter: ${deck.entries.length} Wörter aus Bewertungen und Endungen, Einmischen in den Grundwortschatz geprüft.`);
