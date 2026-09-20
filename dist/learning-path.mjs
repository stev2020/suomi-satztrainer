import {REVIEW_KINDS} from './review-plan.mjs';

// Deliberately curated order, independent of the corpus difficulty levels.
// Existing sentence IDs preserve translations, audio, attribution and reviews.
export const EVERYDAY_PATH = [
 {id:'hello',title:'Begrüßung und Kennenlernen',goal:'Begrüßen, dich vorstellen und ins Gespräch kommen.',lessons:[
  {title:'Hallo, ich bin …',ids:[1120788,3374385,1014528,1614474,752738]},
  {title:'Ins Gespräch kommen',ids:[5293640,6950859,879616,3215025,6952522]}]},
 {id:'cafe',title:'Café und Restaurant',goal:'Über Essen sprechen und höflich ein Getränk bestellen.',lessons:[
  {title:'Ein Getränk bestellen',ids:[3108705,3140519,3553416,6936068,13622687]},
  {title:'Zeit zum Essen',ids:[2937690,773331,4332474,7480527,4172279]}]},
 {id:'shopping',title:'Einkaufen',goal:'Nach Waren und Preisen fragen und über Geld sprechen.',lessons:[
  {title:'Im Laden',ids:[879632,7249453,4849982,7665563,2416027]},
  {title:'Preis und Bezahlung',ids:[1179497,7096479,1962157,3103558,5057211]}]},
 {id:'family',title:'Familie',goal:'Über Familie, Freunde und Kinder sprechen.',lessons:[
  {title:'Menschen, die zu dir gehören',ids:[2739999,368199,6636550,6941748,7534066]},
  {title:'Von der Familie erzählen',ids:[773382,4434331,7524511,1160241,4340855]}]},
 {id:'time',title:'Uhrzeit und Termine',goal:'Über Tage, Uhrzeiten und Verabredungen sprechen.',lessons:[
  {title:'Heute und morgen',ids:[13632080,752702,4087599,6684441,6690549]},
  {title:'Sich verabreden',ids:[875108,5501675,6450428,6568236,6909015]}]},
 {id:'travel',title:'Unterwegs in Finnland',goal:'Nach dem Weg fragen und mit Bus und Bahn unterwegs sein.',lessons:[
  {title:'Sich orientieren',ids:[1345952,2805413,7244193,2123229,5128685]},
  {title:'Bus und Bahn',ids:[4476631,4170848,7632431,5249290,6952526]}]},
];
export const PATH_SENTENCE_IDS=new Set(EVERYDAY_PATH.flatMap(t=>t.lessons.flatMap(l=>l.ids)));
export function everydayPathState(sentences,reviews){
 const byId=new Map(sentences.map(s=>[s.id,s]));
 const seen=id=>REVIEW_KINDS.some(kind=>Number(reviews[`${id}:${kind}`]?.repetitions)>0);
 const topics=EVERYDAY_PATH.map(topic=>{
  const lessons=topic.lessons.map((lesson,index)=>{
   const cards=lesson.ids.map(id=>byId.get(id)).filter(s=>s?.translations?.length);
   const remaining=cards.filter(s=>!seen(s.id));
   return {...lesson,index,cards,remaining,seen:cards.length-remaining.length,total:cards.length,complete:cards.length===lesson.ids.length&&!remaining.length};
  });
  return {...topic,lessons,seen:lessons.reduce((n,l)=>n+l.seen,0),total:topic.lessons.reduce((n,l)=>n+l.ids.length,0),complete:lessons.every(l=>l.complete)};
 });
 const topic=topics.find(t=>!t.complete)||null,lesson=topic?.lessons.find(l=>!l.complete)||null;
 return {topics,topic,lesson,seen:topics.reduce((n,t)=>n+t.seen,0),total:PATH_SENTENCE_IDS.size,complete:topics.every(t=>t.complete)};
}
export function homeReviewPool(sentences,level){
 return sentences.filter(s=>s.level===level||PATH_SENTENCE_IDS.has(s.id));
}
