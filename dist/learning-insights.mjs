const MAX_EVENTS=500;
const SENTENCE_ACTIVITIES=new Set(['translate','listen','dictation','suchsel','grammar']);
const GRADES=new Set(['again','hard','easy']);
const STOP_WORDS=new Set(['ja','on','ei','se','että','kun','niin','mutta','tai','minä','sinä','hän','me','te','he','tämä','tuo','ne','olen','olet','oli','ovat','olla','myös','vain','nyt','jo','vielä','kuin','jos','en','et','emme','ette','eivät']);
const score=grade=>grade==='easy'?1:grade==='hard'?.55:0;
const normalizedWord=value=>String(value||'').normalize('NFC').toLocaleLowerCase('fi').replace(/^[^a-zäöå]+|[^a-zäöå]+$/gu,'');
const words=text=>[...new Set(String(text||'').split(/\s+/u).map(normalizedWord).filter(word=>word.length>2&&!STOP_WORDS.has(word)))];

export function validatePerformanceEvents(input=[]){
 if(!Array.isArray(input)||input.length>MAX_EVENTS*2)throw new Error('Ungültige Fehlerstatistik.');
 return input.map(event=>{
  if(!event||typeof event!=='object'||Array.isArray(event)||typeof event.id!=='string'||event.id.length>100||!Number.isSafeInteger(event.at)||event.at<0||event.at>8640000000000000)throw new Error('Ungültige Fehlerstatistik.');
  if(event.kind==='sentence'){
   if(!Number.isSafeInteger(event.sentenceId)||event.sentenceId<1||!SENTENCE_ACTIVITIES.has(event.activity)||!GRADES.has(event.grade))throw new Error('Ungültige Fehlerstatistik.');
   return {id:event.id,at:event.at,kind:'sentence',sentenceId:event.sentenceId,activity:event.activity,grade:event.grade,direction:['fi-de','de-fi'].includes(event.direction)?event.direction:'fi-de',difficulty:event.difficulty==='easy'?'easy':'hard',grammarTopic:typeof event.grammarTopic==='string'?event.grammarTopic.slice(0,40):''};
  }
  if(event.kind==='verb'){
   if(typeof event.verbId!=='string'||!/^[a-zäöå]+$/u.test(event.verbId)||!Number.isInteger(event.person)||event.person<0||event.person>5||typeof event.correct!=='boolean')throw new Error('Ungültige Fehlerstatistik.');
   return {id:event.id,at:event.at,kind:'verb',verbId:event.verbId,person:event.person,correct:event.correct};
  }
  throw new Error('Ungültige Fehlerstatistik.');
 }).sort((a,b)=>a.at-b.at).slice(-MAX_EVENTS);
}

export function addPerformanceEvent(events,event,random=Math.random){
 const at=Number.isSafeInteger(event.at)?event.at:Date.now();
 const id=`${at.toString(36)}-${Math.floor(random()*0x100000000).toString(36)}`;
 return validatePerformanceEvents([...(Array.isArray(events)?events:[]),{...event,id,at}]);
}

export function mergePerformanceEvents(a=[],b=[]){
 const unique=new Map();
 for(const event of [...validatePerformanceEvents(a),...validatePerformanceEvents(b)])unique.set(event.id,event);
 return [...unique.values()].sort((x,y)=>x.at-y.at).slice(-MAX_EVENTS);
}

function reviewSnapshot(reviews){
 const out=[];
 for(const [key,value] of Object.entries(reviews||{})){
  const match=/^(\d+):(fi-de|de-fi|listen|dictation|suchsel)$/.exec(key);
  if(!match||!value||!Number.isFinite(value.interval))continue;
  out.push({sentenceId:Number(match[1]),activity:['fi-de','de-fi'].includes(match[2])?'translate':match[2],strength:value.interval<=1?0:value.interval<4?.55:1,at:Number(value.updatedAt)||0});
 }
 return out;
}

function rates(items,key){
 const groups=new Map();
 for(const item of items){const id=key(item);if(!id)continue;const group=groups.get(id)||[];group.push(item);groups.set(id,group);}
 return [...groups].map(([id,list])=>({id,list,attempts:list.length,average:list.reduce((sum,item)=>sum+item.strength,0)/list.length}));
}

