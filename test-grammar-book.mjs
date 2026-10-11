// Grammatik-Buch: Die Seite kennt nur Bausteine, der Inhalt liegt je Kurs und Erklärsprache in grammar-book/.
// Geprüft wird, dass jeder Inhalt zu den Bausteinen passt und die reinen Helfer stimmen.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BOOKS,BOOK_VERSION,BLOCK_TYPES,hasBook,stationsByTopic,neighbours,inlineParts,wordParts,builderMarks,sentenceParts} from './dist/grammar-book.mjs';
import {LEVEL_PATHS} from './dist/learning-path-data.mjs';
import {GRAMMAR_TOPICS} from './dist/grammar-topics.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('./dist/'+p,import.meta.url),'utf8'));
const text=p=>fs.readFileSync(new URL('./dist/'+p,import.meta.url),'utf8');
assert(hasBook('fi','de'));assert(!hasBook('fi','en'),'ohne Ordner kein Buch');assert(!hasBook('sv','de'));

const ACTIVITIES=['translate','listen','dictation','writing','grammar','verbs','suchsel','endings','dialogs'];
const topicIds=new Set(Object.values(LEVEL_PATHS).flatMap(topics=>topics.map(t=>t.id)));
const sw=text('sw.js');
let chapters=0,blocks=0;
for(const [course,byUi] of Object.entries(BOOKS))for(const [ui,base] of Object.entries(byUi)){
 const book=read(base+'index.json');
 assert.equal(book.course,course);assert.equal(book.ui,ui);
 assert(book.title&&book.lead);
 assert(sw.includes(`'./${base}index.json?v=${BOOK_VERSION}'`),'Inhaltsverzeichnis steht offline bereit');
 const ids=book.chapters.map(c=>c.id);assert.equal(new Set(ids).size,ids.length,'Kapitel-IDs sind eindeutig');
 assert.deepEqual(book.chapters.map(c=>c.number),book.chapters.map((_,i)=>String(i+1)),'Kapitel sind fortlaufend nummeriert');
 for(const meta of book.chapters){
  assert(/^[a-z0-9-]+$/.test(meta.id),'Kapitel-ID taugt als Adresse');
  assert(meta.title&&meta.summary);assert(book.groups.some(g=>g.id===meta.group),`${meta.id}: Gruppe bekannt`);
  assert(sw.includes(`'./${base}${meta.id}.json?v=${BOOK_VERSION}'`),`${meta.id} steht offline bereit`);
  const chapter=read(`${base}${meta.id}.json`);chapters++;
  assert.equal(chapter.id,meta.id);assert(chapter.blocks.length>=4);
  assert.equal(chapter.blocks[0].type,'rule','beginnt mit der Kernaussage');
  assert.equal(chapter.blocks.at(-1).type,'practice','endet mit dem Knopf zur Übung');
  for(const block of chapter.blocks){
   blocks++;const where=`${meta.id}/${block.type}`;
   assert(BLOCK_TYPES.includes(block.type),`${where}: Baustein bekannt`);
   if(block.type!=='rule'&&block.type!=='practice')assert(block.title,`${where}: Überschrift`);
   if(block.type==='rule'||block.type==='text'){assert(block.text);assert.equal((block.text.match(/\*/g)||[]).length%2,0,`${where}: Sternchen paarweise`);}
   if(block.type==='groups')for(const item of block.items)assert(item.label&&item.letters.length);
   if(block.type==='uses')for(const item of block.items)assert(item.label&&item.target&&item.source);
   if(block.type==='table')for(const row of block.rows){assert.equal(row.cells.length,block.columns.length,where);if(row.sources)assert.equal(row.sources.length,block.columns.length,where);}
   if(block.type==='grid')for(const w of block.words){assert.equal(w.rows.length,block.rowLabels.length,where);for(const cells of w.rows)assert.equal(cells.length,block.columns.length,where);}
   if(block.type==='builder')for(const w of block.words){
    assert(w.word&&w.result&&w.source,`${where}: ${w.word}`);
    const {wordAt,resultAt}=builderMarks(w);
    if(w.wordMark)assert(wordAt>=0,`${where}: ${w.wordMark} steht in ${w.word}`);
    if(w.resultMark)assert.equal(w.result.slice(resultAt,resultAt+w.resultMark.length),w.resultMark,`${where}: ${w.resultMark} steht in ${w.result}`);
   }
   if(block.type==='sentence'){
    const parts=sentenceParts(block.target,block.tokens);
    assert.equal(parts.map(p=>p.text).join(''),block.target,`${where}: Satz bleibt vollständig`);
    assert.equal(parts.filter(p=>p.token!==undefined).length,block.tokens.length,`${where}: jedes Wort steht im Satz`);
    for(const token of block.tokens)assert(token.form&&token.note,where);
   }
   if(block.type==='contrast'){assert(block.a.label&&block.b.label);for(const pair of block.pairs)for(const side of ['a','b'])assert(pair[side].target&&pair[side].source,where);}
   if(block.type==='quiz')for(const item of block.items){assert.equal(item.options.length,2,where);assert(item.answer===0||item.answer===1,where);assert.notEqual(item.options[0],item.options[1],where);}
   if(block.type==='practice'){
    assert(block.label);assert(ACTIVITIES.includes(block.activity),`${where}: Übung bekannt`);
    if(block.activity==='grammar')assert(GRAMMAR_TOPICS.some(t=>t.id===block.topic),`${where}: Grammatikthema ${block.topic} gibt es`);
   }
  }
 }
 // Stationen: jedes Kapitel höchstens einmal, vor einem Thema, das es im Lernpfad gibt.
 const stations=stationsByTopic(book);
 assert.equal(stations.size,book.stations.length);
 for(const s of book.stations){assert(ids.includes(s.chapter),`Station ${s.chapter}`);assert(topicIds.has(s.before),`Thema ${s.before} gibt es im Lernpfad`);}
 assert.equal(new Set(book.stations.map(s=>s.chapter)).size,book.stations.length);
 const order=LEVEL_PATHS[1].map(t=>t.id).filter(id=>stations.has(id)).map(id=>stations.get(id).id);
 assert.deepEqual(order,ids.filter(id=>order.includes(id)),'Stationen kommen in Lesereihenfolge');
 assert.equal(neighbours(book,ids[0]).previous,null);assert.equal(neighbours(book,ids[0]).next.id,ids[1]);assert.equal(neighbours(book,ids.at(-1)).next,null);
}

