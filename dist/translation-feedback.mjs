// Feedback for typed translations: align own answer with the closest template,
// mark differing words and explain Finnish template words via the word lookup.
// Never a verdict: other formulations can be right, grading stays with the learner.
import {wordInfo,getLexicon} from './word-lookup.mjs?v=2';

const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const OPTIONAL_FI=new Set(['minä','sinä','me','te']);
const words=text=>String(text??'').normalize('NFC').split(/\s+/u).map(w=>w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'')).filter(Boolean);
const low=w=>w.toLocaleLowerCase('fi');

function distance(a,b){
 const dp=Array.from({length:a.length+1},(_,i)=>{const r=new Uint16Array(b.length+1);r[0]=i;return r;});
 for(let j=0;j<=b.length;j++)dp[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 return dp;
}
const charSimilarity=(a,b)=>{const A=Array.from(low(a)),B=Array.from(low(b));if(!A.length&&!B.length)return 1;return 1-distance(A,B)[A.length][B.length]/Math.max(A.length,B.length);};

// Word alignment; substitutions are only paired when the words look alike or sit at the same spot.
export function alignWords(answer,expected){
 const a=words(answer),e=words(expected),A=a.map(low),E=e.map(low);
 if(a.length>150||e.length>150)return null;
 const dp=distance(A,E),ops=[];
 let i=A.length,j=E.length;
 while(i||j){
  if(i&&j&&A[i-1]===E[j-1]){ops.push({type:'same',typed:a[i-1],expected:e[j-1],index:j-1});i--;j--;}
  else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){ops.push({type:'changed',typed:a[i-1],expected:e[j-1],index:j-1});i--;j--;}
  else if(j&&dp[i][j]===dp[i][j-1]+1){ops.push({type:'missing',expected:e[j-1],index:j-1});j--;}
  else{ops.push({type:'extra',typed:a[i-1]});i--;}
 }
 return ops.reverse();
}

export function charDiff(typed,expected){
 const a=Array.from(typed),b=Array.from(expected),A=a.map(low),B=b.map(low),dp=distance(A,B);
 let i=a.length,j=b.length;const t=[],e=[];
 const mark=(c,kind)=>`<mark class="diff-${kind}">${escape(c)}</mark>`;
 while(i||j){
  if(i&&j&&A[i-1]===B[j-1]){t.push(escape(a[--i]));e.push(escape(b[--j]));}
  else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){t.push(mark(a[--i],'wrong'));e.push(mark(b[--j],'needed'));}
  else if(i&&dp[i][j]===dp[i-1][j]+1)t.push(mark(a[--i],'wrong'));
  else e.push(mark(b[--j],'needed'));
 }
 return {typed:t.reverse().join(''),expected:e.reverse().join('')};
}

// Word forms in the corpus → analyses (to explain the learner's own form).
let formIndex=null,formIndexFor=null;
function analysesOf(word){
 const lexicon=getLexicon();if(!lexicon)return [];
 if(formIndexFor!==lexicon){
  formIndex=new Map();formIndexFor=lexicon;
  for(const entry of Object.values(lexicon.sentences)){
   const ws=words(entry.s);
   entry.w.forEach(([li,fi],k)=>{const key=low(ws[k]||'');if(!key)return;const [lemma]=lexicon.lemmas[li],form=lexicon.forms[fi];if(!formIndex.has(key))formIndex.set(key,new Map());formIndex.get(key).set(`${lemma}|${form}`,{lemma,form});});
  }
 }
 return [...(formIndex.get(low(word))?.values()||[])];
}

