// Separate token identities preserve repeated words. Punctuation is not a tile.
export const sentenceWords=text=>String(text).normalize('NFC').split(/\s+/u).map(word=>word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'')).filter(Boolean);
const normalized=word=>word.toLocaleLowerCase().normalize('NFC');
const OPTIONAL_FINNISH_SUBJECTS=new Set(['minä','sinä','me','te']);
const sameWords=(answer,expected)=>answer.length===expected.length&&answer.every((word,i)=>word===expected[i]);
export function finnishSentenceMatches(answerText,expectedText){
 const answer=sentenceWords(answerText).map(normalized),expected=sentenceWords(expectedText).map(normalized);
 if(sameWords(answer,expected))return true;
 let answerIndex=0,omitted=false;
 for(const expectedWord of expected){
  if(answer[answerIndex]===expectedWord){answerIndex++;continue;}
  if(OPTIONAL_FINNISH_SUBJECTS.has(expectedWord)){omitted=true;continue;}
  return false;
 }
 return omitted&&answerIndex===answer.length;
}
function shuffle(items,random){
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
}
export function createWordExercise(sentence,language,corpus,random=Math.random){
 const textOf=s=>language==='fi'?s.text:s.translations[0].text;
 const expected=sentenceWords(textOf(sentence));
 const excluded=new Set(expected.map(normalized));
 const fallback=language==='fi'?['tänään','huomenna','kirja','pöytä','aina','ulkona','joskus','kissa']:['heute','morgen','Buch','Tisch','immer','draußen','manchmal','Katze'];
 const candidates=new Map();
 for(const word of [...corpus.flatMap(s=>sentenceWords(textOf(s))),...fallback])if(!excluded.has(normalized(word)))candidates.set(normalized(word),word);
 const extras=shuffle([...candidates.values()],random).slice(0,1+Math.floor(random()*2));
 const tokens=shuffle([...expected,...extras].map((text,id)=>({text,id})),random);
 // Even with unlucky randomness, never present the complete answer in order.
 if(expected.length>1&&tokens.slice(0,expected.length).every((t,i)=>t.id===i))tokens.push(tokens.shift());
 return {expected,tokens,selected:[],language};
}
export function wordAnswerMatches(exercise){
 const words=exercise.selected.map(id=>exercise.tokens.find(t=>t.id===id)?.text);
 if(new Set(exercise.selected).size!==words.length||words.some(word=>word===undefined))return false;
 if(exercise.language==='fi')return finnishSentenceMatches(words.join(' '),exercise.expected.join(' '));
 const answer=words.map(normalized),expected=exercise.expected.map(normalized);
 return sameWords(answer,expected);
}