assert.deepEqual(inlineParts('*talossa* heißt „im Haus“'),[{text:'talossa',target:true},{text:' heißt „im Haus“',target:false}]);
assert.deepEqual(inlineParts('ohne'),[{text:'ohne',target:false}]);
assert.deepEqual(wordParts('kukan',{mark:'k',at:2,tone:'b'}),[{text:'ku',tone:''},{text:'k',tone:'mark-b'},{text:'an',tone:''}]);
assert.deepEqual(wordParts('talo',{marks:[{chars:'aou',tone:'a'}]}).map(p=>p.text+':'+p.tone),['t:','a:a','l:','o:a']);
assert.deepEqual(builderMarks({word:'jalka',result:'jalan',wordMark:'k',resultMark:''}),{wordAt:3,resultAt:-1});
assert.deepEqual(builderMarks({word:'vesi',result:'vettä',resultMark:'tä'}),{wordAt:-1,resultAt:3});
assert.deepEqual(sentenceParts('Juon kahvia.',[{text:'kahvia'}]),[{text:'Juon '},{text:'kahvia',token:0},{text:'.'}]);

// Die Seite selbst enthält keinen Kursinhalt: kein finnisches Beispielwort im Code.
const code=text('grammar-book.mjs').replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/.*$/gm,'');
for(const word of ['talo','kahvi','kauppa','partitiv','vokal'])assert(!code.toLowerCase().includes(word),`grammar-book.mjs ist frei von Inhalt (${word})`);
const html=text('index.html');
assert(html.includes('data-home-tab-button="grammar"')&&html.includes('data-home-panel="grammar"')&&html.includes('id="grammar-view"'));
for(const f of ['./grammar-book.css?v=1','./grammar-book.mjs?v=1'])assert(sw.includes(`'${f}'`),`sw.js: ${f}`);
console.log(`PASS: Grammatik-Buch – ${chapters} Kapitel, ${blocks} Bausteine, Stationen und Helfer.`);
