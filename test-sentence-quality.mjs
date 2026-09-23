import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('./supabase/migrations/20260922182255_sentence_quality.sql',import.meta.url),'utf8');
const classrooms=fs.readFileSync(new URL('./dist/classrooms.js',import.meta.url),'utf8');
const start=app.indexOf('function qualityFilteredCards(');
const end=app.indexOf('\nlet levels=',start);
assert(start>0&&end>start,'quality filter remains independently testable');
const filterSource=app.slice(start,end);
const filter=new Function('memory','qualityExclusions',`
 const qualityTranslationKey=(sentenceId,translationId)=>\`${'${sentenceId}:${translationId}'}\`;
 ${filterSource}
 return qualityFilteredCards;
`)({reports:{}},{sentences:new Set([2]),translations:new Set(['1:11'])});
const cards=[
 {id:1,translations:[{id:11,text:'bad'},{id:12,text:'good'}]},
 {id:2,translations:[{id:21,text:'blocked'}]}
];
assert.deepEqual(filter(cards).map(s=>[s.id,...s.translations.map(t=>t.id)]),[[1,12]],'global sentence and translation exclusions are applied');

const localFilter=new Function('memory','qualityExclusions',`
 const qualityTranslationKey=(sentenceId,translationId)=>\`${'${sentenceId}:${translationId}'}\`;
 ${filterSource}
 return qualityFilteredCards;
`)({reports:{'1:translation':{sentenceId:1,category:'translation'},'2:audio':{sentenceId:2,category:'audio'}}},{sentences:new Set(),translations:new Set()});
assert.deepEqual(localFilter(cards).map(s=>[s.id,...s.translations.map(t=>t.id)]),[[1,12]],'local reports suppress only the reported relation or sentence');

for(const required of ['enable row level security','deny direct browser access','grant execute on function public.sentence_quality_exclusions() to anon,authenticated','grant execute on function public.sentence_quality_api(text,jsonb) to authenticated'])assert(migration.includes(required),required);
assert(classrooms.includes("qualityApi('classroom_hide'"));
assert(classrooms.includes("qualityApi('classroom_restore'"));
console.log('PASS: global/local quality filtering, private RLS API and classroom hide/restore wiring.');
