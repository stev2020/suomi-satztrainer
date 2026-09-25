import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setLexicon} from './dist/word-lookup.mjs?v=2';
import {alignWords,charDiff,compareTranslation,translationFeedbackMarkup} from './dist/translation-feedback.mjs';
setLexicon(JSON.parse(readFileSync(new URL('./dist/lexicon.json',import.meta.url),'utf8')));

assert.equal(compareTranslation('','x','fi').kind,'empty');
assert.equal(compareTranslation('minulla on kysymys','Minulla on kysymys.'.split('|'),'fi').kind,'exact');
const omitted=compareTranslation('Olen nälkäinen','Minä olen nälkäinen.'.split('|'),'fi');
assert.equal(omitted.kind,'exact');assert.ok(omitted.omittedPronoun);

// One wrong ending: close, paired, explained from the lexicon.
const close=compareTranslation('Olen parvekkeelta.',['Olen parvekkeella.'],'fi');
assert.equal(close.kind,'close');assert.equal(close.diffs.length,1);
assert.deepEqual([close.diffs[0].type,close.diffs[0].typed,close.diffs[0].expected,close.diffs[0].index],['changed','parvekkeelta','parvekkeella',1]);
const html=translationFeedbackMarkup({answer:'Olen parvekkeelta.',templates:['Olen parvekkeella.'],language:'fi',sentenceText:'Olen parvekkeella.'});
assert.match(html,/eine Stelle weicht/);assert.match(html,/Adessiv/);assert.match(html,/diff-wrong/);
// The learner's own form is explained when it is a corpus form of the same word.
const own=translationFeedbackMarkup({answer:'Minulta on kysymys.',templates:['Minulla on kysymys.'],language:'fi',sentenceText:'Minulla on kysymys.'});
assert.match(own,/Deine Form: Pronomen · Ablativ/);
// Missing and extra words.
const miss=compareTranslation('En puhu.',['En puhu japania.'],'fi');
assert.equal(miss.diffs[0].type,'missing');assert.equal(miss.diffs[0].expected,'japania');
const extra=compareTranslation('En puhu hyvin japania.',['En puhu japania.'],'fi');
assert.equal(extra.diffs[0].type,'extra');
// Unrelated wording is not a list of errors.
assert.equal(compareTranslation('Täysin eri lause tässä nyt.',['Minulla on kysymys.'],'fi').kind,'different');
assert.equal(translationFeedbackMarkup({answer:'Täysin eri lause.',templates:['Minulla on kysymys.'],language:'fi',compact:true}),'');
// German: best of several templates.
const de=compareTranslation('Ich habe ein Frage',['Ich habe eine Frage.','Ich hab ne Frage.'],'de');
assert.equal(de.kind,'close');assert.equal(de.template,'Ich habe eine Frage.');
// Escaping.
assert.doesNotMatch(translationFeedbackMarkup({answer:'<img src=x onerror=1> on',templates:['Minulla on kysymys.'],language:'fi',sentenceText:'Minulla on kysymys.'}),/<img/);
assert.equal(charDiff('talosa','talossa').expected.replace(/<[^>]+>/g,''),'talossa');assert.equal((charDiff('talosa','talossa').expected.match(/diff-needed/g)||[]).length,1);
assert.equal(alignWords('a '.repeat(200),'b'),null);
console.log('Übersetzungs-Rückmeldung: Abgleich, Erklärungen, Pronomen, Varianten und Escaping geprüft.');
