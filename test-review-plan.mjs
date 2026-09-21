import assert from 'node:assert/strict';
import {reviewPlan,dueSentences,unseenSentences} from './dist/review-plan.mjs';
const now=100000;
const sentences=Array.from({length:25},(_,i)=>({id:i+1,level:1,text:'Satz '+i,translations:[{text:'Text '+i}],audios:[{}]}));
const record=(due=now-100,updatedAt=1)=>({due,updatedAt,interval:1,repetitions:1});
assert.deepEqual(reviewPlan(sentences,{},1,{now}),[]);
assert.equal(unseenSentences(sentences,{},1).length,25);
let reviews={'1:fi-de':record(now+1),'2:listen':record(),'2:de-fi':record(),'3:dictation':record()};
let plan=reviewPlan(sentences,reviews,1,{now});
assert.deepEqual(plan.map(s=>s.id),[2,3]);
assert.equal(dueSentences(sentences,reviews,1,now).length,2);
assert.equal(unseenSentences(sentences,reviews,1).length,22);
assert.equal(reviewPlan(sentences,reviews,2,{now}).length,0);
assert.equal(reviewPlan([{...sentences[1],audios:[]}],{'2:listen':record()},1,{now}).length,0);
reviews=Object.fromEntries(sentences.map(s=>[`${s.id}:fi-de`,record()]));
reviews['1:de-fi']=record();
plan=reviewPlan(sentences,reviews,1,{now});
assert.equal(plan.length,10);
assert.equal(new Set(plan.map(s=>s.id)).size,10);
assert.deepEqual(plan.slice(0,6).map(s=>s.dailyDifficulty),['easy','easy','hard','easy','easy','hard']);
for(const s of plan)reviews[`${s.id}:fi-de`]=record(now+86400000,now);
const second=reviewPlan(sentences,reviews,1,{now,translationOffset:10});
assert.deepEqual(second.map(s=>s.id),[11,12,13,14,15,16,17,18,19,20]);
assert.equal(second[0].dailyDifficulty,'easy');
assert.equal(second[1].dailyDifficulty,'hard');
for(const s of second)reviews[`${s.id}:fi-de`]=record(now+86400000,now);
const third=reviewPlan(sentences,reviews,1,{now,translationOffset:20});
assert.deepEqual(third.map(s=>s.id),[21,22,23,24,25,1]);
// Archived/duplicate IDs and malformed due dates cannot add duplicate or early tasks.
assert.equal(reviewPlan([...sentences,sentences[0]],reviews,1,{now}).filter(s=>s.id===1).length,1);
assert.deepEqual(reviewPlan(sentences,{'1:fi-de':record(NaN)},1,{now}),[]);
assert.equal(reviewPlan(sentences,{'1:suchsel':record()},1,{now})[0].dailyActivity,'suchsel');
const mixedReviews={
 '1:suchsel':record(now-300,1),
 '2:suchsel':record(now-200,2),
 '2:de-fi':record(now-100,3),
 '3:suchsel':record(now-100,4),
 ...Object.fromEntries(sentences.slice(3,13).map((s,i)=>[`${s.id}:fi-de`,record(now-50,10+i)]))
};
const mixedPlan=reviewPlan(sentences,mixedReviews,1,{now});
assert.equal(mixedPlan.length,10);
assert.equal(mixedPlan.filter(s=>s.dailyActivity==='suchsel').length,1);
assert.equal(mixedPlan.find(s=>s.id===2)?.dailyActivity,'translate');
assert.ok(!mixedPlan.some(s=>s.id===3));
console.log('PASS: due-only, unseen-only, unique sentences, fairness across rounds, levels, audio eligibility, archives, 2:1 difficulty and one Wortsel per round.');
