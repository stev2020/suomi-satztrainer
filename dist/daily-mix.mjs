// Vanamo – „Wiederholen“ auf der Startseite: fällige Sätze, dazu Verbformen und Endungen.
//
// Endungen funktionieren genauso: fällige kommen mit (ENDINGS_DUE_LIMIT), dazu täglich ein paar
// neue Lücken (NEW_ENDINGS_PER_DAY) – bevorzugt aus schon gelernten Sätzen, sonst aus kurzen
// Sätzen des eigenen Levels. Neue Lücken zeigt die Runde als Auswahl, fällige zum Selberschreiben.
//
// - Fällige Verbformen kommen immer mit (höchstens VERB_DUE_LIMIT pro Runde).
// - Damit auch ohne eigene Verbübung etwas nachkommt, gibt es pro Tag ein paar neue
//   Verbformen (NEW_VERBS_PER_DAY) – aber nur, wenn nicht ohnehin viel fällig ist.
// - Neue Formen kommen nur aus der freigeschalteten Stufe (die wichtigsten Verben zuerst);
//   innerhalb der Stufe zuerst Formen, die genau so in schon gelernten Sätzen stehen.
// - Neue Sätze kommen hier nie dazu; dafür ist der Lernpfad da.
// Die Auswahl ist pro Tag stabil, damit Startseite und Runde dieselben Aufgaben zeigen.
import {PRONOUNS,combinationKey,unlockedVerbCount} from './verb-practice.mjs';

export const VERB_DUE_LIMIT=6;
export const NEW_VERBS_PER_DAY=3;
export const ENDINGS_DUE_LIMIT=4;
export const NEW_ENDINGS_PER_DAY=3;
export const NEW_ONLY_BELOW=12; // ab so vielen fälligen Aufgaben kommt an dem Tag nichts Neues dazu

