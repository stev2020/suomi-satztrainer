import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sentenceWords} from './dist/word-practice.mjs';
import {setLexicon,splitSentence,wordInfo,lookupForSentence} from './dist/word-lookup.mjs';

const payload=JSON.parse(readFileSync(new URL('./dist/sentences.json',import.meta.url),'utf8'));
const lexicon=JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8'));
setLexicon(lexicon);
const cards=[...payload.sentences,...(payload.archived_sentences||[])].filter(s=>s.translations?.length);

let tokens=0;
for(const card of cards){
 const entry=lexicon.sentences[String(card.id)];
 assert.ok(entry,`Lexikon fehlt für ${card.id}`);
 assert.equal(entry.s,card.text,`Satztext geändert: ${card.id}`);
 const words=sentenceWords(card.text),parts=splitSentence(card.text).filter(p=>p.index!==undefined);
 assert.deepEqual(parts.map(p=>p.text),words,`Wortgrenzen weichen ab: ${card.id}`);
 assert.equal(entry.w.length,words.length,`Anzahl Wörter: ${card.id}`);
 // Re-joining display parts must reproduce the sentence exactly.
 assert.equal(splitSentence(card.text).map(p=>p.text).join(''),card.text.normalize('NFC'));
 for(let i=0;i<words.length;i++){
  const info=wordInfo(card.text,i);
  assert.ok(info.lemma&&info.meaning&&info.form,`Unvollständig: ${card.id}:${i}`);
  tokens++;
 }
}

const check=(text,index,expected)=>{const info=wordInfo(text,index);for(const [k,v] of Object.entries(expected))assert.equal(info[k],v,`${text}[${index}].${k}`);};
check('En puhu japania.',0,{lemma:'ei'});
check('En puhu japania.',1,{lemma:'puhua'});
assert.match(wordInfo('En puhu japania.',1).form,/Verneinungsform/);
check('Minulla on kysymys.',0,{lemma:'minä'});
assert.match(wordInfo('Minulla on kysymys.',0).form,/Adessiv/);
assert.equal(lookupForSentence('Kein finnischer Satz.'),null);
assert.equal(wordInfo('Kein finnischer Satz.',0),null);
console.log(`Wortanalyse: ${cards.length} Sätze, ${tokens} Wörter geprüft.`);
