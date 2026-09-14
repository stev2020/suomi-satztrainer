import assert from 'node:assert/strict';
import {VERBS} from './dist/verbs-data.mjs';
import {PRONOUNS,combinationKey,validateVerbProgress,mergeVerbProgress,markAsked,markAnswered,answerMatches,createVerbSession,chooseCombination,verbSummary} from './dist/verb-practice.mjs';

assert.equal(VERBS.length,200);
assert.equal(new Set(VERBS.map(v=>v.id)).size,200);
for(const v of VERBS) {
 assert.ok(v.de && /^[a-zäöå]+$/u.test(v.id));
 assert.equal(v.forms.length,6);
 for(const f of v.forms)assert.match(f,/^[a-zäöå]+$/u);
 for(let p=0;p<6;p++){
  assert.ok(answerMatches(v.forms[p],v,p));
  assert.ok(answerMatches('  '+PRONOUNS[p].toUpperCase()+'   '+v.forms[p].toUpperCase()+'  ',v,p));
  assert.ok(!answerMatches(PRONOUNS[(p+1)%6]+' '+v.forms[p],v,p));
 }
}
for(const [id,forms] of Object.entries({
 olla:['olen','olet','on','olemme','olette','ovat'],
 tulla:['tulen','tulet','tulee','tulemme','tulette','tulevat'],
 tehdä:['teen','teet','tekee','teemme','teette','tekevät'],
 nähdä:['näen','näet','näkee','näemme','näette','näkevät'],
 lähteä:['lähden','lähdet','lähtee','lähdemme','lähdette','lähtevät'],
 maata:['makaan','makaat','makaa','makaamme','makaatte','makaavat'],
 tarvita:['tarvitsen','tarvitset','tarvitsee','tarvitsemme','tarvitsette','tarvitsevat'],
 vanheta:['vanhenen','vanhenet','vanhenee','vanhenemme','vanhenette','vanhenevat']
})) assert.deepEqual(VERBS.find(v=>v.id===id).forms,forms);

const tulla=VERBS.find(v=>v.id==='tulla'),nahda=VERBS.find(v=>v.id==='nähdä');
assert.ok(!answerMatches('tuleen',tulla,1));
assert.ok(!answerMatches('naen',nahda,0));
assert.ok(!answerMatches('tulet!',tulla,1));
assert.ok(!answerMatches('',tulla,1));

let progress={},clock=1000000;
for(let round=0;round<120;round++){
 const session=createVerbSession(10);
 for(let i=0;i<10;i++){
  const item=chooseCombination(VERBS,progress,session,clock,()=>.37);
  assert.ok(!progress[item.key]?.seen,'Unseen combinations are covered before early successful repetitions');
  progress=markAsked(progress,item.key,clock++);
  progress=markAnswered(progress,item.key,true,clock++);
  session.history.push(item.key);session.answers.push({correct:true});
 }
}
assert.equal(verbSummary(VERBS,progress,clock).seen,1200);
assert.equal(verbSummary(VERBS,progress,clock).due,0);
assert.deepEqual(validateVerbProgress(JSON.parse(JSON.stringify(progress))),progress);
assert.throws(()=>validateVerbProgress({'bad:8':{}}));
assert.throws(()=>validateVerbProgress({'tulla:1':{...progress['tulla:1'],errors:-1}}));

// Every wrong answer must have a gap, but never starve unseen combinations.
progress={};
let sawRetry=false,freshCount=0;
for(let round=0;round<40;round++){
 const session=createVerbSession(10),lastIndices={};
 for(let i=0;i<10;i++){
  const item=chooseCombination(VERBS,progress,session,clock,()=>.2);
  if(lastIndices[item.key]!==undefined){assert.ok(i-lastIndices[item.key]>=3);sawRetry=true;}
  if(!progress[item.key]?.seen)freshCount++;
  lastIndices[item.key]=i;
  progress=markAsked(progress,item.key,clock++);
  progress=markAnswered(progress,item.key,false,clock++);
  session.history.push(item.key);session.answers.push({correct:false});
  session.retries=session.retries.filter(r=>r.key!==item.key);
  session.retries.push({key:item.key,after:i+3});
 }
 assert.equal(session.answers.length,10);
}
assert.ok(sawRetry);
assert.ok(freshCount>=160,'At least four fresh combinations per ten-question round');
assert.ok(verbSummary(VERBS,progress,clock).due>0);

// Difficult verbs transfer practice to other personal forms.
let difficult=markAnswered(markAnswered({},'tulla:0',false,100), 'tulla:0',false,200);
const relatedSession=createVerbSession(5);
relatedSession.answers=[{},{}];relatedSession.history=['tulla:0'];
assert.equal(chooseCombination(VERBS,difficult,relatedSession,300,()=>0).verb.id,'tulla');

// Merge disjoint devices and retain a graded result if another device only
// opens the same question later; remerging is idempotent.
const left=markAnswered(markAsked({},'tulla:1',100),'tulla:1',false,200);
const right=markAnswered(markAsked({},'olla:2',150),'olla:2',true,250);
const merged=mergeVerbProgress(left,right);
assert.ok(merged['tulla:1']&&merged['olla:2']);
assert.deepEqual(mergeVerbProgress(merged,merged),merged);
assert.deepEqual(mergeVerbProgress(right,left),merged);
const openedElsewhere=markAsked({},'tulla:1',300);
const keepAnswer=mergeVerbProgress(left,openedElsewhere)['tulla:1'];
assert.equal(keepAnswer.errors,1);assert.equal(keepAnswer.lastAskedAt,300);
assert.equal(keepAnswer.lastAnsweredAt,200);assert.equal(keepAnswer.streak,0);
const recovered=markAnswered(left,'tulla:1',true,500);
assert.equal(mergeVerbProgress(left,recovered)['tulla:1'].streak,1);
assert.ok(recovered['tulla:1'].due>500);
const secure=markAnswered(recovered,'tulla:1',true,600);
assert.equal(verbSummary(VERBS,secure,600).secure,1);
assert.ok(secure['tulla:1'].due>recovered['tulla:1'].due);
const simultaneousRight=markAnswered({},'tulla:1',true,700);
const simultaneousWrong=markAnswered({},'tulla:1',false,700);
assert.deepEqual(mergeVerbProgress(simultaneousRight,simultaneousWrong),mergeVerbProgress(simultaneousWrong,simultaneousRight));
assert.equal(createVerbSession(5).count,5);
assert.equal(createVerbSession(10).count,10);
console.log('Verbforms: 200 paradigms, 1,200 combinations, answer checks, coverage, retries, difficult verbs and merges passed.');