export function buildLearningInsights({sentences=[],grammar={},grammarTopics=[],reviews={},verbProgress={},verbs=[],pronouns=[],events=[]}={}){
 const sentenceById=new Map(sentences.map(sentence=>[Number(sentence.id),sentence]));
 const recent=validatePerformanceEvents(events);
 const sentenceEvents=recent.filter(event=>event.kind==='sentence').map(event=>({...event,strength:score(event.grade)}));
 const snapshots=reviewSnapshot(reviews),evidence=[...snapshots,...sentenceEvents];
 const wordMap=new Map();
 for(const item of evidence){
  if(item.strength>=.75)continue;
  const sentence=sentenceById.get(item.sentenceId);if(!sentence)continue;
  for(const word of words(sentence.text)){
   const stat=wordMap.get(word)||{label:word,weight:0,sentenceIds:new Set(),at:0};
   stat.weight+=1-item.strength;stat.sentenceIds.add(item.sentenceId);stat.at=Math.max(stat.at,item.at||0);wordMap.set(word,stat);
  }
 }
 const difficultWords=[...wordMap.values()].filter(item=>item.weight>=1.5||item.sentenceIds.size>=2).sort((a,b)=>b.weight-a.weight||b.at-a.at).slice(0,5);
 const verbItems=[];
 for(const [key,value] of Object.entries(verbProgress||{})){
  const match=/^(.+):([0-5])$/.exec(key);if(!match||!value?.attempts||!value.errors)continue;
  const verb=verbs.find(item=>item.id===match[1]);if(!verb)continue;
  const person=Number(match[2]),errorRate=value.errors/value.attempts;
  verbItems.push({key,label:`${verb.id} · ${pronouns[person]}`,detail:verb.de,errorRate,attempts:value.attempts,updatedAt:value.updatedAt||0});
 }
 verbItems.sort((a,b)=>b.errorRate-a.errorRate||b.attempts-a.attempts||b.updatedAt-a.updatedAt);
 const grammarSnapshots=[];
 for(const item of snapshots){
  const sentence=sentenceById.get(item.sentenceId),entry=grammar[String(item.sentenceId)];if(!sentence||entry?.sentence!==sentence.text||!Array.isArray(entry.notes))continue;
  for(const topic of grammarTopics)if(entry.notes.some(note=>topic.match?.test(note.title)))grammarSnapshots.push({...item,grammarTopic:topic.id});
 }
 const topicRates=rates([...grammarSnapshots,...sentenceEvents.filter(event=>event.activity==='grammar')],event=>event.grammarTopic);
 const grammarTargets=topicRates.filter(item=>item.attempts>=2&&item.average<.75).sort((a,b)=>a.average-b.average||b.attempts-a.attempts);
 const activityItems=rates(evidence,item=>item.activity==='translate'?'translate':item.activity==='listen'?'listen':'').filter(item=>item.attempts>=2).sort((a,b)=>a.average-b.average);
 const weakestActivity=activityItems[0];
 const improvements=rates(sentenceEvents,event=>event.activity==='grammar'&&event.grammarTopic?`grammar:${event.grammarTopic}`:event.activity).map(group=>{
  const ordered=[...group.list].sort((a,b)=>a.at-b.at),half=Math.min(4,Math.floor(ordered.length/2));if(half<2)return null;
  const average=list=>list.reduce((sum,item)=>sum+item.strength,0)/list.length;
  return {...group,delta:average(ordered.slice(-half))-average(ordered.slice(-half*2,-half)),sentenceIds:ordered.slice(-half).map(item=>item.sentenceId)};
 }).filter(Boolean).sort((a,b)=>b.delta-a.delta);
 const improved=improvements.find(item=>item.delta>=.2);
 return {
  words:{ready:!!difficultWords.length,labels:difficultWords.map(item=>item.label),sentenceIds:[...new Set(difficultWords.flatMap(item=>[...item.sentenceIds]))].slice(0,10)},
  verbs:{ready:!!verbItems.length,items:verbItems.slice(0,4),keys:verbItems.slice(0,10).map(item=>item.key)},
  grammar:{ready:!!grammarTargets.length,topicId:grammarTargets[0]?.id||'',average:grammarTargets[0]?.average??null,sentenceIds:grammarTargets[0]?.list.map(item=>item.sentenceId)||[]},
  activity:{ready:!!weakestActivity,activity:weakestActivity?.id||'',average:weakestActivity?.average??null,attempts:weakestActivity?.attempts||0,sentenceIds:weakestActivity?.list.filter(item=>item.strength<.75).map(item=>item.sentenceId).slice(-10)||[],comparison:Object.fromEntries(activityItems.map(item=>[item.id,item.average]))},
  improved:{ready:!!improved,id:improved?.id||'',delta:improved?.delta||0,sentenceIds:improved?.sentenceIds||[]},eventCount:recent.length
 };
}
