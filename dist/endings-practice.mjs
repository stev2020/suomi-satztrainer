// Endungen: fill in the inflected form of a word in a real sentence.
// Items come from lexicon.json (word lookup): nominal words in a case other than
// the nominative singular, without possessive/clitic endings or colloquial forms.
import {splitSentence} from './word-lookup.mjs?v=2';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NOMINAL=/^(Nomen|Adjektiv|Pronomen|Zahlwort|Name|Ortsname) · (Genitiv|Partitiv|Inessiv|Elativ|Illativ|Adessiv|Ablativ|Allativ|Essiv|Translativ|Abessiv|Komitativ|Instruktiv|Nominativ Plural)/u;
const norm=s=>String(s??'').normalize('NFC').trim().toLocaleLowerCase('fi').replace(/\s+/gu,' ');
const degree=form=>/Superlativ/u.test(form)?'sup':/Komparativ/u.test(form)?'comp':'';
const cleanForm=form=>/^(Nomen|Adjektiv|Pronomen|Zahlwort|Name|Ortsname) · /u.test(form)&&!/ \+ |umgangssprach|Schreibfehler/u.test(form);
export const caseOf=form=>{const m=NOMINAL.exec(form);return m?form.split(' · ')[1]:'';};

// All attested forms per lemma and all analyses per word form (for choices and feedback).
export function indexLexicon(lexicon,sentences){
 const byLemma=new Map(),byForm=new Map();
 for(const s of sentences){
  const entry=lexicon.sentences?.[String(s.id)];
  if(entry?.s!==s.text)continue;
  const words=splitSentence(s.text).filter(p=>p.index!==undefined);
  entry.w.forEach(([li,fi],i)=>{
   const token=words[i]?.text;if(!token)return;
   const [lemma]=lexicon.lemmas[li],form=lexicon.forms[fi],key=norm(token);
   if(cleanForm(form)&&!/\s/u.test(key)){
    if(!byLemma.has(lemma))byLemma.set(lemma,new Map());
    byLemma.get(lemma).set(key,form);
   }
   if(!byForm.has(key))byForm.set(key,new Map());
   byForm.get(key).set(`${lemma}|${form}`,{lemma,form});
  });
 }
 return {byLemma,byForm};
}

export function buildEndingItems(lexicon,sentences,level){
 const items=[];
 for(const s of sentences){
  if(level!==null&&s.level!==level)continue;
  const entry=lexicon.sentences?.[String(s.id)];
  if(entry?.s!==s.text||!s.translations?.length)continue;
  const words=splitSentence(s.text).filter(p=>p.index!==undefined);
  entry.w.forEach(([li,fi,here=''],i)=>{
   const [lemma,meaning]=lexicon.lemmas[li],form=lexicon.forms[fi],token=words[i]?.text;
   if(!token||!NOMINAL.test(form)||!cleanForm(form))return;
   if(norm(token)===norm(lemma)||/[^\p{L}-]/u.test(token)||/[^\p{L} -]/u.test(lemma))return;
   items.push({id:`${s.id}:${i}`,sentence:s,index:i,answer:token,lemma,meaning,form,here,case:caseOf(form)});
  });
 }
 return items;
}

function shuffle(list,random){const a=[...list];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}

// One gap per sentence; previously missed items first.
export function createEndingsSession(items,count,{random=Math.random,missed=new Set()}={}){
 const used=new Set(),picked=[];
 const ordered=[...shuffle(items.filter(i=>missed.has(i.id)),random),...shuffle(items.filter(i=>!missed.has(i.id)),random)];
 for(const item of ordered){if(used.has(item.sentence.id))continue;used.add(item.sentence.id);picked.push(item);if(picked.length>=count)break;}
 return {items:picked,position:0,answers:[],checked:false,draft:'',showCase:false,count:picked.length};
}

const BACK=/[aou]/u;
// Naive endings on vowel-final base forms only (visibly wrong without gradation etc.).
function synthetic(lemma){
 const base=lemma.toLocaleLowerCase('fi');
 if(!/[aeiouyäö]$/u.test(base))return [];
 const back=BACK.test(base.replace(/.*[-]/u,'')),a=back?'a':'ä';
 return [`${base}n`,`${base}${a}`,`${base}ss${a}`,`${base}st${a}`,`${base}ll${a}`,`${base}lle`,`${base}lt${a}`,`${base}ksi`];
}

