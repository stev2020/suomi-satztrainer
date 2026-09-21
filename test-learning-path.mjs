import assert from 'node:assert/strict';
import fs from 'node:fs';
import {LEVEL_PATHS,PATH_SENTENCE_IDS,everydayPathState,homeReviewPool} from './dist/learning-path.mjs';
import {reviewPlan} from './dist/review-plan.mjs';
const payload=JSON.parse(fs.readFileSync(new URL('./dist/sentences.json',import.meta.url)));
const sentences=[...payload.sentences,...payload.archived_sentences];
const allIds=[];
for(let level=1;level<=6;level++){
 const topics=LEVEL_PATHS[level],ids=topics.flatMap(t=>t.lessons.flatMap(l=>l.ids)),levelIds=[...new Set(sentences.filter(s=>s.level===level&&s.translations?.length).map(s=>s.id))];allIds.push(...ids);
 assert.equal(topics.length,13);
 for(const topic of topics)for(const lesson of topic.lessons){
  assert(lesson.ids.length>0&&lesson.ids.length<=5);
  for(const id of lesson.ids){const s=sentences.find(s=>s.id===id);assert(s?.translations?.length,`Missing ${id}`);assert.equal(s.level,level);}
 }
 let reviews={},state=everydayPathState(sentences,reviews,level);
 assert.equal(state.topics.length,14);assert.equal(state.topics.at(-1).id,'more');
 assert.equal(state.seen,0);assert.equal(state.total,levelIds.length);assert(!state.complete);
 const first=state.lesson,mark=(id,kind='fi-de')=>reviews[`${id}:${kind}`]={repetitions:1,due:0};
 mark(first.ids[0],'listen');state=everydayPathState(sentences,reviews,level);assert.equal(state.seen,1);
 assert.equal(everydayPathState(sentences,reviews,level===6?1:level+1).seen,0);
 for(const id of ids)mark(id);
 state=everydayPathState(sentences,reviews,level);assert(!state.complete);assert.equal(state.topic.id,'more');
 for(const id of levelIds)mark(id);
 state=everydayPathState(sentences,reviews,level);assert(state.complete);assert.equal(state.lesson,null);assert.equal(state.seen,levelIds.length);
 assert(state.topics.filter(t=>!t.available).every(t=>!t.complete));
 // Existing review keys count; missing data must never produce false completion.
 assert(!everydayPathState(sentences.filter(s=>s.id!==ids[0]),reviews,level).complete);
 const other=sentences.find(s=>s.level!==level);mark(other.id);
 const plan=reviewPlan(homeReviewPool(sentences,level),reviews,null);assert(plan.length);assert(plan.every(s=>s.level===level));
 for(const id of levelIds)reviews[id+':fi-de'].due=Date.now()+86400000;
 delete reviews[first.ids[0]+':listen'];
 assert.equal(reviewPlan(homeReviewPool(sentences,level),reviews,null).length,0);
}
assert.equal(new Set(allIds).size,allIds.length);assert.equal(PATH_SENTENCE_IDS.size,allIds.length);
const first=LEVEL_PATHS[1][0].lessons;
const laterReviews=Object.fromEntries(LEVEL_PATHS[1][1].lessons.flatMap(l=>l.ids).map(id=>[id+':de-fi',{repetitions:1}]));
assert.equal(everydayPathState(sentences,laterReviews,1).lesson.ids[0],first[0].ids[0]);
console.log(`PASS: six complete level paths, 13 curated topics plus remaining sentences, ${allIds.length} distinct curated IDs, prior progress, missing assets, empty topics and level-scoped reviews.`);
