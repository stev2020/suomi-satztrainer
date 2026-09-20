import assert from 'node:assert/strict';
import fs from 'node:fs';
import {EVERYDAY_PATH,PATH_SENTENCE_IDS,everydayPathState,homeReviewPool} from './dist/learning-path.mjs';
import {reviewPlan} from './dist/review-plan.mjs';
const payload=JSON.parse(fs.readFileSync(new URL('./dist/sentences.json',import.meta.url)));
const sentences=[...payload.sentences,...payload.archived_sentences];
const grammar=JSON.parse(fs.readFileSync(new URL('./dist/grammar.json',import.meta.url))).sentences;
const ids=EVERYDAY_PATH.flatMap(t=>t.lessons.flatMap(l=>l.ids));
assert.equal(ids.length,60);assert.equal(new Set(ids).size,60);
for(const id of ids){const s=sentences.find(s=>s.id===id);assert(s?.translations?.length,`Missing sentence ${id}`);assert.equal(grammar[id]?.sentence,s.text,`Missing matching grammar ${id}`);}
let reviews={},state=everydayPathState(sentences,reviews);
assert.equal(state.topic.id,'hello');assert.equal(state.lesson.remaining.length,5);assert.equal(state.seen,0);
const mark=(id,kind='fi-de')=>{reviews[`${id}:${kind}`]={repetitions:1,due:0,updatedAt:1,interval:0};};
mark(ids[0],'listen');mark(ids[1],'de-fi');
state=everydayPathState(sentences,reviews);
assert.equal(state.seen,2);assert.deepEqual(state.lesson.remaining.map(s=>s.id),ids.slice(2,5));
for(const id of ids.slice(0,5))mark(id);
state=everydayPathState(sentences,reviews);assert.equal(state.topic.id,'hello');assert.equal(state.lesson.index,1);
// Existing later progress must not unlock earlier, unfinished topics.
for(const id of EVERYDAY_PATH[3].lessons.flatMap(l=>l.ids))mark(id);
assert.equal(everydayPathState(sentences,reviews).topic.id,'hello');
for(const id of ids.slice(5,10))mark(id);
assert.equal(everydayPathState(sentences,reviews).topic.id,'cafe');
for(const id of ids)mark(id);
state=everydayPathState(sentences,reviews);assert(state.complete);assert.equal(state.seen,60);assert.equal(state.lesson,null);
// Higher-level path sentences must enter ordinary due-only home reviews.
const higher=sentences.find(s=>s.level>1&&PATH_SENTENCE_IDS.has(s.id));
const unrelated=sentences.find(s=>s.level>1&&!PATH_SENTENCE_IDS.has(s.id));
reviews={};mark(higher.id);mark(unrelated.id);
let plan=reviewPlan(homeReviewPool(sentences,1),reviews,null);
assert.deepEqual(plan.map(s=>s.id),[higher.id]);assert.equal(plan[0].level,higher.level);
reviews[`${higher.id}:fi-de`].due=Date.now()+86400000;
assert.equal(reviewPlan(homeReviewPool(sentences,1),reviews,null).length,0);
// A missing asset cannot silently count as a completed lesson.
assert.equal(everydayPathState(sentences.filter(s=>s.id!==ids[0]),{}).topics[0].lessons[0].complete,false);
console.log('PASS: curated path coverage, ordered stages, prior progress, completion and due-only cross-level reviews.');
