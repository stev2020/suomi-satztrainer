// Vanamo – Oberflächensprache.
//
// Deutsch ist die Ausgangssprache: Die Texte stehen wie bisher direkt im HTML und im Code.
// Für andere Sprachen gibt es in locales/<code>.mjs ein Wörterbuch „deutscher Text → Übersetzung“.
// Ein MutationObserver übersetzt alles, was in die Seite geschrieben wird: Textknoten und die
// Attribute aria-label, placeholder, title und alt. Texte mit wechselnden Werten stehen im
// Wörterbuch als Muster mit Platzhaltern, z. B. "{0} von {1} richtig" → "{0} of {1} correct".
//
// Lerninhalte werden nie übersetzt: alles in einem Element mit lang="fi" oder lang="de"
// (finnische Sätze, deutsche Übersetzungen) und alles mit data-no-i18n bleibt unverändert.
// Innerhalb von Lerninhalten markiert data-i18n ein Oberflächenelement (wird übersetzt),
// data-i18n-attrs übersetzt nur die Attribute (z. B. aria-label eines Wortknopfs).

export const LANGUAGES={de:'Deutsch',en:'English'};
export const DEFAULT_LANGUAGE='de';
const STORAGE_KEY='vanamo-ui-lang';

function detect(){
 if(typeof document==='undefined')return DEFAULT_LANGUAGE; // Node (Tests): immer Deutsch
 try{const saved=localStorage.getItem(STORAGE_KEY);if(saved&&LANGUAGES[saved])return saved;}catch{}
 const wanted=navigator.languages?.length?navigator.languages:[navigator.language||DEFAULT_LANGUAGE];
 for(const tag of wanted){const code=String(tag).slice(0,2).toLowerCase();if(LANGUAGES[code])return code;}
 return 'en';
}

export const uiLanguage=detect();
const locale={de:'de-DE',en:'en-GB'}[uiLanguage]||uiLanguage;
export const uiLocale=locale;

let exact=new Map(),patterns=[];
if(uiLanguage!==DEFAULT_LANGUAGE){
 try{
  const dict=(await import(`./locales/${uiLanguage}.mjs?v=2`)).default;
  for(const [source,target] of Object.entries(dict)){
   if(/\{\d+\}/.test(source)){
    const parts=source.split(/(\{\d+\})/);
    const order=[];
    const re=parts.map(p=>{const m=/^\{(\d+)\}$/.exec(p);if(m){order.push(Number(m[1]));return '([\\s\\S]+?)';}return p.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}).join('');
    patterns.push({re:new RegExp('^'+re+'$','u'),order,target,seps:source.split(' · ').length});
   }else exact.set(source,target);
  }
  // Longer, more specific patterns first.
  patterns.sort((a,b)=>b.re.source.length-a.re.source.length);
 }catch(error){console.warn('Übersetzung konnte nicht geladen werden',error);}
}

const norm=s=>s.replace(/\s+/g,' ').trim();

