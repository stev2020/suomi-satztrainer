// Difficult words for Hyppy, mixed into the basic vocabulary list.
// Evidence: sentences graded "Nochmal"/"Schwer" (reviews and recent events) and missed
// gaps in "Endungen". Looking a word up is NOT evidence (people also tap to read grammar).
// Words are played as base forms with their most frequent German meaning.
const LIMIT=40;
// Hyppy weights unseen words with 2.5 and missed ones (box 0) with 6+: difficult words start
// like a word answered wrong once, so they come up often among the basic vocabulary.
export const DIFFICULT_SEED={box:0,right:0,wrong:1,last:0};
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


export function buildDifficultDeck({lexicon,reviews={},events=[],missed=[]}){
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

const plain=text=>String(text??'').toLocaleLowerCase('fi').replace(/[!?.,…]+/gu,'').trim();

// Add difficult words to a Hyppy list. Words already in the list are not duplicated;
// their existing entry is marked instead. Returns the list and the IDs to prioritise.
export function mixDifficultWords(base,difficult){
 const byTarget=new Map(base.entries.map(e=>[plain(e.target),e]));
 const entries=[...base.entries],ids=[];
 for(const e of difficult.entries){
  const existing=byTarget.get(plain(e.target));
  if(existing){ids.push(existing.id);continue;}
  entries.push({...e,category:'Deine schwierigen Wörter'});ids.push(e.id);
 }
 return {words:{...base,entries},ids:[...new Set(ids)]};
}

// Progress seen by the game: difficult words without own progress start as "missed once".
export function seededProgress(stored,ids){
 const map={...(stored||{})};
 for(const id of ids)if(!map[id])map[id]={...DIFFICULT_SEED};
 return map;
}
