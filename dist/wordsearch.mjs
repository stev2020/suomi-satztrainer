const EASY=[[0,1],[1,0]];
const HARD=[...EASY,[0,-1],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const letters='AAAAAAAÄÄBBBBDEEEEEEEFGHIIIIIIIIJKKKKLLLLMMMNNNNNNOOOOÖÖPPPRRRSSSSSTTTTTTUUUUUVVY';
export function searchWords(text){return [...new Set(String(text).normalize('NFC').split(/\s+/u).map(w=>w.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu,'').toLocaleUpperCase('fi')).filter(Boolean))];}
export function canSearch(sentence){const words=searchWords(sentence.text);return words.length>0&&words.length<=12&&words.every(w=>/^\p{L}+$/u.test(w)&&w.length<=16);}
function shuffled(items,random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function createSearch(sentence,difficulty='easy',random=Math.random){
 if(!canSearch(sentence))throw new Error('Sentence does not fit a word search');
 const words=searchWords(sentence.text),directions=difficulty==='hard'?HARD:EASY;
 const size=Math.max(8,...words.map(w=>w.length),words.length,Math.ceil(Math.sqrt(words.join('').length*1.8)));
 let grid,placements;
 for(let attempt=0;attempt<20;attempt++){
  grid=Array(size*size).fill('');placements=[];
  for(const word of [...words].sort((a,b)=>b.length-a.length)){
   const candidates=[];
   for(let r=0;r<size;r++)for(let c=0;c<size;c++)for(const [dr,dc] of directions){
    const endR=r+dr*(word.length-1),endC=c+dc*(word.length-1);if(endR<0||endR>=size||endC<0||endC>=size)continue;
    const cells=Array.from(word,(_,i)=>(r+dr*i)*size+c+dc*i);
    if(cells.every((cell,i)=>!grid[cell]||grid[cell]===word[i]))candidates.push(cells);
   }
   if(!candidates.length)break;
   const cells=candidates[Math.floor(random()*candidates.length)];cells.forEach((cell,i)=>grid[cell]=word[i]);placements.push({word,cells});
  }
  if(placements.length===words.length)break;
 }
 // Guaranteed bounded fallback for unusually dense sentences.
 if(placements.length!==words.length){grid=Array(size*size).fill('');placements=shuffled(words,random).map((word,row)=>{const offset=Math.floor(random()*(size-word.length+1));const cells=Array.from(word,(_,i)=>row*size+offset+i);cells.forEach((cell,i)=>grid[cell]=word[i]);return {word,cells};});}
 grid=grid.map(letter=>letter||letters[Math.floor(random()*letters.length)]);
 return {size,grid,words,placements,difficulty,found:[],foundCells:[],hint:null};
}
export function selectionCells(puzzle,start,end){
 const {size,difficulty}=puzzle;if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<0||start>=size*size||end>=size*size)return [];
 const r=Math.floor(end/size)-Math.floor(start/size),c=end%size-start%size;
 if(r&&c&&Math.abs(r)!==Math.abs(c))return [];
 if(start===end)return [start];
 if(!(difficulty==='hard'?HARD:EASY).some(([dr,dc])=>dr===Math.sign(r)&&dc===Math.sign(c)))return [];
 return Array.from({length:Math.max(Math.abs(r),Math.abs(c))+1},(_,i)=>start+i*(Math.sign(r)*size+Math.sign(c)));
}
export function selectSearch(puzzle,start,end){
 const cells=selectionCells(puzzle,start,end),word=cells.map(i=>puzzle.grid[i]).join('');
 if(!puzzle.words.includes(word))return {status:'miss'};
 if(puzzle.found.includes(word))return {status:'already',word};
 puzzle.found.push(word);puzzle.foundCells.push(cells);if(puzzle.hint?.word===word)puzzle.hint=null;
 return {status:'found',word,complete:puzzle.found.length===puzzle.words.length};
}
export function searchHint(puzzle){
 if(!puzzle.hint)puzzle.hint=puzzle.placements.find(p=>!puzzle.found.includes(p.word))||null;
 return puzzle.hint;
}