/** Übersetzt einen deutschen Text. Unbekannte Texte bleiben unverändert. */
export function translate(text){
 if(uiLanguage===DEFAULT_LANGUAGE||!text)return text;
 const key=norm(text);
 if(!key)return text;
 let result=exact.get(key);
 if(result===undefined){
  const seps=key.split(' · ').length;
  for(const p of patterns){
   // Ein Muster mit n Trennpunkten passt nur auf Texte mit genauso vielen – sonst Stück für Stück.
   if(p.seps!==seps)continue;
   const m=p.re.exec(key);
   if(m){const values={};p.order.forEach((n,i)=>values[n]=m[i+1]);result=p.target.replace(/\{(\d+)\}/g,(_,n)=>translate(values[n]??''));break;}
  }
 }
 if(result===undefined&&key.includes(' · ')){
  // Zusammengesetzte Zeilen wie "Level 1 · Endungen · Schwer" Stück für Stück übersetzen.
  const parts=key.split(' · '),out=parts.map(p=>translate(p));
  if(out.some((p,i)=>p!==parts[i]))result=out.join(' · ');
 }
 if(result===undefined){
  // Aus mehreren Sätzen zusammengesetzte Absätze satzweise übersetzen.
  const sentences=key.split(/(?<=[.!?…])\s+(?=[A-ZÄÖÜ„"(])/u);
  if(sentences.length>1){const out=sentences.map(p=>translate(p));if(out.some((p,i)=>p!==sentences[i]))result=out.join(' ');}
 }
 if(result===undefined)return text;
 const lead=/^\s*/.exec(text)[0],trail=/\s*$/.exec(text)[0];
 return lead+result+trail;
}

/** Übersetzung mit Kontext, wenn ein deutsches Wort mehrere Bedeutungen hat:
 *  tc('Audio','Wiederholen') sucht zuerst "Audio|Wiederholen" (→ "Replay"), dann "Wiederholen". */
export function tc(context,text){
 if(uiLanguage===DEFAULT_LANGUAGE)return text;
 const hit=exact.get(context+'|'+norm(text));
 return hit!==undefined?hit:translate(text);
}

/** Für Texte, die im Code gebraucht werden: t('{0} Sätze', n). */
export function t(text,...values){
 const out=translate(text);
 return values.length?out.replace(/\{(\d+)\}/g,(_,n)=>values[n]??''):out;
}

const ATTRS=['aria-label','placeholder','title','alt'];
const SKIP='script,style,[data-no-i18n],[contenteditable="true"]';
const SKIP_TEXT=SKIP+',textarea';

function isContent(el){
 const langEl=el.closest('[lang],[data-i18n]');
 return !!langEl&&langEl!==document.documentElement&&!langEl.hasAttribute('data-i18n');
}

function translateNode(node){
 if(node.nodeType===3){
  const el=node.parentElement;
  if(!el||el.closest(SKIP_TEXT)||isContent(el))return;
  const next=translate(node.data);
  if(next!==node.data)node.data=next;
  return;
 }
 if(node.nodeType!==1)return;
 const el=node;
 if(el.closest(SKIP))return;
 if(!isContent(el)||el.hasAttribute('data-i18n-attrs'))translateAttributes(el);
 const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT);
 for(let n=walker.nextNode();n;n=walker.nextNode()){
  if(n.nodeType===1){
   if(n.matches(SKIP)){skipSubtree(walker,n);continue;}
   if(!isContent(n)||n.hasAttribute('data-i18n-attrs'))translateAttributes(n);
  }else translateNode(n);
 }
}

function skipSubtree(walker,el){
 // Move the walker past this element's descendants.
 let last=el;while(last.lastChild)last=last.lastChild;
 walker.currentNode=last;
}

function translateAttributes(el){
 for(const a of ATTRS){
  const v=el.getAttribute(a);
  if(v){const next=translate(v);if(next!==v)el.setAttribute(a,next);}
 }
 if(el.tagName==='INPUT'&&(el.type==='button'||el.type==='submit')&&el.value){const next=translate(el.value);if(next!==el.value)el.value=next;}
}

export function translateTree(root=document.body){if(root)translateNode(root);}

if(uiLanguage!==DEFAULT_LANGUAGE){
 document.documentElement.lang=uiLanguage;
 document.title=translate(document.title);
 const meta=document.querySelector('meta[name="description"]');
 if(meta)meta.content=translate(meta.content);
 translateTree(document.body);
 new MutationObserver(records=>{
  for(const r of records){
   if(r.type==='childList')r.addedNodes.forEach(translateNode);
   else if(r.type==='characterData')translateNode(r.target);
   else if(r.type==='attributes'){const el=r.target;if(!el.closest(SKIP)&&(!isContent(el)||el.hasAttribute('data-i18n-attrs'))){const v=el.getAttribute(r.attributeName);if(v){const next=translate(v);if(next!==v)el.setAttribute(r.attributeName,next);}}}
  }
 }).observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
}
if(typeof document!=='undefined'){
document.documentElement.classList.remove('i18n-pending');

/** Sprachauswahl einhängen: <select data-ui-language>. */
function mountSwitchers(){
 document.querySelectorAll('select[data-ui-language]').forEach(select=>{
  select.innerHTML=Object.entries(LANGUAGES).map(([code,name])=>`<option value="${code}" lang="${code}">${name}</option>`).join('');
  select.value=uiLanguage;
  select.onchange=()=>{try{localStorage.setItem(STORAGE_KEY,select.value);}catch{}location.reload();};
 });
}
mountSwitchers();
}
