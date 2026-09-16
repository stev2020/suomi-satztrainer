import assert from 'node:assert/strict';
import {createWordExercise,wordAnswerMatches,sentenceWords,finnishSentenceMatches} from './dist/word-practice.mjs';
const sentence={text:'Minä olen täällä, sinä olet täällä.',translations:[{text:'Ich bin hier, du bist hier.'}]};
for(const language of ['fi','de'])for(let i=0;i<100;i++){
 const w=createWordExercise(sentence,language,[sentence]);
 assert.ok([1,2].includes(w.tokens.length-w.expected.length));
 assert.equal(new Set(w.tokens.map(t=>t.id)).size,w.tokens.length);
 w.selected=w.expected.map((_,i)=>i);assert.ok(wordAnswerMatches(w));
 w.selected[0]=w.expected.length;assert.ok(!wordAnswerMatches(w));
 w.selected=[];assert.ok(!wordAnswerMatches(w));
}
assert.deepEqual(sentenceWords('„Hyvää huomenta!“'),['Hyvää','huomenta']);
const optionalSubjects={text:'Minä olen täällä, sinä olet siellä, me olemme valmiita ja te olette ajoissa.',translations:[{text:'Ich bin hier, du bist dort, wir sind bereit und ihr seid pünktlich.'}]};
const optional=createWordExercise(optionalSubjects,'fi',[optionalSubjects],()=>.5);
optional.selected=optional.expected.map((_,i)=>i).filter(i=>!['minä','sinä','me','te'].includes(normalizedForTest(optional.expected[i])));
assert.ok(wordAnswerMatches(optional),'minä, sinä, me and te may all be omitted');
optional.selected=optional.expected.map((_,i)=>i).filter(i=>normalizedForTest(optional.expected[i])!=='sinä');
assert.ok(wordAnswerMatches(optional),'each optional Finnish subject pronoun may be omitted independently');
optional.selected=optional.expected.map((_,i)=>i);assert.ok(wordAnswerMatches(optional),'optional Finnish subject pronouns may be included');
const requiredSubjects={text:'Hän on täällä ja he ovat valmiita.',translations:[{text:'Er ist hier und sie sind bereit.'}]};
const required=createWordExercise(requiredSubjects,'fi',[requiredSubjects],()=>.5);
required.selected=required.expected.map((_,i)=>i).filter(i=>!['hän','he'].includes(normalizedForTest(required.expected[i])));
assert.ok(!wordAnswerMatches(required),'hän and he remain required');
const wrongPronoun={language:'fi',expected:['Minä','olen','nälkäinen'],tokens:[{id:0,text:'Sinä'},{id:1,text:'olen'},{id:2,text:'nälkäinen'}],selected:[0,1,2]};
assert.ok(!wordAnswerMatches(wrongPronoun),'a wrong optional pronoun is not accepted');
assert.ok(finnishSentenceMatches('olen nälkäinen','Minä olen nälkäinen.'),'writing comparison accepts omitted minä');
assert.ok(finnishSentenceMatches('Olet liian pieni!','Sinä olet liian pieni.'),'writing comparison accepts omitted sinä and punctuation differences');
assert.ok(finnishSentenceMatches('olemme täällä ja te olette siellä','Me olemme täällä ja te olette siellä.'),'writing comparison accepts partly omitted optional subjects');
assert.ok(!finnishSentenceMatches('on täällä','Hän on täällä.'),'writing comparison requires hän');
assert.ok(!finnishSentenceMatches('ovat täällä','He ovat täällä.'),'writing comparison requires he');
assert.ok(!finnishSentenceMatches('Sinä olen nälkäinen','Minä olen nälkäinen.'),'writing comparison rejects a wrong subject pronoun');
console.log('Word exercise unit tests passed');

function normalizedForTest(word){return word.toLocaleLowerCase('fi').normalize('NFC');}
