// „Wiederholen“: fällige und neue Verbformen, Tagesgrenze, Bezug zu gelernten Sätzen, Mischung.
import assert from 'node:assert/strict';
import {VERBS} from './dist/verbs-data.mjs';
import {markAsked,markAnswered} from './dist/verb-practice.mjs';
import {planVerbs,newVerbCandidates,newVerbsToday,dueVerbKeys,interleave,verbsInSentences,NEW_VERBS_PER_DAY,VERB_DUE_LIMIT,NEW_ONLY_BELOW} from './dist/daily-mix.mjs';

const now=new Date('2026-09-30T12:00:00').getTime(),DAY=86400000;

// Neuling: nichts fällig → genau NEW_VERBS_PER_DAY neue Formen, alle aus verschiedenen Verben.
let plan=planVerbs({verbs:VERBS,progress:{},now});
assert.equal(plan.due.length,0);
assert.equal(plan.fresh.length,NEW_VERBS_PER_DAY);
assert.equal(new Set(plan.fresh.map(v=>v.verbId)).size,NEW_VERBS_PER_DAY);
assert.ok(plan.fresh.every(v=>v.isNew));
// Stabil über den Tag: gleiche Eingabe → gleiche Auswahl.
assert.deepEqual(planVerbs({verbs:VERBS,progress:{},now:now+3600000}).fresh,plan.fresh);

// Einmal heute gefragt zählt als „neu heute“ und verkleinert das Kontingent.
let progress=markAsked({},plan.fresh[0].key,now);
progress=markAnswered(progress,plan.fresh[0].key,true,now);
assert.equal(newVerbsToday(progress,now),1);
assert.equal(planVerbs({verbs:VERBS,progress,now}).fresh.length,NEW_VERBS_PER_DAY-1);
// Am nächsten Tag ist sie nicht mehr „neu heute“ – und nach einem Tag fällig.
plan=planVerbs({verbs:VERBS,progress,now:now+DAY+1000});
assert.equal(plan.fresh.length,NEW_VERBS_PER_DAY);
assert.deepEqual(plan.due.map(v=>v.key),[plan.due[0].key]);

// Viel fällig → keine neuen Formen; fällige werden gedeckelt.
progress={};
for(const verb of VERBS.slice(0,20)){const key=verb.id+':0';progress=markAsked(progress,key,now-5*DAY);progress=markAnswered(progress,key,false,now-5*DAY);}
plan=planVerbs({verbs:VERBS,progress,now});
assert.equal(plan.dueTotal,20);
assert.equal(plan.due.length,VERB_DUE_LIMIT);
assert.equal(plan.fresh.length,0);
// Wenig fällig, aber viele Sätze fällig → ebenfalls nichts Neues.
assert.equal(planVerbs({verbs:VERBS,progress:{},sentencesDue:NEW_ONLY_BELOW,now}).fresh.length,0);
assert.equal(planVerbs({verbs:VERBS,progress:{},sentencesDue:NEW_ONLY_BELOW-1,now}).fresh.length,NEW_VERBS_PER_DAY);
// Fällige kommen nach Fälligkeit sortiert.
const due=dueVerbKeys(VERBS,progress,now);assert.ok(due.every((v,i)=>!i||due[i-1].due<=v.due));

// Stufe: neue Formen nur aus den ersten fünf Verben (olla, tehdä, mennä, tulla, saada).
const stage=new Set(VERBS.slice(0,5).map(v=>v.id));
assert.ok(planVerbs({verbs:VERBS,progress:{},now}).fresh.every(v=>stage.has(v.verbId)),'new forms come from the first stage');
// Bezug zu gelernten Sätzen: genaue Form aus dem Satz zuerst – innerhalb der Stufe.
const olla=VERBS.find(v=>v.id==='olla'),menna=VERBS.find(v=>v.id==='mennä'),asua=VERBS.find(v=>v.id==='asua');
const lexicon={lemmas:[['minä','ich'],['olla','sein'],['kotona','zu Hause'],['mennä','gehen'],['asua','wohnen'],['Helsinki','Helsinki']],forms:['x'],sentences:{
 '1':{s:'Minä olen kotona.',w:[[0,0],[1,0],[2,0]]},
 '2':{s:'He menevät kotiin.',w:[[3,0]]},
 '3':{s:'Minä asun Helsingissä.',w:[[0,0],[4,0],[5,0]]}}};
const known=verbsInSentences(VERBS,lexicon,[1,2,3]);
assert.deepEqual([...known.get('olla')],[0]);
assert.deepEqual([...known.get('mennä')],[5]);
assert.deepEqual([...known.get('asua')],[0]);
const cands=newVerbCandidates(VERBS,{},{lexicon,learnedIds:[1,2,3],now});
assert.deepEqual(cands.slice(0,2).map(c=>c.key).sort(),['mennä:5','olla:0']);
assert.ok(cands.slice(0,2).every(c=>c.tier==='sentence'));
assert.ok(!cands.some(c=>c.verbId==='asua'),'verbs outside the stage wait, even if they occur in own sentences');
assert.equal(new Set(cands.slice(0,5).map(c=>c.verbId)).size,5,'first one form per verb');
// Schon gesehene Form → andere Personen desselben Verbs bleiben Kandidaten.
const seen=markAsked({},'olla:0',now-2*DAY);
const next=newVerbCandidates(VERBS,seen,{lexicon,learnedIds:[1],now});
assert.ok(next.some(c=>c.verbId==='olla'&&c.person!==0));assert.ok(!next.some(c=>c.key==='olla:0'));
// Nicht gelernter Satz zählt nicht.
assert.equal(verbsInSentences(VERBS,lexicon,[]).size,0);
// Fast alles in der Stufe gesehen → trotzdem genug neue Formen (nächste Stufe oder auffüllen).
let most={};for(const v of VERBS.slice(0,5))for(let p=0;p<5;p++)most=markAsked(most,v.id+':'+p,now-3*DAY);
assert.ok(newVerbCandidates(VERBS,most,{now}).length>=NEW_VERBS_PER_DAY);

// Mischung: drei Sätze, zwei andere, Rest hinten.
assert.deepEqual(interleave([1,2,3,4,5,6,7],['a','b','c']),[1,2,3,'a','b',4,5,6,'c',7]);
assert.deepEqual(interleave([],['a','b']),['a','b']);
assert.equal(olla.forms[0],'olen');assert.equal(menna.forms[5],'menevät');assert.equal(asua.forms[0],'asun');
console.log('Wiederholen-Mischung: fällige und neue Verbformen, Tageskontingent, Satzbezug und Reihenfolge geprüft.');