// Correct form plus two other forms of the same word (attested first, then simple wrong endings).
export function endingChoices(item,index,random=Math.random){
 const answer=norm(item.answer);
 const attested=[...(index.byLemma.get(item.lemma)||new Map())].filter(([f,form])=>f!==answer&&degree(form)===degree(item.form)).map(([f])=>f);
 const pool=[...shuffle(attested,random),...shuffle(synthetic(item.lemma),random)].filter((f,i,all)=>f!==answer&&all.indexOf(f)===i);
 const distractors=pool.slice(0,2);
 const capital=item.answer[0]!==item.answer[0].toLocaleLowerCase('fi');
 const show=f=>capital?f[0].toLocaleUpperCase('fi')+f.slice(1):f;
 return shuffle([item.answer,...distractors.map(show)],random);
}

export const endingMatches=(answer,item)=>norm(answer)===norm(item.answer);

// What the learner's (wrong) form is, if it occurs in the corpus for the same word.
export function describeAnswer(answer,item,index){
 const found=index.byForm.get(norm(answer));
 if(!found)return null;
 return [...found.values()].find(v=>v.lemma===item.lemma)||null;
}

function sentenceWithGap(item,content){
 return splitSentence(item.sentence.text).map(p=>p.index===item.index?content:escape(p.text)).join('');
}

// UI -----------------------------------------------------------------------

