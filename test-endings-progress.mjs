// Endungen-Lernstand und ihre Einplanung in „Wiederholen“.
import assert from 'node:assert/strict';
import {validateEndingsProgress,mergeEndingsProgress,markEndingAnswered,missedEndings} from './dist/endings-progress.mjs';
import {planEndings,newEndingCandidates,dueEndingKeys,newEndingsToday,alternate,endingCard,NEW_ENDINGS_PER_DAY,ENDINGS_DUE_LIMIT,NEW_ONLY_BELOW} from './dist/daily-mix.mjs';

const now=new Date('2026-09-30T12:00:00').getTime(),DAY=86400000;
// Abstände: richtig 1, 3, 9 Tage; falsch sofort fällig und Serie zurück.
let p=markEndingAnswered({},'10:2',true,now);
assert.equal(p['10:2'].due-p['10:2'].updatedAt,DAY);assert.equal(p['10:2'].firstAt,p['10:2'].updatedAt);
p=markEndingAnswered(p,'10:2',true,now+DAY);assert.equal(p['10:2'].due-p['10:2'].updatedAt,3*DAY);
p=markEndingAnswered(p,'10:2',false,now+5*DAY);assert.equal(p['10:2'].streak,0);assert.equal(p['10:2'].due,p['10:2'].updatedAt);
assert.equal(p['10:2'].attempts,3);assert.equal(p['10:2'].errors,1);assert.equal(p['10:2'].firstAt,now);
assert.deepEqual([...missedEndings(p)],['10:2']);
// Prüfung und Zusammenführen
assert.deepEqual(validateEndingsProgress(p),p);
assert.throws(()=>validateEndingsProgress({'abc':p['10:2']}));
assert.throws(()=>validateEndingsProgress({'1:1':{...p['10:2'],errors:9}}));
const a=markEndingAnswered({},'1:0',true,now),b=markEndingAnswered(markEndingAnswered({},'1:0',false,now-DAY),'1:0',false,now+1000);
const m=mergeEndingsProgress(a,b);
assert.equal(m['1:0'].updatedAt,now+1000,'newer answer wins');assert.equal(m['1:0'].firstAt,now-DAY,'first contact kept');
assert.deepEqual(mergeEndingsProgress(undefined,a),a);

// Planung
const sentence=(id,level,text)=>({id,level,text,translations:[{text:'x'}]});
const items=[];
for(let id=1;id<=30;id++){const s=sentence(id,id<=20?1:2,'sana '.repeat(2+id%5).trim());items.push({id:`${id}:0`,sentence:s},{id:`${id}:1`,sentence:s});}
// Neuling ohne gelernte Sätze: kurze Sätze des eigenen Levels, eine Lücke pro Satz.
let plan=planEndings({items,progress:{},learnedIds:new Set(),level:1,now});
assert.equal(plan.fresh.length,NEW_ENDINGS_PER_DAY);
assert.equal(new Set(plan.fresh.map(f=>f.key.split(':')[0])).size,NEW_ENDINGS_PER_DAY);
assert.ok(plan.fresh.every(f=>items.find(i=>i.id===f.key).sentence.level===1));
assert.deepEqual(planEndings({items,progress:{},level:1,now:now+3600000}).fresh,plan.fresh,'stable during the day');
// Gelernte Sätze zuerst.
plan=planEndings({items,progress:{},learnedIds:new Set([25,26]),level:1,now});
assert.deepEqual(plan.fresh.slice(0,2).map(f=>f.key.split(':')[0]).sort(),['25','26']);
// Tageskontingent
let prog=markEndingAnswered({},'25:0',true,now);
assert.equal(newEndingsToday(prog,now),1);
assert.equal(planEndings({items,progress:prog,level:1,now}).fresh.length,NEW_ENDINGS_PER_DAY-1);
assert.equal(planEndings({items,progress:prog,level:1,now:now+DAY}).fresh.length,NEW_ENDINGS_PER_DAY);
// Fällige: gedeckelt, sortiert; viel fällig → nichts Neues.
prog={};for(let id=1;id<=8;id++)prog=markEndingAnswered(prog,`${id}:0`,false,now-id*DAY);
plan=planEndings({items,progress:prog,level:1,now});
assert.equal(plan.dueTotal,8);assert.equal(plan.due.length,ENDINGS_DUE_LIMIT);assert.equal(plan.due[0].key,'8:0');
assert.equal(planEndings({items,progress:prog,level:1,sentencesDue:NEW_ONLY_BELOW-8,now}).fresh.length,0);
assert.equal(planEndings({items,progress:prog,level:1,sentencesDue:NEW_ONLY_BELOW-9,now}).fresh.length,NEW_ENDINGS_PER_DAY);
// Ohne geladene Lücken: nur zählen.
plan=planEndings({items:null,progress:prog,now});assert.equal(plan.dueTotal,8);assert.equal(plan.due.length,0);assert.equal(plan.fresh.length,0);
// Lücken, die es nicht mehr gibt, zählen nicht.
assert.equal(planEndings({items,progress:markEndingAnswered({},'999:0',false,now-DAY),now}).dueTotal,0);
// Karten: neu als Auswahl, fällig zum Schreiben.
assert.equal(endingCard({key:'1:0',isNew:true}).dailyDifficulty,'easy');
assert.equal(endingCard({key:'1:0',isNew:false}).dailyDifficulty,'hard');
assert.deepEqual(alternate([1,2,3],['a']),[1,'a',2,3]);
assert.equal(dueEndingKeys({},now).length,0);
assert.ok(newEndingCandidates(items,{},{level:9,now}).length===0,'no fallback outside the level');
const oneWord={id:'77:0',sentence:sentence(77,1,'Mitä?')};
assert.ok(!newEndingCandidates([oneWord,...items],{},{level:1,now}).some(c=>c.key==='77:0'),'no one-word sentences as fallback');
assert.ok(!newEndingCandidates(items,{},{level:1,now,choosable:i=>i.id.endsWith(':1')}).some(c=>c.key.endsWith(':0')),'only choosable gaps');
console.log('Endungen: Lernstand, Abstände, Zusammenführen und Einplanung in „Wiederholen“ geprüft.');
