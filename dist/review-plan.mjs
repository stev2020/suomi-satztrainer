// Review only existing, due records; never fill a round with unseen content.
export const REVIEW_KINDS=['fi-de','de-fi','listen','dictation','suchsel'];
export function lastPracticed(sentence,reviews){
 return Math.max(0,...REVIEW_KINDS.map(kind=>Number(reviews[`${sentence.id}:${kind}`]?.updatedAt)||0));
}
export function unseenSentences(sentences,reviews,level){
 return sentences.filter(s=>s.level===level&&s.translations?.length&&!REVIEW_KINDS.some(kind=>reviews[`${s.id}:${kind}`]));
}
export function dueSentences(sentences,reviews,level,now=Date.now()){
 const unique=new Map();
 for(const s of sentences){
  if((level!==null&&s.level!==level)||!s.translations?.length||unique.has(s.id))continue;
  const items=REVIEW_KINDS.filter(kind=>!['listen','dictation'].includes(kind)||s.audios?.length).flatMap(kind=>{
   const r=reviews[`${s.id}:${kind}`];
   return r&&Number.isFinite(r.due)&&r.due<=now?[{kind,r}]:[];
  }).sort((a,b)=>(Number(a.r.updatedAt)||0)-(Number(b.r.updatedAt)||0)||a.r.due-b.r.due);
  if(items.length)unique.set(s.id,{s,items,last:lastPracticed(s,reviews)});
 }
 return [...unique.values()].sort((a,b)=>a.last-b.last||a.items[0].r.due-b.items[0].r.due||a.s.id-b.s.id);
}
export function reviewPlan(sentences,reviews,level,{now=Date.now(),limit=10,translationOffset=0}={}){
 let translated=translationOffset,searchIncluded=false;
 const plan=[];
 for(const {s,items} of dueSentences(sentences,reviews,level,now)){
  const item=searchIncluded?items.find(({kind})=>kind!=='suchsel'):items[0];
  if(!item)continue;
  const {kind}=item,translate=['fi-de','de-fi'].includes(kind);
  plan.push({...s,dailyActivity:translate?'translate':kind,practiceDirection:translate?kind:undefined,
   dailyDifficulty:translate?(translated++%3===2?'hard':'easy'):'hard'});
  if(kind==='suchsel')searchIncluded=true;
  if(plan.length>=limit)break;
 }
 return plan;
}
