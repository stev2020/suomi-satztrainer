// Vanamo – Lernstand für „Endungen“: pro Lücke (Satz-ID:Wortposition) wann sie wieder dran ist.
// Gleiche Abstände wie bei den Verbformen: richtig → 1, 3, 9, 27, 60 Tage; falsch → sofort wieder fällig.
// Wird mit dem Konto synchronisiert (auth.js) und ist Teil der Sicherung.
const DAY=86400000;
const MAX_ENTRIES=20000;
const number=value=>Number.isSafeInteger(value)&&value>=0;
const FIELDS=['attempts','errors','streak','firstAt','due','updatedAt'];
export const endingKey=item=>item.id;

export function validateEndingsProgress(input={}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>MAX_ENTRIES)throw new Error('Ungültiger Endungen-Lernstand.');
 const out={};
 for(const [key,value] of Object.entries(input)){
  if(!/^[1-9]\d{0,15}:\d{1,3}$/.test(key)||!value||typeof value!=='object'||FIELDS.some(f=>!number(value[f]))||value.attempts<1||value.errors>value.attempts||value.streak>value.attempts||value.firstAt>value.updatedAt||value.due>8640000000000000)throw new Error('Ungültiger Endungen-Lernstand.');
  out[key]=Object.fromEntries(FIELDS.map(f=>[f,value[f]]));
 }
 return out;
}

// Neuere Antwort gewinnt; Zähler und erster Kontakt bleiben über Geräte hinweg erhalten.
export function mergeEndingsProgress(a={},b={}){
 const out={...(a||{})};
 for(const [key,value] of Object.entries(b||{})){
  const old=out[key];
  if(!old){out[key]={...value};continue;}
  const answer=value.updatedAt>old.updatedAt?value:old;
  out[key]={...answer,attempts:Math.max(old.attempts,value.attempts),errors:Math.max(old.errors,value.errors),firstAt:Math.min(old.firstAt||value.firstAt,value.firstAt||old.firstAt)};
 }
 return out;
}

export function markEndingAnswered(progress,key,correct,now=Date.now()){
 const old=progress[key],timestamp=Math.max(now,(old?.updatedAt||0)+1);
 const streak=correct?(old?.streak||0)+1:0;
 const interval=correct?Math.min(60,Math.pow(3,Math.min(streak-1,4)))*DAY:0;
 return {...progress,[key]:{attempts:(old?.attempts||0)+1,errors:(old?.errors||0)+(correct?0:1),streak,firstAt:old?.firstAt||timestamp,due:timestamp+interval,updatedAt:timestamp}};
}

// Zuletzt falsch beantwortet – kommt in der Endungsübung zuerst (und zählt für „Schwierige Wörter“).
export const missedEndings=progress=>new Set(Object.entries(progress||{}).filter(([,r])=>r.errors>0&&r.streak===0).map(([key])=>key));