const DAY=86400000;
export const startOfDay=(now=Date.now())=>{const d=new Date(now);d.setHours(0,0,0,0);return d.getTime();};
const hash=text=>{let h=2166136261;for(const c of String(text)){h^=c.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;};

export function dueVerbKeys(verbs,progress={},now=Date.now()){
 const out=[];
 for(const verb of verbs)for(let person=0;person<PRONOUNS.length;person++){
  const key=combinationKey(verb,person),r=progress[key];
  if(r?.seen&&r.due<=now)out.push({verbId:verb.id,person,key,due:r.due});
 }
 return out.sort((a,b)=>a.due-b.due||a.key.localeCompare(b.key));
}

// Neu heute = genau einmal gefragt, und zwar heute (egal ob hier oder in der Verbübung).
export function newVerbsToday(progress={},now=Date.now()){
 const from=startOfDay(now);
 return Object.values(progress).filter(r=>r?.seen===1&&r.lastAskedAt>=from).length;
}

// Verbformen, die in schon gelernten Sätzen vorkommen: Map verbId → Set der Personen (leer = nur Grundform bekannt).
export function verbsInSentences(verbs,lexicon,sentenceIds){
 const found=new Map();
 if(!lexicon?.sentences||!lexicon.lemmas)return found;
 const byId=new Map(verbs.map(v=>[v.id,v]));
 for(const id of sentenceIds){
  const entry=lexicon.sentences[String(id)];if(!entry?.w)continue;
  const tokens=String(entry.s||'').toLocaleLowerCase('fi').match(/[\p{L}\p{M}'’-]+/gu)||[];
  for(const [li] of entry.w){
   const verb=byId.get(lexicon.lemmas[li]?.[0]);if(!verb)continue;
   if(!found.has(verb.id))found.set(verb.id,new Set());
   verb.forms.forEach((form,person)=>{if(tokens.includes(form.toLocaleLowerCase('fi')))found.get(verb.id).add(person);});
  }
 }
 return found;
}

export function newVerbCandidates(verbs,progress={},{lexicon=null,learnedIds=[],now=Date.now()}={}){
 const day=new Date(startOfDay(now)).toISOString().slice(0,10);
 const unseen=(verb,person)=>!progress[combinationKey(verb,person)]?.seen;
 // Nur die freigeschaltete Stufe (die wichtigsten Verben zuerst, siehe verb-practice.mjs).
 const stage=verbs.slice(0,unlockedVerbCount(verbs,progress));
 const known=verbsInSentences(stage,lexicon,learnedIds);
 const order=list=>list.sort((a,b)=>hash(day+a.key)-hash(day+b.key));
 const item=(verb,person,tier)=>({verbId:verb.id,person,key:combinationKey(verb,person),tier});
 // Zuerst Formen, die genau so in den eigenen Sätzen stehen, dann die Stufe in Listenreihenfolge.
 const exact=[],inOrder=[];
 for(const verb of stage){
  for(const p of known.get(verb.id)||[])if(unseen(verb,p))exact.push(item(verb,p,'sentence'));
  const open=PRONOUNS.map((_,p)=>p).filter(p=>unseen(verb,p));
  const start=hash(day+verb.id)%Math.max(1,open.length);
  for(const p of [...open.slice(start),...open.slice(0,start)])inOrder.push(item(verb,p,known.has(verb.id)?'verb':'stage'));
 }
 // Erst eine Form pro Verb (abwechslungsreich), dann auffüllen.
 const candidates=[...order(exact),...inOrder],usedVerbs=new Set(),usedKeys=new Set(),out=[];
 for(const c of candidates){if(usedVerbs.has(c.verbId)||usedKeys.has(c.key))continue;usedVerbs.add(c.verbId);usedKeys.add(c.key);out.push(c);}
 for(const c of candidates){if(usedKeys.has(c.key))continue;usedKeys.add(c.key);out.push(c);}
 return out;
}

export function planVerbs({verbs,progress={},lexicon=null,learnedIds=[],sentencesDue=0,otherDue=0,now=Date.now()}){
 const dueAll=dueVerbKeys(verbs,progress,now);
 const due=dueAll.slice(0,VERB_DUE_LIMIT).map(v=>({...v,isNew:false}));
 const room=sentencesDue+otherDue+dueAll.length<NEW_ONLY_BELOW;
 const allowance=room?Math.max(0,NEW_VERBS_PER_DAY-newVerbsToday(progress,now)):0;
 const fresh=allowance?newVerbCandidates(verbs,progress,{lexicon,learnedIds,now}).slice(0,allowance).map(v=>({...v,isNew:true})):[];
 return {due,fresh,dueTotal:dueAll.length};
}

// ---------- Endungen ----------
export function dueEndingKeys(progress={},now=Date.now()){
 return Object.entries(progress||{}).filter(([,r])=>r.attempts>0&&r.due<=now).sort((a,b)=>a[1].due-b[1].due||a[0].localeCompare(b[0])).map(([key,r])=>({key,due:r.due}));
}
export const newEndingsToday=(progress={},now=Date.now())=>{const from=startOfDay(now);return Object.values(progress||{}).filter(r=>r.firstAt>=from).length;};

// items: Lücken aus endings-practice.mjs (buildEndingItems). Eine Lücke pro Satz, stabil pro Tag.
// choosable(item): ob sich die Lücke als Auswahl stellen lässt – neue Lücken kommen nur als Auswahl.
export function newEndingCandidates(items,progress={},{learnedIds=new Set(),level=1,now=Date.now(),choosable=()=>true}={}){
 const day=new Date(startOfDay(now)).toISOString().slice(0,10);
 const learned=learnedIds instanceof Set?learnedIds:new Set(learnedIds);
 const open=items.filter(item=>!progress[item.id]);
 const words=item=>String(item.sentence.text).split(/\s+/).length;
 const own=open.filter(item=>learned.has(item.sentence.id)).sort((a,b)=>hash(day+a.id)-hash(day+b.id));
 // Ohne eigene Sätze: kurze (aber nicht Ein-Wort-)Sätze des eigenen Levels zuerst.
 const easy=open.filter(item=>!learned.has(item.sentence.id)&&item.sentence.level===level&&words(item)>=3).sort((a,b)=>words(a)-words(b)||hash(day+a.id)-hash(day+b.id));
 const usedSentences=new Set(),out=[];
 for(const item of [...own,...easy]){if(usedSentences.has(item.sentence.id)||!choosable(item))continue;usedSentences.add(item.sentence.id);out.push({key:item.id,tier:learned.has(item.sentence.id)?'sentence':'level'});if(out.length>=NEW_ENDINGS_PER_DAY*2)break;}
 return out;
}

export function planEndings({items=null,progress={},learnedIds=new Set(),level=1,sentencesDue=0,otherDue=0,now=Date.now(),choosable}){
 const byId=items?new Map(items.map(i=>[i.id,i])):null;
 const dueAll=dueEndingKeys(progress,now);
 // Ohne geladene Lücken zählen wir nur (für die Startseite); planen geht erst mit den Lücken.
 const usable=byId?dueAll.filter(d=>byId.has(d.key)):dueAll;
 const due=byId?usable.slice(0,ENDINGS_DUE_LIMIT).map(d=>({key:d.key,isNew:false})):[];
 const room=sentencesDue+otherDue+usable.length<NEW_ONLY_BELOW;
 const allowance=room&&byId?Math.max(0,NEW_ENDINGS_PER_DAY-newEndingsToday(progress,now)):0;
 const fresh=allowance?newEndingCandidates(items,progress,{learnedIds,level,now,choosable}).slice(0,allowance).map(c=>({...c,isNew:true})):[];
 return {due,fresh,dueTotal:usable.length};
}

// Wechselt zwischen zwei Listen ab (Verbform, Endung, Verbform, …).
export function alternate(a,b){const out=[];for(let i=0;i<Math.max(a.length,b.length);i++){if(i<a.length)out.push(a[i]);if(i<b.length)out.push(b[i]);}return out;}

// Mischt Sätze und andere Aufgaben in kleinen Häppchen: drei Sätze, dann zwei andere.
export function interleave(sentences,others,pattern=[3,2]){
 const a=[...sentences],b=[...others],out=[];
 while(a.length||b.length){out.push(...a.splice(0,pattern[0]));out.push(...b.splice(0,pattern[1]));}
 return out;
}

export const endingCard=e=>({id:'ending:'+e.key,dailyActivity:'endings',dailyDifficulty:e.isNew?'easy':'hard',dailyEnding:{key:e.key,isNew:!!e.isNew}});
export const verbCard=v=>({id:'verb:'+v.key,dailyActivity:'verbs',dailyVerb:{verbId:v.verbId,person:v.person,key:v.key,isNew:!!v.isNew}});
