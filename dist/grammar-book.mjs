// Vanamo – das Grammatik-Buch: kurze Kapitel, die ein Thema am Stück erklären, mit Bausteinen zum Anfassen.
//
// Die Seite kennt nur Bausteine, keinen Inhalt. Der Inhalt liegt je Kurs und Erklärsprache in
//   grammar-book/<kurs>-<sprache>/index.json   – Kapitelliste, Gruppen, Stationen im Lernpfad
//   grammar-book/<kurs>-<sprache>/<kapitel>.json – die Bausteine eines Kapitels, der Reihe nach
// Kommt eine Lernsprache dazu, kommt ein Ordner dazu und ein Eintrag in BOOKS – am Code ändert sich nichts.
// Erklärt wird je Sprachpaar (Finnisch erklärt man Deutschen anders als Engländern); ohne passenden
// Ordner gibt es für diese Oberflächensprache kein Buch, und Reiter wie Stationen bleiben weg.
//
// Bausteine (Feld "type" im Kapitel):
//   rule      Kernaussage oben, etwas größer            {text}
//   text      Absatz mit Überschrift                     {title,text}
//   groups    Zeilen: Zeichen · Bezeichnung · Hinweis    {title,items:[{label,letters[],note,tone?}]}
//   uses      Zeilen: Wann · Beispiel mit Übersetzung    {title,items:[{label,target,source}]}
//   table     kleine Tabelle                             {title,columns[],rows:[{label,cells[],sources[]?}]}
//   builder   Wort wählen, Form ansehen                  {title,note?,marks?,words:[{word,result,…}]}
//   grid      ein Wort durch alle Formen schalten        {title,columns[],rowLabels[],words:[{word,source,rows[][]}]}
//   sentence  Beispielsatz, einzelne Wörter antippbar    {title,target,source,tokens:[{text,form,note}]}
//   contrast  Umschalter zwischen zwei Lesarten          {title,a:{label},b:{label},pairs:[{a:{target,source},b:{…}}]}
//   quiz      kurze Fragen mit zwei Antworten            {title,items:[{prompt,source,options[],answer}]}
//   practice  Knopf zur passenden Übung                  {label,activity,topic?}
// Unbekannte Bausteine werden übersprungen, damit ein neuer Inhalt eine alte Seite nicht bricht.
// In Fließtext steht Lernsprache zwischen Sternchen: "*talossa* heißt …".

export const BOOKS={fi:{de:'grammar-book/fi-de/'}};
export const BOOK_VERSION=1;
const READ_KEY='vanamo-grammar-read';
export const HASH='grammatik';

export const hasBook=(course,ui)=>!!BOOKS[course]?.[ui];

const cache=new Map();
function getJSON(url){
 if(!cache.has(url))cache.set(url,fetch(url).then(r=>{if(!r.ok)throw new Error('load');return r.json();}).catch(error=>{cache.delete(url);throw error;}));
 return cache.get(url);
}
export async function loadBook(course,ui){
 const base=BOOKS[course]?.[ui];if(!base)return null;
 const index=await getJSON(`${base}index.json?v=${BOOK_VERSION}`);
 return {...index,base};
}
export async function loadChapter(book,id){
 const meta=book?.chapters.find(c=>c.id===id);if(!meta)return null;
 const chapter=await getJSON(`${book.base}${id}.json?v=${BOOK_VERSION}`);
 return {...meta,...chapter};
}

// ---- reine Helfer (auch in test-grammar-book.mjs geprüft) ----

