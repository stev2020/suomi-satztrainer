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

// Bezug zu gelernten Sätzen: genaue Form aus dem Satz zuerst.
const asua=VERBS.find(v=>v.id==='asua'),haluta=VERBS.find(v=>v.id==='haluta');
const lexicon={lemmas:[['minä','ich'],['asua','wohnen'],['Helsinki','Helsinki'],['haluta','wollen']],forms:['x'],sentences:{
 '1':{s:'Minä asun Helsingissä.',w:[[0,0],[1,0],[2,0]]},
 '2':{s:'He haluavat kahvia.',w:[[3,0]]}}};
const known=verbsInSentences(VERBS,lexicon,[1,2]);
assert.deepEqual([...known.get('asua')],[0]);
assert.deepEqual([...known.get('haluta')],[5]);
const cands=newVerbCandidates(VERBS,{},{lexicon,learnedIds:[1,2],now});
assert.deepEqual(cands.slice(0,2).map(c=>c.key).sort(),['asua:0','haluta:5']);
assert.ok(cands.slice(0,2).every(c=>c.tier==='sentence'));
// Schon gesehene Form → nächste Person desselben Verbs.
const seen=markAsked({},'asua:0',now-2*DAY);
const next=newVerbCandidates(VERBS,seen,{lexicon,learnedIds:[1],now});
assert.equal(next[0].verbId,'asua');assert.notEqual(next[0].person,0);assert.equal(next[0].tier,'verb');
// Nicht gelernter Satz zählt nicht.
assert.equal(verbsInSentences(VERBS,lexicon,[]).size,0);

// Mischung: drei Sätze, zwei andere, Rest hinten.
assert.deepEqual(interleave([1,2,3,4,5,6,7],['a','b','c']),[1,2,3,'a','b',4,5,6,'c',7]);
assert.deepEqual(interleave([],['a','b']),['a','b']);
assert.equal(asua.forms[0],'asun');assert.equal(haluta.forms[5],'haluavat');
console.log('Wiederholen-Mischung: fällige und neue Verbformen, Tageskontingent, Satzbezug und Reihenfolge geprüft.');
