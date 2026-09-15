export const PRONOUNS = ['minä','sinä','hän','me','te','he'];
const DAY = 86400000;
const number = value => Number.isSafeInteger(value) && value >= 0;
const fields = ['seen','attempts','errors','streak','lastAskedAt','lastAnsweredAt','due','updatedAt'];
export const combinationKey = (verb,person) => verb.id + ':' + person;
export function validateVerbProgress(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 10000) throw new Error('Ungültiger Verbformen-Lernstand.');
  const out = {};
  for (const [key,value] of Object.entries(input)) {
    if (!/^[a-zäöå]+:[0-5]$/u.test(key) || !value || fields.some(f => !number(value[f])) || value.errors > value.attempts || value.streak > value.attempts || value.lastAnsweredAt > value.updatedAt || value.lastAskedAt > value.updatedAt || value.due > 8640000000000000) throw new Error('Ungültiger Verbformen-Lernstand.');
    out[key] = Object.fromEntries(fields.map(f => [f,value[f]]));
  }
  return out;
}
export function mergeVerbProgress(a = {},b = {}) {
  const out = {...a};
  for (const [key,value] of Object.entries(b)) {
    const old = out[key];
    if (!old) { out[key] = {...value}; continue; }
    // Asked and answered timestamps are independent: opening a question on
    // another device must not erase a newer answer or its repetition date.
    const compare = ['lastAnsweredAt','attempts','errors','streak','due','updatedAt']
      .map(field => value[field]-old[field]).find(delta => delta!==0) || 0;
    const answer = compare > 0 ? value : old;
    out[key] = {...answer,seen:Math.max(old.seen,value.seen),
      attempts:Math.max(old.attempts,value.attempts),errors:Math.max(old.errors,value.errors),
      lastAskedAt:Math.max(old.lastAskedAt,value.lastAskedAt),updatedAt:Math.max(old.updatedAt,value.updatedAt)};
  }
  return out;
}
const empty = () => ({seen:0,attempts:0,errors:0,streak:0,lastAskedAt:0,lastAnsweredAt:0,due:0,updatedAt:0});
export function markAsked(progress,key,now = Date.now()) {
  const old = progress[key] || empty(),timestamp = Math.max(now,old.updatedAt+1);
  return {...progress,[key]:{...old,seen:old.seen+1,lastAskedAt:timestamp,updatedAt:timestamp}};
}
export function markAnswered(progress,key,correct,now = Date.now()) {
  const old = progress[key] || empty(),timestamp = Math.max(now,old.updatedAt+1);
  const streak = correct ? old.streak+1 : 0;
  const interval = correct ? Math.min(60,Math.pow(3,Math.min(streak-1,4))) * DAY : 0;
  return {...progress,[key]:{...old,seen:Math.max(1,old.seen),attempts:old.attempts+1,
    errors:old.errors+(correct?0:1),streak,lastAnsweredAt:timestamp,due:timestamp+interval,updatedAt:timestamp}};
}
export function answerMatches(answer,verb,person) {
  const normalize = s => String(s).normalize('NFC').toLocaleLowerCase('fi').trim().replace(/\s+/g,' ');
  const value = normalize(answer),expected = normalize(verb.forms[person]);
  return value === PRONOUNS[person]+' '+expected || ((person!==2 && person!==5) && value === expected);
}
export function createVerbSession(count) {
  return {count:count===5?5:10,answers:[],current:null,draft:'',checked:false,correct:false,retries:[],history:[]};
}
export function chooseCombination(verbs,progress,session,now = Date.now(),random = Math.random) {
  const index = session.answers.length;
  const recent = new Set(session.history.slice(-2));
  const pick = list => list[Math.min(list.length-1,Math.floor(random()*list.length))];
  const all = verbs.flatMap(verb => PRONOUNS.map((_,person) => ({verb,person,key:combinationKey(verb,person)})));
  // A dedicated review round only asks forms that were due when it started.
  // Each appears once; mistakes remain due for the next round.
  if (session.reviewKeys) {
    const remaining = all.filter(item => session.reviewKeys.includes(item.key) && !session.history.includes(item.key));
    return remaining.length ? pick(remaining) : null;
  }
  // A mistake returns only after two intervening questions. A short round
  // never grows indefinitely; outstanding mistakes remain due next round.
  const unseen = all.filter(item => !progress[item.key]?.seen && !recent.has(item.key));
  if (unseen.length && (index%5===0 || index%5===3)) return pick(unseen);
  const retry = session.retries.find(r => r.after <= index && !recent.has(r.key));
  if (retry) {
    session.retries = session.retries.filter(r => r.key !== retry.key);
    const found = all.find(item => item.key === retry.key);
    if (found) return found;
  }
  const candidates = all.filter(item => !recent.has(item.key) && !session.retries.some(r => r.key===item.key && r.after>index));
  const pool = candidates.length ? candidates : all.filter(item => !recent.has(item.key));
  if (!pool.length) return null;
  const fresh = pool.filter(item => !progress[item.key]?.seen);
  // Reserve two of every five positions for unseen forms so difficult verbs
  // cannot prevent coverage of the whole stock.
  if (fresh.length && (index%5===0 || index%5===3)) return pick(fresh);
  const difficultIds = new Set(verbs.filter(verb => {
    const records=PRONOUNS.map((_,p)=>progress[combinationKey(verb,p)]).filter(Boolean);
    return records.reduce((n,r)=>n+r.errors,0)>=2 && records.some(r=>r.attempts && r.streak<2);
  }).map(v=>v.id));
  const relatedForms = fresh.filter(item=>difficultIds.has(item.verb.id));
  if(index%5===2 && relatedForms.length)return pick(relatedForms);
  const due = pool.filter(item => progress[item.key]?.seen && progress[item.key].due<=now);
  if (due.length) {
    due.sort((a,b) => progress[a.key].due-progress[b.key].due);
    return pick(due.slice(0,Math.max(1,Math.ceil(due.length/3))));
  }
  const difficult = new Set(verbs.filter(verb => {
    const records = PRONOUNS.map((_,p)=>progress[combinationKey(verb,p)]).filter(Boolean);
    return records.reduce((n,r)=>n+r.errors,0)>=2 && records.some(r=>r.attempts && r.streak<2);
  }).map(v=>v.id));
  const related = fresh.filter(item => difficult.has(item.verb.id));
  if (related.length) return pick(related);
  if (fresh.length) return pick(fresh);
  // Everything has been seen: prefer the least secure, least recently asked
  // combinations while allowing practice ahead of the next due date.
  pool.sort((a,b)=>(progress[a.key]?.streak||0)-(progress[b.key]?.streak||0) ||
    (progress[a.key]?.lastAskedAt||0)-(progress[b.key]?.lastAskedAt||0));
  return pick(pool.slice(0,Math.min(12,pool.length)));
}
export function verbSummary(verbs,progress,now = Date.now()) {
  let seen=0,secure=0,due=0;
  for (const verb of verbs) for(let person=0;person<6;person++) {
    const r=progress[combinationKey(verb,person)];
    if(r?.seen) { seen++; if(r.streak>=2)secure++; if(r.due<=now)due++; }
  }
  return {total:verbs.length*6,seen,secure,due};
}