/** Route-Station je Thema des Lernpfads: {themaId → Kapitel}. Unbekannte Kapitel fallen weg. */
export function stationsByTopic(book){
 const out=new Map();
 for(const s of book?.stations||[]){const chapter=book.chapters.find(c=>c.id===s.chapter);if(chapter&&s.before)out.set(s.before,chapter);}
 return out;
}
/** Nachbarn eines Kapitels in Lesereihenfolge. */
export function neighbours(book,id){
 const i=book.chapters.findIndex(c=>c.id===id);
 return {previous:i>0?book.chapters[i-1]:null,next:i>=0&&i<book.chapters.length-1?book.chapters[i+1]:null};
}
/** "*talossa* heißt" → [{text:'talossa',target:true},{text:' heißt',target:false}] */
export function inlineParts(text){
 return String(text??'').split(/\*([^*]+)\*/).map((part,i)=>({text:part,target:i%2===1})).filter(p=>p.text);
}
/** Teilt ein Wort in Stücke mit Farbton: zuerst das markierte Stück (mark an Stelle at), sonst Zeichen für Zeichen nach marks. */
export function wordParts(word,{mark='',at=-1,tone='a',marks=[]}={}){
 const parts=[],push=(text,t)=>{if(!text)return;const last=parts.at(-1);if(last&&last.tone===t)last.text+=text;else parts.push({text,tone:t});};
 const toneOf=ch=>marks.find(m=>m.chars.includes(ch.toLowerCase()))?.tone||'';
 const plain=text=>{for(const ch of text)push(ch,toneOf(ch));};
 if(mark&&at>=0&&word.slice(at,at+mark.length)===mark){plain(word.slice(0,at));push(mark,'mark-'+tone);plain(word.slice(at+mark.length));}
 else plain(word);
 return parts;
}
/** Wo im Ergebnis das markierte Stück sitzt: an der Stelle des Stücks im Grundwort, sonst am Wortende. */
export function builderMarks(w){
 const wordAt=w.wordMark?w.word.lastIndexOf(w.wordMark):-1;
 const resultMark=w.resultMark||'';
 const resultAt=!resultMark?-1:wordAt>=0?wordAt:w.result.length-resultMark.length;
 return {wordAt,resultAt};
}
/** Zerlegt einen Satz an den antippbaren Wörtern (jedes der Reihe nach, erstes Vorkommen hinter dem vorigen). */
export function sentenceParts(target,tokens=[]){
 const out=[];let rest=String(target??'');
 tokens.forEach((token,index)=>{
  const i=rest.indexOf(token.text);if(i<0)return;
  if(i>0)out.push({text:rest.slice(0,i)});
  out.push({text:token.text,token:index});rest=rest.slice(i+token.text.length);
 });
 if(rest)out.push({text:rest});
 return out;
}

// ---- gelesene Kapitel (je Gerät) ----
function readStore(){try{const v=JSON.parse(localStorage.getItem(READ_KEY)||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}}
export function readChapters(course){const list=readStore()[course];return new Set(Array.isArray(list)?list.filter(x=>typeof x==='string'):[]);}
export function markRead(course,id){
 const store=readStore(),set=new Set(Array.isArray(store[course])?store[course]:[]);
 if(set.has(id))return false;
 set.add(id);store[course]=[...set];
 try{localStorage.setItem(READ_KEY,JSON.stringify(store));}catch{}
 return true;
}

// ---- Darstellung ----
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=text;return n;};
const target=(tag,cls,text,lang)=>{const n=el(tag,cls,text);n.lang=lang;return n;};
function prose(node,text,lang){
 for(const part of inlineParts(text))node.append(part.target?target('span','gb-target',part.text,lang):document.createTextNode(part.text));
 return node;
}
function painted(node,parts){
 node.replaceChildren(...parts.map(p=>{if(!p.tone)return document.createTextNode(p.text);const s=el('span','gb-tone-'+p.tone,p.text);return s;}));
 return node;
}
const pressed=(button,on)=>{button.setAttribute('aria-pressed',String(on));button.classList.toggle('selected',on);};
function heading(section,title){if(title)section.append(el('h3','gb-kicker',title));}

