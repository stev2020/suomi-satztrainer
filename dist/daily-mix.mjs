// Vanamo – „Wiederholen“ auf der Startseite: fällige Sätze, dazu Verbformen.
//
// - Fällige Verbformen kommen immer mit (höchstens VERB_DUE_LIMIT pro Runde).
// - Damit auch ohne eigene Verbübung etwas nachkommt, gibt es pro Tag ein paar neue
//   Verbformen (NEW_VERBS_PER_DAY) – aber nur, wenn nicht ohnehin viel fällig ist.
// - Neue Formen stammen bevorzugt aus Sätzen, die man schon gelernt hat: erst die genaue
//   Form aus dem Satz (z. B. „asun“ → minä · asua), dann andere Personen dieser Verben.
// - Neue Sätze kommen hier nie dazu; dafür ist der Lernpfad da.
// Die Auswahl ist pro Tag stabil, damit Startseite und Runde dieselben Aufgaben zeigen.
import {PRONOUNS,combinationKey} from './verb-practice.mjs';

export const VERB_DUE_LIMIT=6;
export const NEW_VERBS_PER_DAY=3;
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
 const known=verbsInSentences(verbs,lexicon,learnedIds);
 const order=list=>list.sort((a,b)=>hash(day+a.key)-hash(day+b.key));
 const item=(verb,person,tier)=>({verbId:verb.id,person,key:combinationKey(verb,person),tier});
 const exact=[],sameVerb=[],other=[];
 for(const verb of verbs){
  const persons=known.get(verb.id);
  if(persons){
   for(const p of persons)if(unseen(verb,p))exact.push(item(verb,p,'sentence'));
   const rest=PRONOUNS.map((_,p)=>p).filter(p=>!persons.has(p)&&unseen(verb,p));
   if(rest.length)sameVerb.push(item(verb,rest[hash(day+verb.id)%rest.length],'verb'));
  }
 }
 // Ohne Bezug zu eigenen Sätzen: die Liste ist nach Häufigkeit sortiert, also vorne anfangen.
 for(const verb of verbs){
  if(known.has(verb.id))continue;
  const open=PRONOUNS.map((_,p)=>p).filter(p=>unseen(verb,p));
  if(open.length)other.push(item(verb,open[hash(day+verb.id)%open.length],'common'));
  if(other.length>=NEW_VERBS_PER_DAY*2)break;
 }
 // Höchstens eine neue Form pro Verb, damit es abwechslungsreich bleibt.
 const seenVerbs=new Set(),out=[];
 for(const c of [...order(exact),...order(sameVerb),...other]){if(seenVerbs.has(c.verbId))continue;seenVerbs.add(c.verbId);out.push(c);}
 return out;
}

export function planVerbs({verbs,progress={},lexicon=null,learnedIds=[],sentencesDue=0,now=Date.now()}){
 const dueAll=dueVerbKeys(verbs,progress,now);
 const due=dueAll.slice(0,VERB_DUE_LIMIT).map(v=>({...v,isNew:false}));
 const room=sentencesDue+dueAll.length<NEW_ONLY_BELOW;
 const allowance=room?Math.max(0,NEW_VERBS_PER_DAY-newVerbsToday(progress,now)):0;
 const fresh=allowance?newVerbCandidates(verbs,progress,{lexicon,learnedIds,now}).slice(0,allowance).map(v=>({...v,isNew:true})):[];
 return {due,fresh,dueTotal:dueAll.length};
}

// Mischt Sätze und andere Aufgaben in kleinen Häppchen: drei Sätze, dann zwei andere.
export function interleave(sentences,others,pattern=[3,2]){
 const a=[...sentences],b=[...others],out=[];
 while(a.length||b.length){out.push(...a.splice(0,pattern[0]));out.push(...b.splice(0,pattern[1]));}
 return out;
}

export const verbCard=v=>({id:'verb:'+v.key,dailyActivity:'verbs',dailyVerb:{verbId:v.verbId,person:v.person,key:v.key,isNew:!!v.isNew}});
