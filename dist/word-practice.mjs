// Separate token identities preserve repeated words. Punctuation is not a tile.
export const sentenceWords=text=>String(text).normalize('NFC').split(/\s+/u).map(word=>word.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'')).filter(Boolean);
const normalized=word=>word.toLocaleLowerCase().normalize('NFC');
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
 return {expected,tokens,selected:[]};
}
export function wordAnswerMatches(exercise){
 const words=exercise.selected.map(id=>exercise.tokens.find(t=>t.id===id)?.text);
 return new Set(exercise.selected).size===words.length&&words.length===exercise.expected.length&&words.every((word,i)=>word!==undefined&&normalized(word)===normalized(exercise.expected[i]));
}