const BLOCKS={
 rule(block,{lang}){const s=el('section','gb-block gb-rule');heading(s,block.title);s.append(prose(el('p','gb-lead'),block.text,lang));return s;},
 text(block,{lang}){const s=el('section','gb-block gb-text');heading(s,block.title);s.append(prose(el('p','gb-prose'),block.text,lang));return s;},
 groups(block,{lang}){
  const s=el('section','gb-block gb-groups');heading(s,block.title);
  const list=el('ul','gb-rows');
  for(const item of block.items||[]){
   const li=el('li','gb-row gb-group');
   const letters=target('span','gb-letters'+(item.tone?' gb-tone-'+item.tone:''),(item.letters||[]).join(' · '),lang);
   const copy=el('span','gb-group-copy');copy.append(el('span','gb-group-label',item.label));
   if(item.note)copy.append(prose(el('span','gb-group-note'),item.note,lang));
   li.append(letters,copy);list.append(li);
  }
  s.append(list);return s;
 },
 uses(block,{lang}){
  const s=el('section','gb-block gb-uses');heading(s,block.title);
  const list=el('ul','gb-rows');
  for(const item of block.items||[]){
   const li=el('li','gb-row gb-use');
   const example=el('span','gb-example');example.append(target('span','gb-target gb-example-target',item.target,lang),el('span','gb-source',item.source));
   li.append(el('span','gb-use-label',item.label),example);list.append(li);
  }
  s.append(list);return s;
 },
 table(block,{lang}){
  const s=el('section','gb-block gb-table-block');heading(s,block.title);
  s.append(table(block.columns,(block.rows||[]).map(r=>({label:r.label,cells:r.cells,sources:r.sources})),lang));return s;
 },
 builder(block,{lang}){
  const s=el('section','gb-block gb-builder');heading(s,block.title);
  const chips=el('div','gb-chips');chips.setAttribute('role','group');if(block.title)chips.setAttribute('aria-label',block.title);
  const stage=el('div','gb-stage');stage.setAttribute('aria-live','polite');
  const big=target('p','gb-form',null,lang),meaning=el('p','gb-source gb-form-source'),why=el('p','gb-why');
  stage.append(big,meaning,why);
  const words=block.words||[],buttons=[];
  const pick=index=>{
   const w=words[index],{wordAt,resultAt}=builderMarks(w),marks=block.marks||[];
   const result=painted(el('span','gb-form-result'),wordParts(w.result,{mark:w.resultMark,at:resultAt,tone:w.resultTone||'b',marks}));
   if(w.wordMark){
    // Paar: Grundwort → Form, das wechselnde Stück in beiden hervorgehoben.
    big.replaceChildren(painted(el('span','gb-form-word'),wordParts(w.word,{mark:w.wordMark,at:wordAt,tone:'a',marks})),el('span','gb-arrow',' → '),result);
    meaning.textContent=w.resultSource?`${w.source} → ${w.resultSource}`:w.source;
   }else{
    big.replaceChildren(result);
    meaning.replaceChildren(target('span','gb-target',w.word,lang),document.createTextNode(' · '+w.source));
   }
   why.textContent=w.why||'';why.hidden=!w.why;
   buttons.forEach((b,i)=>pressed(b,i===index));
  };
  words.forEach((w,i)=>{const b=target('button','gb-chip',w.word,lang);b.type='button';b.addEventListener('click',()=>pick(i));buttons.push(b);chips.append(b);});
  s.append(chips,stage);if(block.note)s.append(prose(el('p','gb-note'),block.note,lang));
  if(words.length)pick(0);
  return s;
 },
 grid(block,{lang}){
  const s=el('section','gb-block gb-grid');heading(s,block.title);
  const chips=el('div','gb-chips');chips.setAttribute('role','group');
  const caption=el('p','gb-source gb-form-source'),holder=el('div','gb-grid-holder');holder.setAttribute('aria-live','polite');
  const words=block.words||[],buttons=[];
  const pick=index=>{
   const w=words[index];
   caption.replaceChildren(target('span','gb-target',w.word,lang),document.createTextNode(' · '+w.source));
   holder.replaceChildren(table(block.columns,(w.rows||[]).map((cells,i)=>({label:block.rowLabels?.[i]||'',cells})),lang));
   buttons.forEach((b,i)=>pressed(b,i===index));
  };
  words.forEach((w,i)=>{const b=target('button','gb-chip',w.word,lang);b.type='button';b.addEventListener('click',()=>pick(i));buttons.push(b);chips.append(b);});
  s.append(chips,caption,holder);if(words.length)pick(0);
  return s;
 },
 sentence(block,{lang}){
  const s=el('section','gb-block gb-sentence');heading(s,block.title);
  const line=target('p','gb-sentence-target',null,lang),tokens=block.tokens||[],buttons=[];
  const detail=el('div','gb-token');detail.setAttribute('aria-live','polite');
  const form=target('p','gb-token-form',null,lang),note=el('p','gb-token-note');detail.append(form,note);
  const pick=index=>{form.textContent=tokens[index].form||tokens[index].text;note.textContent=tokens[index].note||'';buttons.forEach(b=>pressed(b,Number(b.dataset.token)===index));};
  for(const part of sentenceParts(block.target,tokens)){
   if(part.token===undefined){line.append(document.createTextNode(part.text));continue;}
   const b=el('button','gb-word',part.text);b.type='button';b.dataset.token=String(part.token);b.addEventListener('click',()=>pick(part.token));buttons.push(b);line.append(b);
  }
  s.append(line,el('p','gb-source gb-sentence-source',block.source));
  if(buttons.length){s.append(detail);pick(Number(buttons[0].dataset.token));}
  return s;
 },
 contrast(block,{lang}){
  const s=el('section','gb-block gb-contrast');heading(s,block.title);
  const toggle=el('div','gb-toggle');toggle.setAttribute('role','group');if(block.title)toggle.setAttribute('aria-label',block.title);
  const a=el('button','',block.a?.label),b=el('button','',block.b?.label);a.type=b.type='button';toggle.append(a,b);
  const list=el('ul','gb-pairs');list.setAttribute('aria-live','polite');
  const show=side=>{
   list.replaceChildren(...(block.pairs||[]).map(pair=>{const li=el('li','gb-pair');li.append(target('span','gb-target gb-pair-target',pair[side].target,lang),el('span','gb-source',pair[side].source));return li;}));
   pressed(a,side==='a');pressed(b,side==='b');
  };
  a.addEventListener('click',()=>show('a'));b.addEventListener('click',()=>show('b'));
  s.append(toggle,list);show('a');
  return s;
 },
 quiz(block,{lang}){
  const s=el('section','gb-block gb-quiz');heading(s,block.title);
  const list=el('ol','gb-questions');
  for(const item of block.items||[]){
   const li=el('li','gb-question');
   const head=el('div','gb-question-head');head.append(target('span','gb-target gb-question-prompt',item.prompt,lang),el('span','gb-source',item.source));
   const options=el('div','gb-options');options.setAttribute('role','group');options.setAttribute('aria-label',item.source||item.prompt);
   const verdict=el('span','sr-only');verdict.setAttribute('aria-live','polite');
   const buttons=(item.options||[]).map((text,i)=>{
    const b=target('button','gb-option',text,lang);b.type='button';
    b.addEventListener('click',()=>{
     const right=i===item.answer;
     buttons.forEach(x=>{x.classList.remove('is-right','is-wrong');x.setAttribute('aria-pressed','false');});
     b.classList.add(right?'is-right':'is-wrong');b.setAttribute('aria-pressed','true');
     li.classList.toggle('is-solved',right);verdict.textContent=right?'Richtig':'Noch nicht';
    });
    options.append(b);return b;
   });
   li.append(head,options,verdict);list.append(li);
  }
  s.append(list);return s;
 },
 practice(block,{onPractice,practiceLabel}){
  const s=el('section','gb-block gb-practice');
  const b=el('button','gb-cta',practiceLabel?.(block)||block.label);b.type='button';b.dataset.grammarPractice=block.activity||'';
  b.addEventListener('click',()=>onPractice?.(block));
  s.append(b);return s;
 },
};
function table(columns=[],rows=[],lang){
 const t=el('table','gb-table'),head=el('tr');
 head.append(el('td'));for(const c of columns){const th=el('th','',c);th.scope='col';head.append(th);}
 const thead=el('thead');thead.append(head);const body=el('tbody');
 for(const row of rows){
  const tr=el('tr'),th=el('th','',row.label);th.scope='row';tr.append(th);
  (row.cells||[]).forEach((cell,i)=>{const td=el('td');td.append(target('span','gb-target gb-cell',cell,lang));if(row.sources?.[i])td.append(el('span','gb-source',row.sources[i]));tr.append(td);});
  body.append(tr);
 }
 t.append(thead,body);return t;
}
export const BLOCK_TYPES=Object.keys(BLOCKS);