export function renderEndings(ctx){
 const {card,actions,notice,level,difficulty,state}=ctx;
 notice.textContent='';actions.innerHTML='';
 card.className='card endings-card';
 if(!state.items){
  card.innerHTML=`<span class="card-label">Endungen · Level ${level}</span><h2>Endungen werden geladen …</h2>`;
  return;
 }
 const session=state.session;
 if(!session){
  const available=state.items.length;
  card.innerHTML=`<span class="card-label">Endungen · Level ${level}</span><h2>Setze die richtige Form ein.</h2><p>Ein Wort im Satz fehlt. Du siehst die Grundform und die Übersetzung und bildest die passende Endung: Fälle, Plural, Stufenwechsel.</p><p class="verb-coverage">${available} Lücken in Level ${level} · ${difficulty==='easy'?'Leicht: Form auswählen, Fall wird angezeigt':'Schwer: Form selbst schreiben'}</p>${available?`<div class="choice-buttons verb-counts" role="group" aria-label="Anzahl der Aufgaben"><button type="button" data-endings-count="5">5 Aufgaben</button><button type="button" data-endings-count="10" ${available<10?'disabled':''}>10 Aufgaben</button></div>`:'<p>In diesem Level gibt es noch keine passenden Lücken.</p>'}<p class="verb-hint">Falsch beantwortete Lücken kommen in der nächsten Runde zuerst.</p>`;
  card.querySelectorAll('[data-endings-count]').forEach(b=>b.onclick=()=>{state.session=createEndingsSession(state.items,Number(b.dataset.endingsCount),{missed:state.missed});ctx.rerender();});
  return;
 }
 if(session.position>=session.items.length){
  const correct=session.answers.filter(a=>a.correct).length;
  card.innerHTML=`<span class="complete-mark">✓</span><h2 tabindex="-1" id="endings-result-title">Runde geschafft.</h2><p>${correct} von ${session.answers.length} Formen richtig.</p><ol class="verb-results">${session.answers.map(a=>`<li><span>${a.correct?'✓ Richtig':'Noch üben'}</span><strong lang="fi">${escape(a.item.answer)}</strong><small><span lang="fi">${escape(a.item.lemma)}</span> · ${escape(a.item.case)}</small>${a.correct?'':`<small>Deine Antwort: <span lang="fi">${escape(a.answer||'—')}</span></small>`}</li>`).join('')}</ol>`;
  actions.innerHTML='<button type="button" class="primary" id="endings-again">Neue Runde</button>';
  actions.querySelector('#endings-again').onclick=()=>{state.session=null;ctx.rerender();};
  card.querySelector('#endings-result-title')?.focus();
  return;
 }
 const item=session.items[session.position];
 if(difficulty==='easy'&&!session.choices)session.choices=endingChoices(item,state.index);
 const easy=difficulty==='easy'&&session.choices.length>=3;
 const last=session.checked?session.answers[session.answers.length-1]:null;
 const gap=session.checked?`<mark class="endings-filled ${last.correct?'correct':'incorrect'}" lang="fi">${escape(item.answer)}</mark>`:`<span class="endings-gap" aria-label="Lücke">&nbsp;</span>`;
 const hint=`<p class="endings-base"><span class="word-popover-label">Grundform</span> <b lang="fi">${escape(item.lemma)}</b> · ${escape(item.meaning)}${easy||session.showCase||session.checked?` <span class="endings-case">${escape(item.case)}</span>`:''}</p>`;
 let body='';
 if(!session.checked){
  body=easy
   ?`<div class="choice-buttons endings-choices" role="group" aria-label="Form auswählen">${session.choices.map(c=>`<button type="button" lang="fi" data-ending-choice="${escape(c)}">${escape(c)}</button>`).join('')}</div>`
   :`<form id="endings-form"><label for="endings-input">Deine Form</label><input id="endings-input" lang="fi" maxlength="60" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" placeholder="Form eintippen …" value="${escape(session.draft)}"><div class="letter-buttons"><button type="button" data-ending-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-ending-letter="ö" aria-label="ö einfügen">ö</button>${session.showCase?'':'<button type="button" id="endings-show-case" class="quiet">Tipp: Fall zeigen</button>'}</div><button class="primary" type="submit">Prüfen</button></form>`;
 }else{
  const own=!last.correct&&last.answer?describeAnswer(last.answer,item,state.index):null;
  body=`<div class="verb-solution-card ${last.correct?'correct':'incorrect'}"><div class="verb-feedback ${last.correct?'verb-correct':'verb-wrong'}" role="status">${last.correct?'Richtig!':`Die Form im Satz ist <strong lang="fi">${escape(item.answer)}</strong>.`}</div><p class="endings-explain"><b lang="fi">${escape(item.answer)}</b> = ${escape(item.form)}${item.here?` · hier: ${escape(item.here)}`:''}</p>${own?`<p class="endings-explain"><span lang="fi">${escape(last.answer)}</span> gibt es auch: ${escape(own.form)}. Im Satz passt aber die andere Form.</p>`:''}${!last.correct&&/^(Genitiv|Partitiv|Nominativ Plural)/u.test(item.case)?'<small>Beim Objekt sind manchmal mehrere Fälle möglich (Partitiv oder Genitiv/Nominativ). Dann ändert sich die Bedeutung leicht, z. B. „las ein Buch“ vs. „las das Buch zu Ende“.</small>':''}</div><p class="endings-full" lang="fi">${escape(item.sentence.text)}</p>`;
 }
 card.innerHTML=`<div class="card-top"><span class="card-label">Endungen · Level ${item.sentence.level}</span><span>${session.position+1} von ${session.items.length}</span></div><p class="sentence endings-sentence" lang="fi">${sentenceWithGap(item,gap)}</p><p class="endings-translation" lang="de">${escape(item.sentence.translations[0].text)}</p>${hint}${body}`;
 const submit=answer=>{
  const correct=endingMatches(answer,item);
  session.answers.push({item,answer,correct});session.checked=true;
  if(correct)state.missed.delete(item.id);else state.missed.add(item.id);
  ctx.onAnswer?.(correct);ctx.rerender();
 };
 if(!session.checked){
  if(easy)card.querySelectorAll('[data-ending-choice]').forEach(b=>b.onclick=()=>submit(b.dataset.endingChoice));
  else{
   const input=card.querySelector('#endings-input');
   input.oninput=e=>{session.draft=e.target.value;notice.textContent='';};
   card.querySelectorAll('[data-ending-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart;input.setRangeText(b.dataset.endingLetter,pos,input.selectionEnd,'end');session.draft=input.value;input.focus();};});
   card.querySelector('#endings-show-case')?.addEventListener('click',()=>{session.showCase=true;ctx.rerender();card.querySelector('#endings-input')?.focus();});
   card.querySelector('#endings-form').onsubmit=e=>{e.preventDefault();if(!session.draft.trim()){notice.textContent='Bitte gib zuerst eine Form ein.';return;}submit(session.draft.trim());};
   input.focus();
  }
 }else{
  actions.innerHTML=`<button type="button" class="primary" id="endings-next">${session.position+1<session.items.length?'Weiter':'Ergebnis ansehen'}</button>`;
  const next=actions.querySelector('#endings-next');
  next.onclick=()=>{session.position++;session.checked=false;session.draft='';session.showCase=false;session.choices=null;ctx.rerender();};
  next.focus();
 }
}
