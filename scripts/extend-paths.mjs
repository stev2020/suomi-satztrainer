// Level fill 2026-09-25: append lessons with topic-tagged new sentences to thin topics.
// Existing lessons and their order stay untouched; each topic is topped up to TARGET sentences.
import fs from 'node:fs';
import {LEVEL_PATHS} from '../dist/learning-path-data.mjs';
const TARGET=10;
const fill=JSON.parse(fs.readFileSync(new URL('../sources/level-fill-2026-09-25.json',import.meta.url),'utf8')).sentences;
const deck=JSON.parse(fs.readFileSync(new URL('../dist/sentences.json',import.meta.url),'utf8'));
const active=new Set(deck.sentences.map(s=>s.id));
const used=new Set(Object.values(LEVEL_PATHS).flatMap(t=>t.flatMap(x=>x.lessons.flatMap(l=>l.ids))));
const added=[];
for(const [level,topics] of Object.entries(LEVEL_PATHS)){
 for(const topic of topics){
  const have=topic.lessons.reduce((n,l)=>n+l.ids.length,0);
  if(have>=TARGET)continue;
  const pool=fill.filter(s=>String(s.level)===level&&s.topic===topic.id&&active.has(s.id)&&!used.has(s.id)).sort((a,b)=>a.text.length-b.text.length||a.id-b.id).slice(0,TARGET-have);
  if(!pool.length)continue;
  let part=topic.lessons.length;
  // Fill a short last lesson first, then new lessons of five.
  const ids=pool.map(s=>s.id);ids.forEach(id=>used.add(id));
  const last=topic.lessons.at(-1);
  while(ids.length&&last&&last.ids.length<5)last.ids.push(ids.shift());
  while(ids.length){part++;topic.lessons.push({title:`${topic.title} · Teil ${part}`,ids:ids.splice(0,5)});}
  added.push(`L${level} ${topic.id}: ${have} → ${have+pool.length}`);
 }
}
const body=Object.entries(LEVEL_PATHS).map(([level,topics])=>` ${level}: [\n${topics.map(t=>'  '+JSON.stringify(t)).join(',\n')}\n ]`).join(',\n');
fs.writeFileSync(new URL('../dist/learning-path-data.mjs',import.meta.url),`// Fixed corpus IDs, grouped by existing level and everyday topic.\n// Empty topics reflect gaps in the current corpus; never substitute another level.\n// 2026-09-25: thin topics topped up with reviewed level-fill sentences (scripts/extend-paths.mjs).\nexport const LEVEL_PATHS = {\n${body}\n};\n`);
console.log(added.join('\n'));