/** Inhaltsverzeichnis: nummerierte Kapitel, gelesene mit Häkchen. */
export function renderIndex(container,{book,read=new Set(),onOpen,headingLevel=2}){
 const root=el('div','gb gb-index');
 const head=el('div','gb-index-head');
 head.append(el('p','gb-eyebrow',book.title),el('h'+headingLevel,'gb-index-title',book.lead));
 if(book.note)head.append(el('p','gb-index-note',book.note));
 const list=el('ol','gb-toc');
 const group=id=>book.groups?.find(g=>g.id===id)?.title||'';
 for(const chapter of book.chapters){
  const li=el('li'),b=el('button','gb-toc-item'+(read.has(chapter.id)?' is-read':''));b.type='button';b.dataset.grammarChapter=chapter.id;
  const number=el('span','gb-toc-number',read.has(chapter.id)?'✓':chapter.number);number.setAttribute('aria-hidden','true');
  const copy=el('span','gb-toc-copy');
  copy.append(el('span','gb-toc-group',[group(chapter.group),read.has(chapter.id)?'gelesen':chapter.minutes?`${chapter.minutes} Minuten`:''].filter(Boolean).join(' · ')),el('span','gb-toc-title',chapter.title),el('span','gb-toc-summary',chapter.summary));
  b.append(number,copy,el('span','gb-toc-arrow','→'));b.lastChild.setAttribute('aria-hidden','true');
  b.addEventListener('click',()=>onOpen?.(chapter.id));
  li.append(b);list.append(li);
 }
 root.append(head,list);
 container.replaceChildren(root);
 return root;
}

