// "Meine schwierigen Wörter": a Hyppy word list from the learner's own difficulties.
// Evidence: sentences graded "Nochmal"/"Schwer" (reviews and recent events), words looked
// up by tapping, and missed gaps in "Endungen". Words are played as base forms with
// their most frequent German meaning from the word lookup data.
export const MIN_DIFFICULT_WORDS=10;
const LIMIT=40,LOOKUP_KEY='suomi-word-lookups',MAX_LOOKUPS=300;
const STOP=new Set(['olla','ei','ja','minä','sinä','hän','me','te','he','se','tämä','tuo','ne','että','kun','mutta','tai','niin','myös','vain','nyt','jo','vielä','kuin','jos','mikä','kuka','joka','kiitos','hei','joo','no']);
const SKIP_FORM=/^(Name|Ortsname|Abkürzung)\b/u;

export function slug(lemma){
 const map={ä:'a2',ö:'o2',å:'a3'};
 return String(lemma).toLocaleLowerCase('fi').replace(/[äöå]/gu,c=>map[c]).replace(/[^a-z0-9]+/gu,'_').replace(/^_+|_+$/g,'').slice(0,70)||'x';
}

let meaningCache=null,meaningFor=null;
function commonMeanings(lexicon){
 if(meaningFor===lexicon)return meaningCache;
 const counts=new Map();
 for(const entry of Object.values(lexicon.sentences||{}))for(const [li] of entry.w){const [lemma,meaning]=lexicon.lemmas[li];const m=counts.get(lemma)||new Map();m.set(meaning,(m.get(meaning)||0)+1);counts.set(lemma,m);}
 meaningCache=new Map([...counts].map(([lemma,m])=>[lemma,[...m].sort((a,b)=>b[1]-a[1]||a[0].length-b[0].length)[0][0]]));
 meaningFor=lexicon;
 return meaningCache;
}

export function readLookups(storage=globalThis.localStorage){
 try{const list=JSON.parse(storage?.getItem(LOOKUP_KEY)||'[]');return Array.isArray(list)?list.filter(x=>x&&typeof x.lemma==='string'&&Number.isFinite(x.at)):[];}catch{return [];}
}
export function saveLookup(lemma,storage=globalThis.localStorage,now=Date.now()){
 if(!lemma)return;
 try{const list=[...readLookups(storage),{lemma,at:now}].slice(-MAX_LOOKUPS);storage?.setItem(LOOKUP_KEY,JSON.stringify(list));}catch{}
}

export function buildDifficultDeck({lexicon,reviews={},events=[],lookups=[],missed=[]}){
 const weights=new Map(),recency=new Map();
 const add=(lemma,weight,at=0)=>{if(!lemma||STOP.has(lemma.toLocaleLowerCase('fi'))||/\d/u.test(lemma))return;weights.set(lemma,(weights.get(lemma)||0)+weight);recency.set(lemma,Math.max(recency.get(lemma)||0,at));};
 const sentenceWeight=new Map(),sentenceAt=new Map();
 const note=(id,w,at)=>{sentenceWeight.set(id,Math.min(3,(sentenceWeight.get(id)||0)+w));sentenceAt.set(id,Math.max(sentenceAt.get(id)||0,at||0));};
 for(const [key,r] of Object.entries(reviews||{})){
  const m=/^(\d+):(fi-de|de-fi|listen|dictation|suchsel)$/.exec(key);if(!m||!Number.isFinite(r?.interval))continue;
  if(r.interval<=1)note(m[1],1,r.updatedAt);else if(r.interval<4)note(m[1],.45,r.updatedAt);
 }
 for(const e of events||[])if(e?.kind==='sentence'&&e.grade!=='easy')note(String(e.sentenceId),e.grade==='again'?1:.45,e.at);
 for(const [id,w] of sentenceWeight){
  const entry=lexicon.sentences?.[id];if(!entry)continue;
  const seen=new Set();
  for(const [li,fi] of entry.w){const [lemma]=lexicon.lemmas[li];if(seen.has(lemma)||SKIP_FORM.test(lexicon.forms[fi]))continue;seen.add(lemma);add(lemma,w,sentenceAt.get(id));}
 }
 const perLemma=new Map();
 for(const {lemma,at} of lookups){const n=perLemma.get(lemma)||0;if(n>=3)continue;perLemma.set(lemma,n+1);add(lemma,.8,at);}
 for(const key of missed){
  const [id,index]=String(key).split(/:(?=\d+$)/);const item=lexicon.sentences?.[id]?.w?.[Number(index)];
  if(item)add(lexicon.lemmas[item[0]][0],1,Date.now());
 }
 const meanings=commonMeanings(lexicon),usedSources=new Set(),entries=[];
 const ranked=[...weights].filter(([lemma,w])=>w>=.8&&meanings.has(lemma)).sort((a,b)=>b[1]-a[1]||(recency.get(b[0])||0)-(recency.get(a[0])||0));
 for(const [lemma] of ranked){
  const source=meanings.get(lemma),key=source.toLocaleLowerCase('de');
  if(usedSources.has(key))continue;usedSources.add(key);
  entries.push({id:`sw-${slug(lemma)}`,source,target:lemma,lemma,category:'Schwierige Wörter',level:1});
  if(entries.length>=LIMIT)break;
 }
 return {meta:{title:'Meine schwierigen Wörter',sourceLang:'de',targetLang:'fi'},entries};
}
