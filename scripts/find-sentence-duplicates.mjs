import fs from 'node:fs';

const input=new URL('../dist/sentences.json',import.meta.url);
const output=new URL('../dist/duplicate-candidates.json',import.meta.url);
const payload=JSON.parse(fs.readFileSync(input,'utf8'));
const cards=[...payload.sentences,...payload.archived_sentences];
const normalize=value=>String(value||'').toLocaleLowerCase('fi').normalize('NFC').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const grams=value=>{
 const padded=`  ${value}  `,result=new Set();
 for(let i=0;i<padded.length-2;i++)result.add(padded.slice(i,i+3));
 return result;
};
const dice=(a,b)=>{
 let shared=0;
 for(const value of a)if(b.has(value))shared++;
 return 2*shared/(a.size+b.size||1);
};
const tokenScore=(a,b)=>{
 let shared=0;
 for(const value of a)if(b.has(value))shared++;
 return shared/(a.size+b.size-shared||1);
};
const prepared=cards.map(card=>({
 id:Number(card.id),text:card.text,level:card.level,normalized:normalize(card.text),
 tokens:new Set(normalize(card.text).split(' ').filter(Boolean)),grams:grams(normalize(card.text))
})).filter(card=>card.id&&card.normalized);
const candidates=[];
for(let i=0;i<prepared.length;i++)for(let j=i+1;j<prepared.length;j++){
 const left=prepared[i],right=prepared[j],longer=Math.max(left.normalized.length,right.normalized.length);
 if(Math.min(left.normalized.length,right.normalized.length)/longer<0.72)continue;
 const exact=left.normalized===right.normalized;
 if(!exact&&left.normalized[0]!==right.normalized[0])continue;
 const character=dice(left.grams,right.grams),words=tokenScore(left.tokens,right.tokens);
 if(!exact&&character<0.9&&!(character>=0.84&&words>=0.8))continue;
 candidates.push({
  left:{id:left.id,text:left.text,level:left.level},
  right:{id:right.id,text:right.text,level:right.level},
  match:exact?'exact':'near',
  similarity:Number((exact?1:Math.max(character,words)).toFixed(4))
 });
}
candidates.sort((a,b)=>b.similarity-a.similarity||a.left.id-b.left.id||a.right.id-b.right.id);
fs.writeFileSync(output,JSON.stringify({version:1,count:candidates.length,candidates},null,2)+'\n');
console.log(`Wrote ${candidates.length} duplicate candidates to ${output.pathname}`);