export function compareTranslation(answer,templates,language){
 const clean=String(answer??'').trim();
 if(!clean)return {kind:'empty'};
 let best=null;
 for(const template of templates){
  const ops=alignWords(clean,template);if(!ops)continue;
  const optional=op=>language==='fi'&&op.type==='missing'&&OPTIONAL_FI.has(low(op.expected));
  const diffs=ops.filter(op=>op.type!=='same'&&!optional(op));
  const size=Math.max(1,words(template).length);
  const score=diffs.length/size;
  if(!best||score<best.score)best={template,ops,diffs,score,omittedPronoun:ops.some(optional)};
 }
 if(!best)return {kind:'different'};
 if(!best.diffs.length)return {kind:'exact',template:best.template,omittedPronoun:best.omittedPronoun};
 // Pair up words that look alike; unrelated substitutions count as a different formulation.
 const pairs=best.diffs.map(op=>op.type==='changed'&&charSimilarity(op.typed,op.expected)<0.34?{...op,type:'reworded'}:op);
 const kind=best.score<=0.5?'close':'different';
 return {kind,template:best.template,diffs:pairs,omittedPronoun:best.omittedPronoun};
}

function explainTemplateWord(sentenceText,index){
 const info=wordInfo(sentenceText,index);if(!info)return '';
 return `<small><span lang="fi">${escape(info.lemma)}</span> · ${escape(info.meaning)} · ${escape(info.form)}${info.here?` · hier: ${escape(info.here)}`:''}</small>`;
}
function explainTyped(typed,templateWord,sentenceText,index){
 const target=wordInfo(sentenceText,index);if(!target)return '';
 const own=analysesOf(typed).find(a=>a.lemma===target.lemma);
 return own?`<small>Deine Form: ${escape(own.form)}</small>`:'';
}

export function translationFeedbackMarkup({answer,templates,language,sentenceText='',compact=false}){
 const result=compareTranslation(answer,templates,language);
 if(result.kind==='empty')return '';
 const label=language==='fi'?'Finnisch':'Deutsch';
 const head=compact?'':`<span class="card-label">Deine Übersetzung · ${label}</span><p lang="${language}">${escape(answer)}</p>`;
 if(result.kind==='exact')return `<div class="${compact?'writing-feedback':'own-translation'} feedback exact">${head}<p class="feedback-verdict">✓ Stimmt mit der Vorlage überein.${result.omittedPronoun?' Das Personalpronomen darfst du im Finnischen weglassen.':''}</p></div>`;
 if(result.kind==='different')return compact?'': `<div class="${compact?'writing-feedback':'own-translation'} feedback different">${head}<p class="feedback-verdict">Anders formuliert als die Vorlage. Vergleiche selbst, ob die Bedeutung stimmt.</p></div>`;
 const fiTemplate=language==='fi'&&result.template===sentenceText;
 const items=result.diffs.slice(0,6).map(op=>{
  if(op.type==='changed'){const d=charDiff(op.typed,op.expected);return `<li><span class="yours" lang="${language}">${d.typed}</span><span class="arrow" aria-hidden="true">→</span><span class="template" lang="${language}">${d.expected}</span>${fiTemplate?explainTemplateWord(sentenceText,op.index)+explainTyped(op.typed,op.expected,sentenceText,op.index):''}</li>`;}
  if(op.type==='reworded')return `<li><span class="yours" lang="${language}">${escape(op.typed)}</span><span class="arrow" aria-hidden="true">→</span><span class="template" lang="${language}">${escape(op.expected)}</span>${fiTemplate?explainTemplateWord(sentenceText,op.index):''}</li>`;
  if(op.type==='missing')return `<li><span class="missing">fehlt</span><span class="template" lang="${language}">${escape(op.expected)}</span>${fiTemplate?explainTemplateWord(sentenceText,op.index):''}</li>`;
  return `<li><span class="yours" lang="${language}">${escape(op.typed)}</span><span class="extra">zusätzlich</span></li>`;
 }).join('');
 const n=result.diffs.length;
 return `<div class="${compact?'writing-feedback':'own-translation'} feedback close">${head}<p class="feedback-verdict">Fast wie die Vorlage – ${n===1?'eine Stelle weicht':`${n} Stellen weichen`} ab:</p><ul class="translation-diffs">${items}</ul>${n>6?`<p class="feedback-more">… und ${n-6} weitere.</p>`:''}<small>Andere Formulierungen können auch richtig sein. Die Bewertung bleibt bei dir.</small></div>`;
}
