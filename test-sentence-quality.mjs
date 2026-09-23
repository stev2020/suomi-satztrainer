import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('./supabase/migrations/20260922182255_sentence_quality.sql',import.meta.url),'utf8');
const classrooms=fs.readFileSync(new URL('./dist/classrooms.js',import.meta.url),'utf8');
const reviewMigration=fs.readFileSync(new URL('./supabase/migrations/20260923150612_sentence_quality_review_queue.sql',import.meta.url),'utf8');
const reviewUI=fs.readFileSync(new URL('./dist/quality-review.js',import.meta.url),'utf8');
const duplicates=JSON.parse(fs.readFileSync(new URL('./dist/duplicate-candidates.json',import.meta.url),'utf8'));
const registerFunction=fs.readFileSync(new URL('./supabase/functions/register/index.ts',import.meta.url),'utf8');
const recoverFunction=fs.readFileSync(new URL('./supabase/functions/recover/index.ts',import.meta.url),'utf8');
const pwnedPassword=fs.readFileSync(new URL('./supabase/functions/_shared/pwned-password.ts',import.meta.url),'utf8');
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
for(const required of ['quality_private.reviewers','resolve_report','resolve_duplicate','Keine Berechtigung für die Qualitätsprüfung'])assert(reviewMigration.includes(required),required);
assert(reviewUI.includes("api('list_reports')")&&reviewUI.includes("api('list_duplicates')"));
assert(duplicates.count===duplicates.candidates.length&&duplicates.candidates.some(item=>item.match==='exact')&&duplicates.candidates.some(item=>item.match==='near'));
assert(pwnedPassword.includes("'Add-Padding':'true'")&&pwnedPassword.includes('digest.slice(0,5)'));
assert(registerFunction.indexOf("'register-user'")<registerFunction.indexOf('try{if(await isPwnedPassword'));
assert(recoverFunction.indexOf('recovery_token_hash!==await hash(recoveryCode)')<recoverFunction.indexOf('try{if(await isPwnedPassword'));
console.log('PASS: global/local filtering, private review API, duplicate candidates and classroom hide/restore wiring.');
