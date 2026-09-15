import assert from 'node:assert/strict';
import {createWordExercise,wordAnswerMatches,sentenceWords} from './dist/word-practice.mjs';
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
console.log('Word exercise unit tests passed');