/** Ein Kapitel: Kopf, Bausteine der Reihe nach, unten Blättern. onRead meldet, wenn das Ende im Bild war. */
export function renderChapter(container,{book,chapter,onOpen,onIndex,onPractice,practiceLabel,onRead}){
 const lang=book.course,root=el('article','gb gb-chapter');
 const group=book.groups?.find(g=>g.id===chapter.group)?.title;
 const head=el('div','gb-chapter-head');
 head.append(el('p','gb-eyebrow',[group,chapter.number].filter(Boolean).join(' · ')),el('h1','gb-title',chapter.title),el('span','gb-dash'));
 root.append(head);
 for(const block of chapter.blocks||[]){
  const make=BLOCKS[block.type];if(!make)continue;
  try{root.append(make(block,{lang,onPractice,practiceLabel}));}catch(error){console.warn('Grammatik-Baustein übersprungen',block.type,error);}
 }
 const {previous,next}=neighbours(book,chapter.id);
 const nav=el('nav','gb-pager');nav.setAttribute('aria-label','Blättern');
 const link=(cls,label,title,handler)=>{const b=el('button',cls);b.type='button';b.append(el('small','',label),el('span','',title));b.addEventListener('click',handler);return b;};
 nav.append(previous?link('gb-prev','← Zurück',`${previous.number} ${previous.title}`,()=>onOpen?.(previous.id)):link('gb-prev','← Zurück','Inhalt',()=>onIndex?.()));
 nav.append(next?link('gb-next','Weiter →',`${next.number} ${next.title}`,()=>onOpen?.(next.id)):link('gb-next','Fertig →','Inhalt',()=>onIndex?.()));
 root.append(nav);
 container.replaceChildren(root);
 // „Gelesen“ gilt, sobald das Blättern unten im Bild war.
 if(onRead){
  if(typeof IntersectionObserver==='function'){const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){io.disconnect();onRead(chapter.id);}},{threshold:.5});io.observe(nav);}
  else onRead(chapter.id);
 }
 return root;
}
