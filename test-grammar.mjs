import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {VERBS} from './dist/verbs-data.mjs';
import * as VerbPractice from './dist/verb-practice.mjs';
import {GRAMMAR_TOPICS,topicNotes} from './dist/grammar-topics.mjs';
const payload=JSON.parse(fs.readFileSync(new URL('./dist/sentences.json',import.meta.url)));
const grammar=JSON.parse(fs.readFileSync(new URL('./dist/grammar.json',import.meta.url))).sentences;
const elements=new Map();
class AudioStub{constructor(){this.paused=true;this.readyState=4;AudioStub.instances.push(this)}load(){}pause(){this.paused=true}play(){this.paused=false;return Promise.resolve()}removeAttribute(name){if(name==='src')this.src=''}}
AudioStub.instances=[];
function element(id){if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',value:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(){},addEventListener(){},querySelector(){return element('audio-label');},insertAdjacentHTML(_,html){this.innerHTML+=html;},focus(){}});return elements.get(id);}
const ctx=vm.createContext({GRAMMAR_TOPICS,topicNotes,VERBS,...VerbPractice,console,URL,Audio:AudioStub,assert,payload,fixtureGrammar:grammar,localStorage:{getItem(){return null;},setItem(){}},document:{getElementById:element,querySelector(){return element('selected-element');},querySelectorAll(){return [];},addEventListener(){}}});
let app=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
ctx.window={addEventListener(){},removeEventListener(){}};
ctx.document.body={dataset:{account:'authenticated'}};
app=app.slice(0,app.indexOf("try{const response=await fetch('sentences.json')"));
vm.runInContext(app,ctx);
vm.runInContext(`data=payload.sentences;archived=payload.archived_sentences;grammar=fixtureGrammar;grammarAvailable=true;ready=true;activity='grammar';direction='de-fi';`,ctx);
for(const topic of GRAMMAR_TOPICS){
  const counts=[];
  for(let level=1;level<=6;level++){
    vm.runInContext(`grammarTopic='${topic.id}';level=${level};audioOnly=false;start();assert(queue.length<=10);assert(queue.every(s=>s.level===level&&matchesTopic(s)));assert.equal(grammarMarkup(queue[0]||{}),'');`,ctx);
    counts.push(payload.sentences.filter(s=>s.level===level&&topicNotes(s,grammar,topic.id).length).length);
  }
  assert(counts.some(Boolean),topic.id+' needs examples');
  console.log(topic.label+': '+counts.join(', '));
}
vm.runInContext(`
level=1;grammarTopic='negation';start();assert(queue.length>0);
const sample=queue[0];assert.equal(audioMarkup(sample),'');
assert(translationDraftMarkup(sample).includes('(optional)'));
$('reveal').onclick();assert(revealed);assert(grammarMarkup(sample).includes('open'));
assert(grammarMarkup(sample).includes('Vernein'));
grade('easy');assert(memory.reviews[sample.id+':de-fi']);assert(!memory.reviews[sample.id+':grammar']);
persist();const backup=validateBackup({format:'suomi-backup',version:1,learning:memory});assert.equal(backup.prefs.grammarTopic,'negation');
delete backup.prefs.grammarTopic;backup.prefs.activity='translate';assert.equal(validateBackup({format:'suomi-backup',version:1,learning:backup}).prefs.grammarTopic,'negation');
direction='random';start();const repeated=queue[0];revealed=true;grade('again');assert(queue.some(s=>s.id===repeated.id&&s.practiceDirection===repeated.practiceDirection));
audioOnly=true;start();assert(queue.every(s=>s.audios.length));
grammar={};start();assert.equal(queue.length,0);assert($('card').innerHTML.includes('Keine passenden'));
grammar=fixtureGrammar;activity='translate';audioOnly=false;mode='new';start();assert(!$('direction-group').hidden);assert($('grammar-controls').hidden);
assert(audioCache.size<=AUDIO_CACHE_LIMIT);const preparedURL=queue[0].audios[0].download_url;assert.strictEqual(prepareAudio(preparedURL),prepareAudio(preparedURL));
activity='listen';start();assert(queue.every(s=>s.audios.length));assert($('direction-group').hidden);
const audioCard=queue[0],audioHtml=audioMarkup(audioCard);assert(audioHtml.includes('id="play-audio"'));assert(!audioHtml.includes('replay-audio'));
activity='dictation';start();assert(queue.every(s=>s.audios.length));assert(questionMarkup(queue[0],'').includes('Was hörst du'));
for(const s of data.filter(s=>s.level===level).slice(0,5))memory.reviews[s.id+':fi-de']={repetitions:2,due:Date.now()+86400000,interval:1};
activity='writing';start();assert.equal(activity,'writing');assert($('practice-toolbar').hidden);
`,ctx);
await vm.runInContext(`activity='listen';start();globalThis.audioButton=$('play-audio');audioButton.dataset={};play(queue[0]);`,ctx);
vm.runInContext(`assert.equal(audioButton.querySelector('span').textContent,'Anhalten');player.onended();assert.equal(audioButton.querySelector('span').textContent,'Wiederholen');assert(audioMarkup(queue[0]).includes('<span>Wiederholen</span>'));`,ctx);
assert.equal(topicNotes({id:368188,text:'Changed sentence'},grammar,'negation').length,0);
assert(!GRAMMAR_TOPICS.find(t=>t.id==='location').match.test('Hinweiswort im Partitiv'));
const html=fs.readFileSync(new URL('./dist/index.html',import.meta.url),'utf8');
for(const [,asset] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)){if(!/^(https?:|\.\/)/.test(asset))assert(fs.existsSync(new URL('./dist/'+asset,import.meta.url)),asset);}
console.log('Grammar selection, reveal, reviews, backup compatibility, activity switching and static assets passed.');
