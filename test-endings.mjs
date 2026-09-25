import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildEndingItems,indexLexicon,createEndingsSession,endingChoices,endingMatches,describeAnswer,caseOf} from './dist/endings-practice.mjs';
import {sentenceWords} from './dist/word-practice.mjs';

const lexicon=JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8'));
const payload=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8'));
const index=indexLexicon(lexicon,[...payload.sentences,...payload.archived_sentences]);
let seeded=1;const random=()=>(seeded=(seeded*16807)%2147483647)/2147483647;

const all=buildEndingItems(lexicon,payload.sentences,null);
assert.ok(all.length>3000,'genug Lücken insgesamt');
for(const level of [1,2,3,4,5,6])assert.ok(buildEndingItems(lexicon,payload.sentences,level).length>=20,`Level ${level} hat Lücken`);
for(const item of all){
 assert.equal(sentenceWords(item.sentence.text)[item.index],item.answer,`Lücke passt zum Satz ${item.id}`);
 assert.ok(item.case&&!/Nominativ Singular/.test(item.form),`${item.id} ist gebeugt`);
 assert.doesNotMatch(item.form,/umgangssprach| \+ /,`${item.id} ohne Umgangssprache/Endpartikel`);
 const choices=endingChoices(item,index,random);
 assert.equal(choices.filter(c=>c===item.answer).length,1,`Lösung genau einmal: ${item.id}`);
 assert.equal(new Set(choices.map(c=>c.toLowerCase())).size,choices.length,`keine doppelten Auswahlformen: ${item.id}`);
 assert.ok(choices.length<=3);
 for(const c of choices)assert.doesNotMatch(c,/[^aeiouyäö]n(n|lle|ssa|ssä|sta|stä|lla|llä)$/u,`keine Kunstform an Konsonantstamm: ${c}`);
}
const item=all.find(i=>i.sentence.text==='Olen parvekkeella.');
assert.ok(item);assert.equal(item.lemma,'parveke');assert.match(item.case,/Adessiv/);
assert.ok(endingMatches('  PARVEKKEELLA ',item));assert.ok(!endingMatches('parvekella',item));
assert.equal(caseOf('Nomen · Inessiv „in“ Singular'),'Inessiv „in“ Singular');
const other=describeAnswer('parvekkeelta',item,index);
if(other)assert.equal(other.lemma,'parveke');
assert.equal(describeAnswer('xyz',item,index),null);

const level1=buildEndingItems(lexicon,payload.sentences,1);
const missed=new Set([level1[5].id,level1[40].id]);
const session=createEndingsSession(level1,10,{random,missed});
assert.equal(session.items.length,10);
assert.equal(new Set(session.items.map(i=>i.sentence.id)).size,10,'eine Lücke pro Satz');
assert.deepEqual(new Set(session.items.slice(0,2).map(i=>i.id)),missed,'verpasste Lücken zuerst');
console.log(`Endungen: ${all.length} Lücken, Auswahl, Prüfung und Rundenbildung geprüft.`);
