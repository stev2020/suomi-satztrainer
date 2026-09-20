import {REVIEW_KINDS} from './review-plan.mjs';
import {LEVEL_PATHS} from './learning-path-data.mjs';
export {LEVEL_PATHS};
export const EVERYDAY_PATH=LEVEL_PATHS[1];
export const PATH_SENTENCE_IDS=new Set(Object.values(LEVEL_PATHS).flatMap(topics=>topics.flatMap(t=>t.lessons.flatMap(l=>l.ids))));
export function everydayPathState(sentences,reviews={},level=1){
 const byId=new Map(sentences.filter(s=>s.level===level).map(s=>[s.id,s]));
 const seen=id=>REVIEW_KINDS.some(kind=>Number(reviews[`${id}:${kind}`]?.repetitions)>0);
 const topics=(LEVEL_PATHS[level]||[]).map(topic=>{
  const lessons=topic.lessons.map((lesson,index)=>{
   const cards=lesson.ids.map(id=>byId.get(id)).filter(s=>s?.translations?.length);
   const remaining=cards.filter(s=>!seen(s.id));
   return {...lesson,index,cards,remaining,seen:cards.length-remaining.length,total:lesson.ids.length,complete:cards.length===lesson.ids.length&&!remaining.length};
  });
  const total=lessons.reduce((n,l)=>n+l.total,0);
  return {...topic,lessons,seen:lessons.reduce((n,l)=>n+l.seen,0),total,available:total>0,complete:total>0&&lessons.every(l=>l.complete)};
 });
 const topic=topics.find(t=>t.available&&!t.complete)||null,lesson=topic?.lessons.find(l=>!l.complete)||null;
 const total=topics.reduce((n,t)=>n+t.total,0);
 return {level,topics,topic,lesson,seen:topics.reduce((n,t)=>n+t.seen,0),total,complete:total>0&&topics.every(t=>!t.available||t.complete)};
}
export function homeReviewPool(sentences,level){return sentences.filter(s=>s.level===level);}
