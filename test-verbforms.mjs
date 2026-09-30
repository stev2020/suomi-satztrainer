import assert from 'node:assert/strict';
import {VERBS} from './dist/verbs-data.mjs';
import {PRONOUNS,combinationKey,validateVerbProgress,mergeVerbProgress,markAsked,markAnswered,answerMatches,createVerbSession,chooseCombination,verbSummary,unlockedVerbCount,STAGE_SIZE} from './dist/verb-practice.mjs';

assert.equal(VERBS.length,201);
assert.equal(new Set(VERBS.map(v=>v.id)).size,201);
// Lernreihenfolge: die 50 wichtigsten zuerst, olla vorne.
assert.deepEqual(VERBS.slice(0,10).map(v=>v.id),['olla','tehdä','mennä','tulla','saada','voida','haluta','pitää','täytyä','tietää']);
assert.equal(VERBS[49].id,'käydä');
// täytyä: unpersönlich, Person im Genitiv, nur die ganze Wendung zählt.
const taytya=VERBS.find(v=>v.id==='täytyä');
assert.ok(taytya.impersonal);
assert.deepEqual(taytya.forms,['minun täytyy','sinun täytyy','hänen täytyy','meidän täytyy','teidän täytyy','heidän täytyy']);
assert.ok(answerMatches('  Minun  täytyy ',taytya,0));
assert.ok(!answerMatches('täytyy',taytya,0));
assert.ok(!answerMatches('minä täytyy',taytya,0));
assert.ok(!answerMatches('sinun täytyy',taytya,0));
for(const v of VERBS.filter(v=>!v.impersonal)) {
 assert.ok(v.de && /^[a-zäöå]+$/u.test(v.id));
 assert.equal(v.forms.length,6);
 for(const f of v.forms)assert.match(f,/^[a-zäöå]+$/u);
 for(let p=0;p<6;p++){
  assert.equal(answerMatches(v.forms[p],v,p),p!==2 && p!==5);
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

const tarkoittaa=VERBS.find(v=>v.id==='tarkoittaa');
assert.equal(answerMatches('tarkoittaa',tarkoittaa,2),false);
assert.equal(answerMatches('hän tarkoittaa',tarkoittaa,2),true);
assert.equal(answerMatches('tarkoittavat',tarkoittaa,5),false);
assert.equal(answerMatches('he tarkoittavat',tarkoittaa,5),true);
const tulla=VERBS.find(v=>v.id==='tulla'),nahda=VERBS.find(v=>v.id==='nähdä');
assert.ok(!answerMatches('tuleen',tulla,1));
assert.ok(!answerMatches('naen',nahda,0));
assert.ok(!answerMatches('tulet!',tulla,1));
assert.ok(!answerMatches('',tulla,1));

let progress={},clock=1000000;
for(let round=0;round<121;round++){
 const session=createVerbSession(10);
 for(let i=0;i<(round<120?10:6);i++){
  const item=chooseCombination(VERBS,progress,session,clock,()=>.37);
  assert.ok(!progress[item.key]?.seen,'Unseen combinations are covered before early successful repetitions');
  progress=markAsked(progress,item.key,clock++);
  progress=markAnswered(progress,item.key,true,clock++);
  session.history.push(item.key);session.answers.push({correct:true});
 }
}
assert.equal(verbSummary(VERBS,progress,clock).seen,1206);
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

// Stufen: neue Formen nur aus den ersten fünf Verben, bis zwei Drittel davon gesehen sind.
assert.equal(unlockedVerbCount(VERBS,{}),STAGE_SIZE);
progress={};
const firstStage=new Set(VERBS.slice(0,STAGE_SIZE).map(v=>v.id));
for(let i=0;i<19;i++){const session=createVerbSession(5);const item=chooseCombination(VERBS,progress,session,clock,()=>(i*.37)%1);assert.ok(firstStage.has(item.verb.id),'new forms come from the first stage: '+item.key);progress=markAnswered(markAsked(progress,item.key,clock++),item.key,true,clock++);}
assert.equal(unlockedVerbCount(VERBS,progress),STAGE_SIZE,'19 of 30 forms seen: still stage one');
for(const v of VERBS.slice(0,STAGE_SIZE))for(let p=0;p<6;p++)progress=markAsked(progress,combinationKey(v,p),clock++);
assert.equal(unlockedVerbCount(VERBS,progress),2*STAGE_SIZE,'next five verbs open');
// Wer früher zufällig weiter hinten geübt hat, bekommt trotzdem zuerst die wichtigsten.
const scattered=Object.fromEntries(VERBS.slice(150).flatMap(v=>PRONOUNS.map((_,p)=>[combinationKey(v,p),{seen:1,attempts:1,errors:0,streak:1,lastAskedAt:1,lastAnsweredAt:1,due:9e15,updatedAt:1}])));
assert.equal(unlockedVerbCount(VERBS,scattered),STAGE_SIZE);
assert.ok(firstStage.has(chooseCombination(VERBS,scattered,createVerbSession(5),clock,()=>.5).verb.id));

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
console.log('Verbforms: 201 paradigms in learning order (täytyä impersonal), 1,206 combinations, stages, answer checks, coverage, retries, difficult verbs and merges passed.');
