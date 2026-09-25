// Tap a Finnish word: base form, German meaning, form and contextual rendering.
// Data: lexicon.json (built by build_lexicon.py), bound to the exact sentence text.
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const EDGE=/^([\p{P}\p{S}]*)(.*?)([\p{P}\p{S}]*)$/u;
const HINT_KEY='suomi-word-lookup-hint';

let lexicon=null,byText=null,loading=null,popover=null,activeButton=null;
const lookupListeners=new Set();

export function loadLexicon(fetcher=fetch){
 if(lexicon)return Promise.resolve(lexicon);
 if(!loading)loading=fetcher('lexicon.json').then(r=>{if(!r.ok)throw new Error('lexicon');return r.json();}).then(data=>{setLexicon(data);return lexicon;}).catch(error=>{loading=null;throw error;});
 return loading;
}

export const getLexicon=()=>lexicon;

export function setLexicon(data){
 lexicon=data;byText=new Map();
 for(const [id,entry] of Object.entries(data?.sentences||{}))if(!byText.has(entry.s))byText.set(entry.s,{id:Number(id),...entry});
}

// Same token boundaries as sentenceWords() in word-practice.mjs: whitespace chunks,
// punctuation/symbols stripped at both edges, empty chunks skipped.
export function splitSentence(text){
 const parts=[];let index=0;
 for(const chunk of String(text).normalize('NFC').split(/(\s+)/u)){
  if(!chunk)continue;
  if(/^\s+$/u.test(chunk)){parts.push({text:chunk});continue;}
  const [,lead,core,trail]=EDGE.exec(chunk);
  if(!core){parts.push({text:chunk});continue;}
  if(lead)parts.push({text:lead});
  parts.push({text:core,index:index++});
  if(trail)parts.push({text:trail});
 }
 return parts;
}

export function wordInfo(sentenceText,index){
 const entry=byText?.get(String(sentenceText).normalize('NFC'));
 const item=entry?.w?.[index];if(!item)return null;
 const [lemmaIndex,formIndex,here='',parts='']=item;
 const [lemma,meaning]=lexicon.lemmas[lemmaIndex]||[];
 return {sentenceId:entry.id,lemma,meaning,form:lexicon.forms[formIndex]||'',here,parts:parts?parts.split('+'):[]};
}

export function lookupForSentence(sentenceText){
 const entry=byText?.get(String(sentenceText).normalize('NFC'));
 return entry?entry.w.map((_,i)=>wordInfo(sentenceText,i)):null;
}

export function onWordLookup(listener){lookupListeners.add(listener);return ()=>lookupListeners.delete(listener);}

function markup(text){
 return splitSentence(text).map(p=>p.index===undefined?escape(p.text):`<button type="button" class="fi-word" data-word-index="${p.index}" aria-haspopup="dialog" aria-expanded="false">${escape(p.text)}</button>`).join('');
}

// Replace the leading text node of [lang=fi] elements that show a known sentence.
export function enhance(root){
 if(!byText||!root)return 0;
 let count=0;
 for(const el of root.querySelectorAll('[lang="fi"]:not([data-words])')){
  if(el.closest('textarea,input,button,.fi-word'))continue;
  const node=el.firstChild;
  if(!node||node.nodeType!==3)continue;
  const text=node.data.trim().normalize('NFC');
  if(!byText.has(text)||(node.nextSibling&&!node.nextSibling.classList?.contains('sentence-source-icon')))continue;
  el.dataset.words=text;
  const span=document.createElement('span');
  span.className='fi-words';
  span.innerHTML=markup(node.data);
  el.replaceChild(span,node);
  count++;
 }
 if(count)showHintOnce(root);
 return count;
}

function showHintOnce(root){
 let shown=0;try{shown=Number(localStorage.getItem(HINT_KEY))||0;}catch{}
 if(shown>=3||root.querySelector('.word-lookup-hint'))return;
 const first=root.querySelector('[data-words]');if(!first)return;
 first.insertAdjacentHTML('afterend','<p class="word-lookup-hint">Tipp: Tippe auf ein Wort für Grundform und Bedeutung.</p>');
 try{localStorage.setItem(HINT_KEY,String(shown+1));}catch{}
}

function popoverMarkup(word,info){
 if(!info)return `<p class="word-popover-word" lang="fi">${escape(word)}</p><p>Für dieses Wort ist noch keine Erklärung hinterlegt.</p>`;
 const same=info.lemma.toLocaleLowerCase('fi')===word.toLocaleLowerCase('fi');
 return `<p class="word-popover-word" lang="fi">${escape(word)}</p>`+
  `<p class="word-popover-lemma">${same?'':`<span class="word-popover-label">Grundform</span> <b lang="fi">${escape(info.lemma)}</b> · `}<span>${escape(info.meaning)}</span></p>`+
  `<p class="word-popover-form">${escape(info.form)}</p>`+
  (info.here?`<p class="word-popover-here"><span class="word-popover-label">hier</span> ${escape(info.here)}</p>`:'')+
  (info.parts.length?`<p class="word-popover-parts"><span class="word-popover-label">Zusammengesetzt</span> <span lang="fi">${info.parts.map(escape).join(' + ')}</span></p>`:'')+
  '<p class="word-popover-note">Automatisch analysiert, mit KI erklärt.</p>';
}

// Follow the word while scrolling; close only when it leaves the screen.
function placePopover(){
 if(!popover||popover.hidden||!activeButton)return;
 const rect=activeButton.getBoundingClientRect();
 if(!activeButton.isConnected||rect.bottom<0||rect.top>window.innerHeight){closeWordPopover();return;}
 const box=popover.getBoundingClientRect(),gap=8;
 let top=rect.bottom+gap;
 if(top+box.height>window.innerHeight-12)top=Math.max(12,rect.top-box.height-gap);
 const left=Math.min(Math.max(12,rect.left+rect.width/2-box.width/2),window.innerWidth-box.width-12);
 popover.style.top=`${top}px`;popover.style.left=`${left}px`;
}

export function closeWordPopover(){
 if(!popover||popover.hidden)return;
 popover.hidden=true;
 activeButton?.setAttribute('aria-expanded','false');
 activeButton?.classList.remove('active');
 activeButton=null;
}

function openWordPopover(button){
 if(activeButton===button&&!popover?.hidden){closeWordPopover();return;}
 if(!popover){
  popover=document.createElement('div');
  popover.className='word-popover';popover.hidden=true;
  popover.setAttribute('role','dialog');popover.setAttribute('aria-label','Wort erklärt');
  document.body.appendChild(popover);
 }
 closeWordPopover();
 const host=button.closest('[data-words]'),index=Number(button.dataset.wordIndex),info=wordInfo(host.dataset.words,index);
 popover.innerHTML=popoverMarkup(button.textContent,info);
 popover.hidden=false;activeButton=button;
 button.setAttribute('aria-expanded','true');button.classList.add('active');
 placePopover();
 if(info)for(const listener of lookupListeners){try{listener({...info,word:button.textContent});}catch{}}
}

export function mountWordLookup(roots){
 const targets=roots.filter(Boolean);
 const run=()=>{for(const root of targets)enhance(root);};
 loadLexicon().then(run).catch(()=>{});
 const observer=new MutationObserver(()=>{if(lexicon)run();});
 for(const root of targets)observer.observe(root,{childList:true,subtree:true});
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('.fi-word');
  if(button){event.preventDefault();event.stopPropagation();openWordPopover(button);return;}
  if(popover&&!popover.contains(event.target))closeWordPopover();
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape')closeWordPopover();});
 window.addEventListener('resize',placePopover);
 window.addEventListener('scroll',placePopover,true);
 return observer;
}
