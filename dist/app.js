import {VERBS} from './verbs-data.mjs';
import {PRONOUNS,validateVerbProgress,mergeVerbProgress,markAsked,markAnswered,answerMatches,createVerbSession,chooseCombination,verbSummary} from './verb-practice.mjs';
import {GRAMMAR_TOPICS,topicNotes} from './grammar-topics.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?escape(u.href):'#';}catch{return '#';}};
const STORE='suomi-learning-v1';
const SESSION='suomi-auth-session-v1';
const hasStoredSession=()=>{try{const s=JSON.parse(localStorage.getItem(SESSION));return !!(s?.access_token&&s?.refresh_token&&s?.user?.id);}catch{return false;}};
const accountActive=()=>document.body.dataset.account==='authenticated'||hasStoredSession();
if(!hasStoredSession())try{localStorage.removeItem(STORE);}catch{}
const REPORT_CATEGORIES={translation:'Übersetzung',grammar:'Grammatikhilfe',audio:'Aufnahme',level:'Level',other:'Sonstiges'};
let memory={reviews:{},favorites:[],daily:{},prefs:{},reports:{},writingRatings:{},verbProgress:{}};
try{const saved=hasStoredSession()?JSON.parse(localStorage.getItem(STORE)):null;if(saved&&typeof saved==='object'){for(const k of ['reviews','daily','prefs'])if(saved[k]&&typeof saved[k]==='object'&&!Array.isArray(saved[k]))memory[k]=saved[k];if(Array.isArray(saved.favorites))memory.favorites=saved.favorites.filter(Number.isInteger);if(saved.verbProgress)try{memory.verbProgress=validateVerbProgress(saved.verbProgress);}catch{}if(saved.writingRatings)try{memory.writingRatings=validateWritingRatings(saved.writingRatings);}catch{}if(saved.reports)try{memory.reports=validateReports(saved.reports);}catch{}}}catch{}
let grammar={},grammarAvailable=false;
let levels=[1,2,3,4,5,6];
let data=[],archived=[],level=levels.includes(memory.prefs.level)?memory.prefs.level:1,direction=['de-fi','random'].includes(memory.prefs.direction)?memory.prefs.direction:'fi-de',audioOnly=memory.prefs.audioOnly===true,mode='new',queue=[],initialCount=0,completed=0,revealed=false,player=null,ready=false;
let activity=['listen','dictation','writing','grammar','verbs'].includes(memory.prefs.activity)?memory.prefs.activity:'translate',speed=[0.5,0.75,1].includes(memory.prefs.speed)?memory.prefs.speed:1,draft='';
let grammarTopic=GRAMMAR_TOPICS.some(t=>t.id===memory.prefs.grammarTopic)?memory.prefs.grammarTopic:'negation';
const isTranslation=()=>['translate','grammar'].includes(activity);
const matchesTopic=s=>topicNotes(s,grammar,grammarTopic).length>0;
const writingSessions={};
const WRITING_RATINGS={right:'Richtig',almost:'Fast richtig',again:'Noch üben'};
const MIN_WRITING_SENTENCES=5;
const ACTIVITY_LABELS={translate:'Übersetzen',listen:'Hörübung',dictation:'Diktat',writing:'Schreibtest',grammar:'Grammatik',verbs:'Verbformen'};
const DIRECTION_LABELS={'fi-de':'Finnisch → Deutsch','de-fi':'Deutsch → Finnisch',random:'Zufällig'};
const isWritingEligible=s=>['fi-de','de-fi','listen','dictation'].some(kind=>Number(memory.reviews[`${s.id}:${kind}`]?.repetitions)>=2);
const writingPool=()=>[...data,...archived].filter(s=>s.level===level&&isWritingEligible(s));
function syncWritingAvailability(){
 const button=document.querySelector('[data-activity="writing"]'),count=ready?writingPool().length:0,available=ready&&count>=MIN_WRITING_SENTENCES;
 button.disabled=!available;button.setAttribute('aria-disabled',String(!available));button.textContent=available?'Schreibtest':`Schreibtest (${count}/${MIN_WRITING_SENTENCES})`;
 button.title=available?'Schreibtest starten':`Noch ${MIN_WRITING_SENTENCES-count} ${MIN_WRITING_SENTENCES-count===1?'Satz':'Sätze'} üben, dann ist der Schreibtest spielbar.`;
 return available;
}
const day=()=>new Date().toLocaleDateString('sv-SE');
const cardDirection=s=>direction==='random'?(s.practiceDirection||'fi-de'):direction;
const key=(s,dir=cardDirection(s))=>`${s.id}:${isTranslation()?dir:activity}`;
const review=(s,dir=cardDirection(s))=>memory.reviews[key(s,dir)];
const due=(s,dir=cardDirection(s))=>{const r=review(s,dir);return r&&Number.isFinite(r.due)&&r.due<=Date.now();};
const studyDirections=()=>isTranslation()&&direction==='random'?['fi-de','de-fi']:[direction];
const eligibleDirections=(s,selection=mode)=>studyDirections().filter(dir=>selection==='new'?!review(s,dir):selection==='review'?due(s,dir):memory.favorites.includes(s.id));
const base=(includeArchived=false)=>(includeArchived?[...data,...archived]:data).filter(s=>s.level===level&&(!(audioOnly||!isTranslation())||s.audios.length)&&(activity!=='grammar'||matchesTopic(s)));
const filtered=()=>activity==='grammar'?base():base(mode!=='new').filter(s=>eligibleDirections(s).length);
function persist(){memory.prefs={level,direction,audioOnly,activity,speed,grammarTopic};try{if(accountActive())localStorage.setItem(STORE,JSON.stringify(memory));else localStorage.removeItem(STORE);}catch{if(accountActive())$('notice').textContent='Dein Lernstand konnte gerade nicht lokal zwischengespeichert werden.';}}
let guestSaveNoticeShown=false;
function guestSaveHint(){if(accountActive()||guestSaveNoticeShown)return;guestSaveNoticeShown=true;const n=$('notice');if(n)n.textContent='Du übst ohne Konto. Dein Fortschritt wird nicht gespeichert. Registriere dich kostenlos, um ihn zu behalten.';}
function stopAudio(){if(player){player.pause();player=null;}const b=$('play-audio');if(b)b.querySelector('span').textContent='Anhören';}
const AUDIO_CACHE_LIMIT=8,audioCache=new Map();
function prepareAudio(url){
 if(typeof Audio==='undefined'||!url)return null;
 if(audioCache.has(url)){const cached=audioCache.get(url);audioCache.delete(url);audioCache.set(url,cached);return cached;}
 const audio=new Audio();audio.preload='auto';audio.src=url;audio.load();audioCache.set(url,audio);
 while(audioCache.size>AUDIO_CACHE_LIMIT){const [oldURL,oldAudio]=audioCache.entries().next().value;oldAudio.pause();oldAudio.removeAttribute('src');oldAudio.load();audioCache.delete(oldURL);}
 return audio;
}
function preloadQueueAudio(){const urls=queue.slice(0,3).map(s=>s.audios?.[0]?.download_url).filter(Boolean);for(const url of new Set(urls))prepareAudio(url);}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function renderStats(){
 syncWritingAvailability();
 const verbStats=verbSummary(VERBS,memory.verbProgress);
 $('verb-progress-summary').textContent=`${verbStats.seen} von ${verbStats.total} Formen gesehen · ${verbStats.secure} sicher · ${verbStats.due} zum Wiederholen`;
 $('today-count').textContent=memory.daily[day()]||0;
 $('total').textContent=`${data.length} finnische Sätze`;
 $('audio-total').textContent=`${data.filter(s=>s.audios.length).length} mit Originalaufnahme`;
 $('levels').innerHTML=levels.map(n=>{const all=(activity==='writing'?[...data,...archived]:data).filter(s=>s.level===n&&(['translate','grammar','writing','verbs'].includes(activity)||s.audios.length)&&(activity!=='grammar'||matchesTopic(s))),seen=all.filter(s=>activity==='writing'?isWritingEligible(s):activity==='verbs'?['fi-de','de-fi'].some(dir=>memory.reviews[s.id+':'+dir]):studyDirections().some(dir=>review(s,dir))).length;return `<button class="level ${n===level?'active':''}" data-level="${n}" aria-pressed="${n===level}"><span class="level-number">${String(n).padStart(2,'0')}</span><span><b>Level ${n}</b><small>${activity==='writing'?`${seen} Sätze bereit`:`${seen} von ${all.length} geübt`}</small></span></button>`;}).join('');
 $('new-count').textContent=base().filter(s=>eligibleDirections(s,'new').length).length;
 const dueCount=base(true).filter(s=>eligibleDirections(s,'review').length).length;
 $('due-count').textContent=dueCount;
 renderHomeSession(verbStats,dueCount);
 $('fav-count').textContent=base(true).filter(s=>memory.favorites.includes(s.id)).length;
 $('practice-summary').textContent=`Level ${level} · ${ACTIVITY_LABELS[activity]}`;
 $('settings-level').textContent=`Level ${level}`;
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
 if(activity==='verbs'){
  $('practice-summary').textContent='Verbformen · Präsens';
  $('session-title').textContent='Verbformen · Präsens';
  const count=verbSession?.answers.length||0,total=verbSession?.count||0;
  $('session-progress').textContent=total?`${count} / ${total}`:'Aufgabenanzahl wählen';
  $('progress-bar').style.width=total?`${count/total*100}%`:'0%';return;
 }
 if(activity==='writing'){const session=writingSessions[level],total=session?.items.length||0,count=session?.answers.length||0;$('session-title').textContent=`Level ${level} · Schreibtest · Deutsch → Finnisch`;$('session-progress').textContent=total?`${count} / ${total}`:(writingPool().length>=MIN_WRITING_SENTENCES?'Satzanzahl wählen':'Noch keine Sätze bereit');$('progress-bar').style.width=total?`${count/total*100}%`:'0%';return;}
 $('session-title').textContent=`Level ${level} · ${activity==='grammar'?GRAMMAR_TOPICS.find(t=>t.id===grammarTopic).label:mode==='new'?'Neue Sätze · Audio zuerst':mode==='review'?'Wiederholen':'Deine Favoriten'}`;
 $('session-progress').textContent=initialCount?`${completed} / ${completed+queue.length}`:'Keine Karten ausgewählt';
 $('progress-bar').style.width=initialCount?`${completed/(completed+queue.length)*100}%`:'0%';
}
function renderHomeSession(verbStats,dueCount){
 const descriptions={translate:'Übe finnische Sätze und ihre deutsche Übersetzung.',listen:'Höre finnische Sätze und verstehe ihre Bedeutung.',dictation:'Höre einen finnischen Satz und schreibe ihn auf.',verbs:'Übe die richtige Verbform im Präsens.',writing:'Übersetze bekannte deutsche Sätze ins Finnische.',grammar:'Übe Sätze zu einem bestimmten Grammatikthema.'};
 const detail=activity==='grammar'?GRAMMAR_TOPICS.find(t=>t.id===grammarTopic)?.label:activity==='writing'?'Deutsch → Finnisch':isTranslation()?DIRECTION_LABELS[direction]:'Mit Originalaufnahme';
 $('continue-title').textContent=ACTIVITY_LABELS[activity];
 $('home-session-description').textContent=descriptions[activity];
 $('home-direction-control').hidden=activity!=='translate';
 document.querySelectorAll('[data-home-direction]').forEach(b=>{const selected=b.dataset.homeDirection===direction;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('home-session-meta').textContent=activity==='verbs'?VERBS.length+' Verben · Präsens · alle sechs Personen':'Level '+level+(activity==='translate'?'':' · '+detail)+(isTranslation()&&audioOnly?' · Nur mit Audio':'');
 $('continue-practice').textContent=activity==='translate'?(direction==='random'?'Beide Lernrichtungen':DIRECTION_LABELS[direction])+' üben':ACTIVITY_LABELS[activity]+' üben';
 $('continue-practice').disabled=!ready;
 const count=activity==='verbs'?verbStats.due:dueCount;
 const unit=activity==='verbs'?(count===1?'Verbform':'Verbformen'):(count===1?'Satz':'Sätze');
 $('home-review').textContent=count?count+' '+unit+' wiederholen':'Keine '+(activity==='verbs'?'Verbformen':'Sätze')+' zu wiederholen';
 $('home-review').disabled=!ready||count===0;
 $('home-review').hidden=['writing','grammar'].includes(activity);
 $('home-review').setAttribute('aria-label',$('home-review').textContent+' · '+ACTIVITY_LABELS[activity]+(isTranslation()?' · '+DIRECTION_LABELS[direction]:''));
 document.querySelectorAll('[data-home-activity]').forEach(b=>{const selected=b.dataset.homeActivity===activity;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
}
function prioritizeAudio(pool){return [...shuffle(pool.filter(s=>s.audios.length&&!s.translations[0].origin)),...shuffle(pool.filter(s=>s.audios.length&&!!s.translations[0].origin)),...shuffle(pool.filter(s=>!s.audios.length))];}
function start(){if(!ready)return;stopAudio();draft='';if(activity==='writing'&&!syncWritingAvailability())activity='translate';syncControls();if(activity==='verbs'){queue=[];revealed=false;persist();render();return;}if(activity==='writing'){queue=[];revealed=false;persist();render();return;}const pool=filtered();queue=(mode==='new'&&activity!=='grammar'?prioritizeAudio(pool):shuffle(pool)).slice(0,10).map(s=>{const choices=activity==='grammar'?studyDirections():eligibleDirections(s);return {...s,practiceDirection:choices[Math.floor(Math.random()*choices.length)]};});initialCount=queue.length;completed=0;revealed=false;persist();render();}
function source(s){
 const original=()=>`<a href="https://tatoeba.org/en/sentences/show/${s.id}" target="_blank" rel="noopener">#${s.id} · ${escape(s.owner||'Tatoeba')}</a> · ${escape(s.license)}`;
 if(s.origin==='english_bridge')return `Für diese App mit KI aus dem Englischen übersetzt.<br>Englische Vorlage: ${source(s.source)}<br><span lang="en">${escape(s.source.text)}</span>`;
 if(s.origin==='finnish_adaptation')return `Für diese App mit KI aus dem Finnischen übersetzt.<br>Finnische Vorlage: ${source(s.source)}`;
 if(s.origin==='tatoeba_via_english')return `${original()}<br>Indirekt über eine gemeinsame englische Vorlage verknüpft: ${source(s.source)}<br><span lang="en">${escape(s.source.text)}</span>`;
 return original();
}
function translationNote(s){
 const origin=s.translations[0].origin;
 if(origin==='english_bridge')return 'Deutsch aus einer englischen Tatoeba-Vorlage übersetzt.';
 if(origin==='finnish_adaptation')return 'Deutsche Fassung für diese App aus dem Finnischen übersetzt.';
 if(origin==='tatoeba_via_english')return 'Deutsche Tatoeba-Fassung über eine gemeinsame englische Vorlage verknüpft.';
 return '';
}
function syncControls(){
 $('settings-level-row').hidden=activity==='verbs';
 $('grammar-controls').hidden=activity!=='grammar';
 if(activity==='grammar'){
  const topic=GRAMMAR_TOPICS.find(t=>t.id===grammarTopic);
  $('grammar-topic').innerHTML=GRAMMAR_TOPICS.map(t=>{const count=data.filter(s=>s.level===level&&(!audioOnly||s.audios.length)&&topicNotes(s,grammar,t.id).length).length;return `<option value="${t.id}" ${t.id===grammarTopic?'selected':''}>${t.label} · ${count} Sätze</option>`;}).join('');
  $('grammar-help').textContent=grammarAvailable?`${topic.hint} Bis zu 10 Sätze pro Runde, auch bereits gelernte. Bewertungen zählen zur gewählten Lernrichtung.`:'Die Grammatikhilfen konnten nicht geladen werden. Bitte lade die Seite bei bestehender Verbindung neu.';
 }
 $('practice-toolbar').hidden=['writing','verbs'].includes(activity);$('learning-modes').hidden=['writing','grammar','verbs'].includes(activity);$('writing-help').hidden=activity!=='writing';$('writing-review-controls').hidden=activity!=='writing';$('writing-history').hidden=true;
 $('direction-group').hidden=!isTranslation();
 for(const [name,value] of [['activity',activity],['direction',direction]])document.querySelectorAll(`[data-${name}]`).forEach(b=>{const selected=b.dataset[name]===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
 $('audio-only').disabled=!isTranslation();
 $('audio-only').checked=!isTranslation()||audioOnly;
 $('notice').textContent='';
}
function questionMarkup(s,front){
 if(!isTranslation()&&!revealed)return `<h2 class="listening-title">${activity==='listen'?'Hör genau hin.':'Was hörst du?'}</h2><p class="listening-hint">${activity==='listen'?'Höre den finnischen Satz und überlege, was er bedeutet.':'Höre den finnischen Satz und schreibe ihn auf.'}</p>`;
 return `<p class="sentence" lang="${!isTranslation()||cardDirection(s)==='fi-de'?'fi':'de'}">${escape(front)}</p>`;
}
const normalizeAnswer=s=>s.normalize('NFC').toLocaleLowerCase('fi').replace(/[\p{P}\p{S}]/gu,'').replace(/\s+/g,' ').trim();
function compareAnswer(typed,expected){
 const a=Array.from(normalizeAnswer(typed)),b=Array.from(normalizeAnswer(expected));
 const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
 for(let i=0;i<=a.length;i++)dp[i][0]=i;
 for(let j=0;j<=b.length;j++)dp[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(a[i-1]===b[j-1]?0:1));
 let i=a.length,j=b.length,t=[],e=[];
 const mark=(c,kind)=>`<mark class="diff-${kind}">${escape(c===' '?'␣':c)}</mark>`;
 while(i||j){
  if(i&&j&&a[i-1]===b[j-1]){t.push(escape(a[--i]));e.push(escape(b[--j]));}
  else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){t.push(mark(a[--i],'wrong'));e.push(mark(b[--j],'needed'));}
  else if(i&&dp[i][j]===dp[i-1][j]+1)t.push(mark(a[--i],'wrong'));
  else e.push(mark(b[--j],'needed'));
 }
 return {same:dp[a.length][b.length]===0,typed:t.reverse().join(''),expected:e.reverse().join('')};
}
function dictationMarkup(s){
 if(activity!=='dictation')return '';
 if(!revealed)return `<div class="dictation"><label for="dictation-input">Deine Eingabe auf Finnisch</label><textarea id="dictation-input" lang="fi" rows="3" maxlength="500" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-describedby="dictation-hint" placeholder="Schreibe hier, was du hörst …"></textarea><div class="letter-buttons"><button type="button" data-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-letter="ö" aria-label="ö einfügen">ö</button></div><p id="dictation-hint">Achte auf ä, ö und doppelte Buchstaben. Du kannst die Aufnahme beliebig oft wiederholen.</p></div>`;
 const c=compareAnswer(draft,s.text);
 return `<div class="dictation comparison"><h3>${c.same?'Richtig gehört und geschrieben!':'Vergleiche die markierten Stellen.'}</h3><span>Deine Eingabe</span><p lang="fi">${c.typed||'—'}</p>${c.same?'':`<span>Vorlage · fehlende oder andere Zeichen</span><p lang="fi">${c.expected}</p>`}<small>Großschreibung, Satzzeichen und zusätzliche Leerzeichen werden beim Vergleich ignoriert.</small></div>`;
}
const writingReviewPool=()=>writingPool().filter(s=>['almost','again'].includes(memory.writingRatings?.[s.id]?.rating)).sort((a,b)=>{const x=memory.writingRatings[a.id],y=memory.writingRatings[b.id];return (x.rating==='again'?0:1)-(y.rating==='again'?0:1)||x.updatedAt-y.updatedAt;});
function startWritingSession(force=false,reviewOnly=false,sentenceCount=10){
 const limit=sentenceCount===5?5:10;
 if(force||!writingSessions[level]?.items.length)writingSessions[level]={items:(reviewOnly?writingReviewPool():shuffle(writingPool())).slice(0,limit),answers:[],draft:'',reviewOnly,ratings:{}};
}
function rateWritingAnswer(session,id,rating){
 if(activity!=='writing'||writingSessions[level]!==session||session.answers.length!==session.items.length||!session.items.some(s=>s.id===id)||!Object.hasOwn(WRITING_RATINGS,rating))return;
 const old=memory.writingRatings?.[id],updatedAt=Math.max(Date.now(),(old?.updatedAt||0)+1);
 try{commitLearning({...memory,writingRatings:{...memory.writingRatings,[id]:{rating,updatedAt}}});}
 catch{$('notice').textContent='Dein Browser konnte die Bewertung nicht speichern. Bitte versuche es erneut.';return;}
 session.ratings={...session.ratings,[id]:rating};
 renderWritingSession();$('notice').textContent=accountActive()?(rating==='right'?'Als richtig gespeichert. Dieser Satz steht nicht mehr auf deiner Wiederholungsliste.':'Für die gezielte Wiederholung gespeichert.'):(rating==='right'?'Für diese Sitzung als richtig markiert.':'Für diese Sitzung zur Wiederholung markiert.');
 document.querySelectorAll('[data-writing-rating]').forEach(b=>{if(Number(b.dataset.writingId)===id&&b.dataset.writingRating===rating)b.focus();});
}
function renderWritingReviewControls(){
 const count=writingReviewPool().length,session=writingSessions[level],active=session?.items.length&&session.answers.length<session.items.length&&(session.answers.length>0||session.draft.trim().length>0);
 $('writing-review-controls').hidden=activity!=='writing';
 $('writing-review-controls').innerHTML=`<span>${count?`${count} ${count===1?'Satz':'Sätze'} zum gezielten Wiederholen`:'Noch keine Sätze zum gezielten Wiederholen markiert.'}</span><button id="writing-review-start" ${!count||active?'disabled':''}>Markierte Sätze üben</button>${active&&count?'<small>Nach der laufenden Sitzung kannst du die Wiederholungsrunde starten.</small>':''}`;
 $('writing-review-start').onclick=()=>{if(!writingReviewPool().length)return;const current=writingSessions[level];if(current?.items.length&&current.answers.length<current.items.length&&(current.answers.length||current.draft.trim())){$('notice').textContent='Beende zuerst deine laufende Sitzung. Deine Eingabe bleibt erhalten.';return;}startWritingSession(true,true);$('notice').textContent='';render();$('writing-input')?.focus();};
}

function submitWritingAnswer(session,index){
 if(activity!=='writing'||writingSessions[level]!==session||session.answers.length!==index||index>=session.items.length)return;
 const answer=session.draft.trim();if(!answer){$('notice').textContent='Schreibe zuerst deine Übersetzung auf Finnisch.';$('writing-input').focus();return;}if(answer.length>2000){$('notice').textContent='Deine Antwort darf höchstens 2.000 Zeichen enthalten.';return;}
 session.answers.push(answer);session.draft='';memory.daily[day()]=(Number(memory.daily[day()])||0)+1;$('notice').textContent='';persist();render();
 if(session.answers.length<session.items.length)$('writing-input').focus();else $('writing-result-title').focus();
}
function renderWritingSession(){
 renderWritingReviewControls();stopAudio();renderStats();$('keyboard-note').hidden=true;$('actions').innerHTML='';$('writing-history').hidden=true;
 const session=writingSessions[level];if(!session?.items.length){const available=writingPool().length;if(available>=MIN_WRITING_SENTENCES){$('card').className='card writing-setup';$('card').innerHTML=`<h2 id="writing-setup-title" tabindex="-1">Wie viele Sätze möchtest du schreiben?</h2><p>Wähle die Länge deines Schreibtests. Aktuell sind ${available} geeignete ${available===1?'Satz':'Sätze'} in diesem Level verfügbar.</p><div class="choice-buttons writing-count-options" role="group" aria-label="Satzanzahl wählen"><button type="button" data-writing-count="5">5 Sätze</button><button type="button" data-writing-count="10" ${available<10?'disabled title="Dafür brauchst du mindestens 10 geeignete Sätze."':''}>10 Sätze</button></div>`;document.querySelectorAll('[data-writing-count]').forEach(b=>b.onclick=()=>{startWritingSession(true,false,Number(b.dataset.writingCount));$('notice').textContent='';render();$('writing-input')?.focus();});return;}$('card').className='card empty';$('card').innerHTML='<h2>Noch keine Sätze bereit.</h2><p>Übe mindestens fünf Sätze jeweils zweimal in derselben Lernrichtung oder Hörübung. Du kannst auch ein anderes Level wählen.</p>';$('actions').innerHTML='<button id="writing-go-learn" class="primary">Sätze üben</button>';$('writing-go-learn').onclick=()=>{activity='translate';mode='new';start();};return;}
 const count=session.answers.length,total=session.items.length;
 if(count===total){
  $('card').className='card writing-results';
  $('card').innerHTML=`<h2 id="writing-result-title" tabindex="-1">${session.reviewOnly?'Auflösung deiner Wiederholung':'Deine Auflösung'}</h2><p class="writing-results-intro">${total} ${total===1?'Satz bearbeitet':'Sätze bearbeitet'}. Vergleiche Bedeutung und Formulierung. Andere Übersetzungen können ebenfalls richtig sein; es gibt keine automatische Fehlerbewertung. Markiere deine Antworten freiwillig: „Fast richtig“ und „Noch üben“ kommen auf die Wiederholungsliste, „Richtig“ entfernt sie daraus.</p>${session.items.map((s,i)=>{const same=normalizeAnswer(session.answers[i])===normalizeAnswer(s.text);return `<article class="writing-result"><h3>${i+1}. <span lang="de">${escape(s.translations[0].text)}</span></h3><div class="writing-comparison"><div><h4>Deine Antwort</h4><p lang="fi">${escape(session.answers[i])}</p></div><div><h4>Finnische Vorlage</h4><p lang="fi">${escape(s.text)}</p></div></div><p class="writing-match">${same?'Entspricht der Vorlage (Großschreibung, Leerzeichen und Satzzeichen ausgenommen).':'Abweichende Formulierung – prüfe selbst, ob die Bedeutung stimmt.'}</p>${translationNote(s)?`<p class="bridge-note">${escape(translationNote(s))}</p>`:''}<details class="sources"><summary>Quellen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations[0])}</p></details><div class="writing-rating-buttons" role="group" aria-label="Antwort ${i+1} selbst bewerten">${Object.entries(WRITING_RATINGS).map(([value,label])=>`<button data-writing-id="${s.id}" data-writing-rating="${value}" aria-pressed="${session.ratings?.[s.id]===value}">${label}</button>`).join('')}</div><p class="writing-rating-status">${session.ratings?.[s.id]?`Deine Bewertung: ${WRITING_RATINGS[session.ratings[s.id]]}`:'Noch nicht bewertet'}</p><button class="report-error" data-writing-report="${s.id}">Fehler melden</button></article>`;}).join('')}`;
  $('actions').innerHTML='<button class="primary" id="writing-new-session">Neuer Schreibtest</button>';$('writing-new-session').onclick=()=>{delete writingSessions[level];$('notice').textContent='';render();$('writing-setup-title')?.focus();};
  document.querySelectorAll('[data-writing-rating]').forEach(b=>b.onclick=()=>rateWritingAnswer(session,Number(b.dataset.writingId),b.dataset.writingRating));
  document.querySelectorAll('[data-writing-report]').forEach(b=>b.onclick=()=>{const s=session.items.find(s=>s.id===Number(b.dataset.writingReport));if(s)openReport(s);});return;
 }
 const s=session.items[count];$('card').className='card writing-card';
 $('card').innerHTML=`<div class="card-top"><span class="card-label">${session.reviewOnly?'Gezielte Wiederholung':'Schreibtest'} · Deutsch → Finnisch</span><span class="writing-counter">Satz ${count+1} von ${total}</span></div><p class="sentence" lang="de">${escape(s.translations[0].text)}</p><div class="dictation"><label for="writing-input">Deine Übersetzung auf Finnisch</label><textarea id="writing-input" lang="fi" rows="3" maxlength="2000" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-describedby="writing-input-hint" placeholder="Schreibe deine Antwort …"></textarea><div class="letter-buttons"><button type="button" data-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-letter="ö" aria-label="ö einfügen">ö</button></div><p id="writing-input-hint" class="translation-hint">Mit OK gibst du deine Antwort ab. Die Vorlage siehst du erst am Ende.</p></div>`;
 const input=$('writing-input');input.value=session.draft;input.oninput=e=>{session.draft=e.target.value;$('notice').textContent='';};
 document.querySelectorAll('[data-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart;if(input.value.length-(input.selectionEnd-pos)>=2000)return;input.setRangeText(b.dataset.letter,pos,input.selectionEnd,'end');session.draft=input.value;input.focus();};});
 $('actions').innerHTML=`<button class="primary" id="writing-ok">${count+1===total?'OK · Zur Auflösung':'OK · Nächster Satz'}</button>`;$('writing-ok').onclick=()=>submitWritingAnswer(session,count);
 $('writing-history').hidden=count===0;$('writing-history').innerHTML=count?`<h2 id="writing-history-title">Deine bisherigen Antworten</h2><ol>${session.answers.map((answer,i)=>`<li><p lang="de">${escape(session.items[i].translations[0].text)}</p><p lang="fi" class="writing-history-answer">${escape(answer)}</p></li>`).join('')}</ol>`:'';
}

function translationDraftMarkup(s){
 if(!isTranslation()||cardDirection(s)==='fi-de')return '';
 const target=cardDirection(s)==='fi-de'?'de':'fi',label=target==='de'?'Deutsch':'Finnisch';
 if(revealed)return draft.trim()?`<div class="own-translation"><span class="card-label">Deine Übersetzung · ${label}</span><p lang="${target}">${escape(draft)}</p><small>Vergleiche die Bedeutung mit der Vorlage. Auch andere Formulierungen können richtig sein.</small></div>`:'<p class="translation-hint">Lies die Vorlage und bewerte anschließend, wie gut du den Satz schon kannst.</p>';
 const letters=target==='fi'?['ä','ö']:['ä','ö','ü','ß'];
 return `<div class="dictation translation-entry"><label for="translation-input">Deine Übersetzung auf ${label} (optional)</label><textarea id="translation-input" lang="${target}" rows="3" maxlength="2000" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-describedby="translation-hint" placeholder="Optional: Schreibe deine Übersetzung …"></textarea><div class="letter-buttons">${letters.map(letter=>`<button type="button" data-letter="${letter}" aria-label="${letter} einfügen">${letter}</button>`).join('')}</div><p id="translation-hint">Du kannst die Übersetzung auch direkt anzeigen lassen, ohne etwas einzutippen.</p></div>`;
}
function grammarMarkup(s){
 if(!revealed)return '';
 const entry=grammar[String(s.id)];
 const notes=entry?.sentence===s.text?(activity==='grammar'?topicNotes(s,grammar,grammarTopic):entry.notes):[];
 if(!notes?.length)return `<details class="grammar"><summary>Grammatik verstehen</summary><p>${grammarAvailable?'Für diesen Satz ist noch keine Grammatikhilfe hinterlegt.':'Die Grammatikhilfe ist gerade nicht verfügbar. Lade die Seite bei bestehender Verbindung neu.'}</p></details>`;
 return `<details class="grammar" ${activity==='grammar'?'open':''}><summary>${activity==='grammar'?escape(GRAMMAR_TOPICS.find(t=>t.id===grammarTopic).label):'Grammatik verstehen'} <span>${notes.length} ${notes.length===1?'Hinweis':'Hinweise'}</span></summary><div class="grammar-notes">${notes.map(n=>`<article><h3>${escape(n.title)}</h3><p class="grammar-focus" lang="fi">${escape(n.focus)}</p><p>${escape(n.text)}</p></article>`).join('')}</div><p class="grammar-credit">Mit KI formulierte Lernhilfe zu ausgewählten Stellen im Satz. <a href="https://uusikielemme.fi/finnish-grammar" target="_blank" rel="noopener">Grammatik zum Nachlesen (Englisch) ↗</a></p></details>`;
}
function audioMarkup(s){if(!s.audios.length)return revealed&&s.audio_status==='license_missing'?'<p class="audio-license-note">Auf Tatoeba gibt es eine Aufnahme. Da keine Wiederverwendungsfreigabe angegeben ist, wird sie hier nicht eingebunden.</p>':'';if(isTranslation()&&cardDirection(s)==='de-fi'&&!revealed)return '';const a=s.audios[0];return `<div class="audio-row"><button class="audio-button" id="play-audio" aria-label="Finnischen Satz anhören"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></svg><span>Anhören</span></button><button class="audio-button" id="replay-audio" aria-label="Aufnahme von vorne wiederholen">↻ Wiederholen</button><label class="speed-label">Tempo<select id="speed" aria-label="Wiedergabegeschwindigkeit"><option value="1" ${speed===1?'selected':''}>Normal</option><option value="0.75" ${speed===0.75?'selected':''}>Langsam · 0,75×</option><option value="0.5" ${speed===0.5?'selected':''}>Sehr langsam · 0,5×</option></select></label><a href="${safeURL(a.download_url)}" target="_blank" rel="noopener">Audiodatei ↗</a></div>`;}

let verbSession = null;
function saveVerbProgress(progress,answered=false) {
 const daily=answered?{...memory.daily,[day()]:(Number(memory.daily[day()])||0)+1}:memory.daily;
 try { commitLearning({...memory,verbProgress:progress,daily}); return true; }
 catch { $('notice').textContent='Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.'; return false; }
}
function nextVerbQuestion() {
 const item=chooseCombination(VERBS,memory.verbProgress,verbSession);
 if(!item)return;
 if(!saveVerbProgress(markAsked(memory.verbProgress,item.key)))return;
 verbSession.current=item;verbSession.draft='';verbSession.checked=false;
 verbSession.history.push(item.key);render();$('verb-input')?.focus();
}
function submitVerbAnswer() {
 const session=verbSession;
 if(activity!=='verbs'||!session?.current||session.checked)return;
 const answer=session.draft.trim();
 if(!answer){$('notice').textContent='Trage zuerst die Verbform ein.';$('verb-input')?.focus();return;}
 const {verb,person,key}=session.current,correct=answerMatches(answer,verb,person);
 if(!saveVerbProgress(markAnswered(memory.verbProgress,key,correct),true))return;
 session.checked=true;session.correct=correct;
 const answeredIndex=session.answers.length;
 session.answers.push({verb,person,answer,correct});
 if(!correct){session.retries=session.retries.filter(r=>r.key!==key);session.retries.push({key,after:answeredIndex+3});}
 $('notice').textContent='';render();guestSaveHint();$('verb-next')?.focus();
}
function renderVerbSession() {
 stopAudio();renderStats();$('writing-history').hidden=true;$('actions').innerHTML='';$('keyboard-note').hidden=true;
 const card=$('card'),session=verbSession,summary=verbSummary(VERBS,memory.verbProgress);
 card.className='card verb-card';
 if(!session){
  card.innerHTML=`<span class="card-label">Verbformen · Präsens</span><h2>Wie viele Formen möchtest du üben?</h2><p>200 Verben · Zufällige Personalpronomen · Neue Formen und gezielte Wiederholungen</p><p class="verb-coverage">${summary.seen} von ${summary.total} Formen schon gesehen · ${summary.secure} sicher</p><div class="choice-buttons verb-counts" role="group" aria-label="Anzahl der Aufgaben"><button type="button" data-verb-count="5">5 Aufgaben</button><button type="button" data-verb-count="10">10 Aufgaben</button></div><p class="verb-hint">Nach jeder Antwort siehst du alle sechs Formen. Schwierige Formen kommen mit Abstand wieder.</p>`;
  card.querySelectorAll('[data-verb-count]').forEach(b=>b.onclick=()=>{verbSession=createVerbSession(Number(b.dataset.verbCount));$('practice-settings').open=false;nextVerbQuestion();});
  return;
 }
 if(!session.current){
  const correct=session.answers.filter(a=>a.correct).length;
  card.innerHTML=`<span class="complete-mark">✓</span><h2 tabindex="-1" id="verb-result-title">Runde geschafft.</h2><p>${correct} von ${session.answers.length} Antworten richtig.</p><p>Schwierige Formen bleiben für kommende Runden vorgemerkt.</p><ol class="verb-results">${session.answers.map(a=>`<li><span>${a.correct?'✓ Richtig':'Noch üben'}</span><strong lang="fi">${PRONOUNS[a.person]} ${escape(a.verb.forms[a.person])}</strong><small>${escape(a.verb.id)} · ${escape(a.verb.de)}</small>${a.correct?'':`<small>Deine Antwort: <span lang="fi">${escape(a.answer)}</span></small>`}</li>`).join('')}</ol>`;
  $('actions').innerHTML='<button type="button" class="primary" id="verb-again">Neue Runde</button>';
  $('verb-again').onclick=()=>{verbSession=null;mode='new';render();};return;
 }
 const {verb,person}=session.current;
 card.innerHTML=`<div class="card-top"><span class="card-label">Verbformen</span><span>${session.checked?session.answers.length:session.answers.length+1} von ${session.count}</span></div><p class="verb-hint">Welche Form? · Präsens</p><h2 class="verb-question" lang="fi">${PRONOUNS[person]} · ${escape(verb.id)}</h2><p class="verb-meaning">${escape(verb.de)}</p><form id="verb-form"><label for="verb-input">Deine Verbform</label><input id="verb-input" lang="fi" maxlength="100" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-describedby="verb-input-hint" placeholder="Deine Antwort …" ${session.checked?'readonly':''} value="${escape(session.draft)}"><p class="verb-hint" id="verb-input-hint">${person===2||person===5?`Schreibe „${PRONOUNS[person]}“ zusammen mit der Verbform. Das Pronomen ist hier erforderlich.`:`Nur die Verbform oder mit „${PRONOUNS[person]}“.`} Achte auf ä, ö und doppelte Buchstaben.</p>${session.checked?'':`<div class="letter-buttons"><button type="button" data-verb-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-verb-letter="ö" aria-label="ö einfügen">ö</button></div><button class="primary" type="submit">Lösung prüfen</button>`}</form>${session.checked?`<div class="verb-feedback ${session.correct?'verb-correct':'verb-wrong'}" role="status">${session.correct?'✓ Richtig!':`Noch nicht richtig. Die Lösung ist <strong lang="fi">${person===2||person===5?PRONOUNS[person]+' ':''}${escape(verb.forms[person])}</strong>.`}</div><table class="verb-forms"><caption>Alle sechs Formen von <span lang="fi">${escape(verb.id)}</span></caption><thead><tr><th scope="col">Personalpronomen</th><th scope="col">Präsens</th></tr></thead><tbody>${PRONOUNS.map((p,i)=>`<tr class="${i===person?'verb-target':''}"><th scope="row" lang="fi">${p}${i===person?' <span class="verb-hint">(gefragt)</span>':''}</th><td lang="fi">${escape(verb.forms[i])}</td></tr>`).join('')}</tbody></table>`:''}`;
 const input=$('verb-input');input.oninput=()=>{if(!session.checked)session.draft=input.value;};
 $('verb-form').onsubmit=e=>{e.preventDefault();submitVerbAnswer();};
 card.querySelectorAll('[data-verb-letter]').forEach(b=>b.onclick=()=>{if(input.value.length>=100)return;input.setRangeText(b.dataset.verbLetter,input.selectionStart,input.selectionEnd,'end');session.draft=input.value;input.focus();});
 $('actions').innerHTML=`${session.checked?`<button type="button" class="primary" id="verb-next">${session.answers.length===session.count?'Auswertung':'Weiter'}</button>`:''}<button type="button" class="quiet" id="verb-abort">Runde beenden</button>`;
 if(session.checked)$('verb-next').onclick=()=>{if(session!==verbSession||!session.checked)return;if(session.answers.length>=session.count){session.current=null;render();$('verb-result-title')?.focus();}else nextVerbQuestion();};
 $('verb-abort').onclick=()=>{verbSession=null;render();};
}

function render(){if(activity==='verbs'){renderVerbSession();return;}if(activity==='writing'){renderWritingSession();return;}$('writing-history').hidden=true;stopAudio();renderStats();preloadQueueAudio();const s=queue[0];$('actions').innerHTML='';$('keyboard-note').hidden=!s;$('keyboard-note').textContent=isTranslation()?'Nach dem Vergleich: 1 / 2 / 3 zum Bewerten':'Aufnahme beliebig oft anhören · Nach dem Aufdecken: 1 / 2 / 3 zum Bewerten';
 if(!s){$('card').className='card empty';if(initialCount){$('card').innerHTML='<span class="complete-mark">✓</span><h2>Gut gemacht.</h2><p>Deine Lerneinheit ist geschafft. Dein nächster Satz wartet schon.</p>';$('actions').innerHTML='<button class="primary" id="next-session">Nächste Lerneinheit</button>';$('next-session').onclick=start;}else{let title='Alles für heute wiederholt.',text='Hier erscheinen die Sätze, sobald deine nächste Wiederholung fällig ist.';if(mode==='new'){title='In diesem Level ist alles entdeckt.';text='Wiederhole deine Sätze oder wechsle zum nächsten Level.';}if(mode==='favorites'){title='Deine Lieblingssätze warten hier.';text='Markiere einen Satz mit dem Stern auf der Lernkarte.';}if((audioOnly||!isTranslation())&&!base(mode!=='new').length){title='Hier gibt es noch keine Aufnahme.';text=isTranslation()?'Schalte „Nur mit Audio“ aus oder wähle ein anderes Level.':'Wähle ein anderes Level oder die Übungsart Übersetzen.';}if(activity==='grammar'){title=grammarAvailable?'Keine passenden Sätze in dieser Auswahl.':'Grammatikhilfen nicht verfügbar.';text=grammarAvailable?'Wähle ein anderes Grammatikthema oder Level. Falls aktiv, schalte „Nur mit Audio“ aus.':'Lade die Seite bei bestehender Verbindung neu.';}$('card').innerHTML=`<h2>${title}</h2><p>${text}</p>`;}return;}
 $('card').className='card';const saved=memory.favorites.includes(s.id),front=!isTranslation()?(revealed?s.text:''):cardDirection(s)==='fi-de'?s.text:s.translations[0].text;
 $('card').innerHTML=`<div class="card-top"><span class="card-label">${!isTranslation()?(activity==='listen'?'Hörmodus':'Diktat'):cardDirection(s)==='fi-de'?'Finnisch':'Deutsch'} <span>·</span> Level ${s.level}${s.level_assessment?.status==='estimated'?' · geschätzt':''}</span><button class="favorite ${saved?'saved':''}" id="favorite" aria-label="${saved?'Aus Favoriten entfernen':'Als Favorit speichern'}" aria-pressed="${saved}">${saved?'★':'☆'}</button></div>${questionMarkup(s,front)}${audioMarkup(s)}${dictationMarkup(s)}${translationDraftMarkup(s)}${revealed?`<div class="translation"><span class="card-label" style="justify-content:center">${isTranslation()?'Vorlage · ':''}${!isTranslation()||cardDirection(s)==='fi-de'?'Deutsch':'Finnisch'}</span>${!isTranslation()||cardDirection(s)==='fi-de'?s.translations.map((t,i)=>`<p lang="de" class="${i?'variant':''}">${escape(t.text)}</p>`).join(''):`<p lang="fi">${escape(s.text)}</p>`}</div>${grammarMarkup(s)}${translationNote(s)?`<p class="bridge-note">${escape(translationNote(s))}</p>`:''}<details class="sources"><summary>Quellen &amp; Aufnahmen</summary><p>Finnisch: ${source(s)}</p>${s.translations.map(t=>`<p>Deutsch: ${source(t)}</p>`).join('')}${s.audios.map(a=>`<p>Aufnahme: <a href="${safeURL(a.attribution_url||`https://tatoeba.org/en/user/profile/${encodeURIComponent(a.author)}`)}" target="_blank" rel="noopener">${escape(a.author)}</a> · <a href="${safeURL(licenseURL(a.license))}" target="_blank" rel="noopener">${escape(a.license)}</a></p>`).join('')}</details>`:''}`;
 $('card').insertAdjacentHTML('beforeend',`<button id="report-error" class="report-error">${Object.values(memory.reports).some(r=>r.sentenceId===s.id)?'Hinweis bearbeiten':'Fehler melden'}</button>`);
 $('report-error').onclick=()=>openReport(s);
 $('favorite').onclick=()=>{const i=memory.favorites.indexOf(s.id);if(i<0)memory.favorites.push(s.id);else memory.favorites.splice(i,1);persist();renderStats();const b=$('favorite'),active=memory.favorites.includes(s.id);b.classList.toggle('saved',active);b.textContent=active?'★':'☆';b.setAttribute('aria-pressed',active);b.setAttribute('aria-label',active?'Aus Favoriten entfernen':'Als Favorit speichern');guestSaveHint();};
 if($('play-audio')){$('play-audio').onclick=()=>play(s.audios[0]);$('replay-audio').onclick=()=>play(s.audios[0],true);$('speed').onchange=e=>{speed=Number(e.target.value);if(player)player.playbackRate=speed;persist();};}
 const inputId=activity==='dictation'?'dictation-input':isTranslation()&&cardDirection(s)==='de-fi'?'translation-input':null;
 if(inputId&&!revealed){const input=$(inputId);input.value=draft;input.oninput=e=>{draft=e.target.value;$('notice').textContent='';};document.querySelectorAll('[data-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart,limit=activity==='dictation'?500:2000;if(input.value.length-(input.selectionEnd-pos)>=limit)return;input.setRangeText(b.dataset.letter,pos,input.selectionEnd,'end');draft=input.value;input.focus();};});}
 if(!revealed){$('actions').innerHTML='<button class="primary" id="reveal">'+(activity==='dictation'?'Diktat vergleichen':activity==='listen'?'Satz & Übersetzung aufdecken':'Übersetzung anzeigen')+'</button>';$('reveal').onclick=()=>{if(activity==='dictation'&&!draft.trim()){$('notice').textContent='Schreibe zuerst auf, was du gehört hast.';$(inputId).focus();return;}$('notice').textContent='';revealed=true;render();$('grade-again').focus({preventScroll:true});};}
 else{$('actions').innerHTML='<button class="grade" id="grade-again" data-grade="again">Nochmal<span>In dieser Einheit</span></button><button class="grade" data-grade="hard">Schwer<span>Morgen</span></button><button class="grade easy" data-grade="easy">Leicht<span>'+easyDays(s)+' Tage</span></button>';document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(b.dataset.grade));}
}
function licenseURL(license){if(license==='CC0 1.0')return 'https://creativecommons.org/publicdomain/zero/1.0/';const m=license.match(/^CC (BY(?:-[A-Z]+)*) ([\d.]+)(?: (FR))?$/i);return m?`https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3]?'fr/':''}`:'https://tatoeba.org/en/terms_of_use';}
function easyDays(s){return Math.min(180,Math.max(3,Math.round((Number(review(s)?.interval)||0)*2.5)));}
function grade(g){if(activity==='writing')return;if(!revealed||!queue.length)return;const s=queue.shift(),interval=g==='again'?0:g==='hard'?1:easyDays(s);memory.reviews[key(s)]={due:Date.now()+interval*86400000,interval,repetitions:(Number(review(s)?.repetitions)||0)+1,updatedAt:Date.now()};memory.daily[day()]=(Number(memory.daily[day()])||0)+1;if(g==='again')queue.splice(Math.min(2,queue.length),0,s);completed++;revealed=false;draft='';persist();render();guestSaveHint();$('reveal')?.focus({preventScroll:true});}
async function play(a,restart=false){const b=$('play-audio');if(player&&!player.paused&&!restart){stopAudio();b.querySelector('span').textContent='Anhören';return;}stopAudio();const current=prepareAudio(a.download_url);if(!current)return;player=current;current.currentTime=0;current.playbackRate=speed;current.preservesPitch=true;b.querySelector('span').textContent=current.readyState>=3?'Startet …':'Lädt …';const reset=()=>{if(player===current&&$('play-audio')===b)b.querySelector('span').textContent='Anhören';};current.onended=reset;current.onerror=()=>{if(player!==current)return;audioCache.delete(a.download_url);reset();$('notice').textContent='Die Aufnahme ist gerade nicht erreichbar. Versuche den Link „Audiodatei“ oder prüfe deine Internetverbindung.';};try{await current.play();if(player===current)b.querySelector('span').textContent='Anhalten';}catch{if(player!==current)return;audioCache.delete(a.download_url);reset();$('notice').textContent='Die Aufnahme konnte nicht abgespielt werden. Du kannst sie über „Audiodatei“ öffnen.';}}
// Portable backups accept only known, bounded fields. Imported text is always escaped.
function objectRecord(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Ungültige Datenstruktur.');return value;}
function validInt(value,max=Number.MAX_SAFE_INTEGER){return Number.isSafeInteger(value)&&value>=0&&value<=max;}
function validateWritingRatings(input){
 objectRecord(input);const entries=Object.entries(input),out={};if(entries.length>100000)throw new Error('Zu viele Schreibtest-Bewertungen.');
 for(const [id,r] of entries){objectRecord(r);if(!/^[1-9]\d{0,15}$/.test(id)||!Number.isSafeInteger(Number(id))||!['right','almost','again'].includes(r.rating)||!validInt(r.updatedAt,8640000000000000))throw new Error('Ungültige Schreibtest-Bewertung.');out[id]={rating:r.rating,updatedAt:r.updatedAt};}return out;
}
function validateReports(input){
 objectRecord(input);const entries=Object.entries(input);if(entries.length>10000)throw new Error('Zu viele Hinweise.');const out={};
 for(const [id,r] of entries){objectRecord(r);if(!Number.isSafeInteger(r.sentenceId)||r.sentenceId<1||!Object.hasOwn(REPORT_CATEGORIES,r.category)||id!==`${r.sentenceId}:${r.category}`||typeof r.note!=='string'||r.note.length>2000||typeof r.sentenceText!=='string'||r.sentenceText.length>5000||typeof r.translationText!=='string'||r.translationText.length>10000||!validInt(r.createdAt,8640000000000000)||!validInt(r.updatedAt,8640000000000000)||r.updatedAt<r.createdAt)throw new Error('Ungültiger Fehlerhinweis.');out[id]={sentenceId:r.sentenceId,category:r.category,note:r.note,sentenceText:r.sentenceText,translationText:r.translationText,createdAt:r.createdAt,updatedAt:r.updatedAt};}
 return out;
}
function validateBackup(input){
 objectRecord(input);if(input.format!=='suomi-backup'||input.version!==1)throw new Error('Das ist keine unterstützte Suomi-Sicherung. Bitte wähle eine Datei aus „Sicherung herunterladen“.');
 const m=objectRecord(input.learning),out={reviews:{},favorites:[],daily:{},prefs:{},reports:{},writingRatings:{}};
 const reviews=Object.entries(objectRecord(m.reviews));if(reviews.length>100000)throw new Error('Die Sicherung enthält zu viele Bewertungen.');
 for(const [k,r] of reviews){objectRecord(r);if(!/^[1-9]\d{0,15}:(fi-de|de-fi|listen|dictation)$/.test(k)||!validInt(Number(k.split(':')[0]))||!validInt(r.due,8640000000000000)||!validInt(r.interval,180)||!validInt(r.repetitions,10000000)||(r.updatedAt!==undefined&&!validInt(r.updatedAt,8640000000000000)))throw new Error('Die Sicherung enthält eine ungültige Bewertung.');out.reviews[k]={due:r.due,interval:r.interval,repetitions:r.repetitions,...(r.updatedAt===undefined?{}:{updatedAt:r.updatedAt})};}
 if(!Array.isArray(m.favorites)||m.favorites.length>100000||m.favorites.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('Ungültige Favoriten.');out.favorites=[...new Set(m.favorites)];
 const daily=Object.entries(objectRecord(m.daily));if(daily.length>50000)throw new Error('Zu viele Tageswerte.');for(const [date,n] of daily){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!validInt(n,10000000))throw new Error('Ungültiger Tagesfortschritt.');out.daily[date]=n;}
 const p=objectRecord(m.prefs);if(!Number.isInteger(p.level)||p.level<1||p.level>1000||!['fi-de','de-fi','random'].includes(p.direction)||typeof p.audioOnly!=='boolean'||!['translate','listen','dictation','writing','grammar','verbs'].includes(p.activity)||![.5,.75,1].includes(p.speed))throw new Error('Ungültige Lerneinstellungen.');out.prefs={level:p.level,direction:p.direction,audioOnly:p.audioOnly,activity:p.activity,speed:p.speed,grammarTopic:GRAMMAR_TOPICS.some(t=>t.id===p.grammarTopic)?p.grammarTopic:'negation'};out.reports=validateReports(m.reports||{});out.writingRatings=validateWritingRatings(m.writingRatings||{});out.verbProgress=validateVerbProgress(m.verbProgress||{});return out;
}
function mergeLearning(current,incoming){
 const out={reviews:{...current.reviews},favorites:[...new Set([...current.favorites,...incoming.favorites])],daily:{...current.daily},prefs:{...incoming.prefs},reports:{...current.reports},writingRatings:{...current.writingRatings},verbProgress:mergeVerbProgress(current.verbProgress,incoming.verbProgress)};
 for(const [k,r] of Object.entries(incoming.reviews)){const old=out.reviews[k];const newer=old&&Number.isFinite(old.updatedAt)&&Number.isFinite(r.updatedAt)?r.updatedAt>old.updatedAt:!old||r.repetitions>old.repetitions||(r.repetitions===old.repetitions&&r.due>old.due);if(!old||newer)out.reviews[k]={...r};}
 for(const [date,n] of Object.entries(incoming.daily))out.daily[date]=Math.max(out.daily[date]||0,n);
 for(const [id,r] of Object.entries(incoming.writingRatings||{}))if(!out.writingRatings[id]||r.updatedAt>out.writingRatings[id].updatedAt)out.writingRatings[id]={...r};
 for(const [id,r] of Object.entries(incoming.reports))if(!out.reports[id]||r.updatedAt>out.reports[id].updatedAt)out.reports[id]={...r};
 return out;
}
function commitLearning(candidate){if(accountActive())localStorage.setItem(STORE,JSON.stringify(candidate));else localStorage.removeItem(STORE);memory=candidate;}
function learningSnapshot(){return JSON.parse(JSON.stringify({...memory,prefs:{level,direction,audioOnly,activity,speed,grammarTopic}}));}
window.suomiLearningState={snapshot:learningSnapshot,applyCloud:incoming=>{
 if(activity!=='verbs')return false;
 const candidate=mergeLearning(memory,{...incoming,prefs:learningSnapshot().prefs,verbProgress:validateVerbProgress(incoming.verbProgress||{})});
 commitLearning(candidate);if(ready)renderStats();return true;
}};
function downloadJSON(filename,value){const blob=new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
let reportSentence=null,pendingBackup=null,importSequence=0;
function openReport(s){stopAudio();reportSentence=s;$('report-card-label').textContent=`Satz #${s.id} · Level ${s.level}`;$('report-category').value=Object.values(memory.reports).find(r=>r.sentenceId===s.id)?.category||(['translate','grammar','writing'].includes(activity)?'translation':'audio');loadReportNote();$('report-dialog').showModal();}
function loadReportNote(){if(!reportSentence)return;const saved=memory.reports[`${reportSentence.id}:${$('report-category').value}`];$('report-note').value=saved?.note||'';$('report-status').textContent=saved?'Für diesen Satz und Bereich ist bereits ein Hinweis gespeichert. Du kannst ihn aktualisieren.':'';}
function renderReportList(){const reports=Object.entries(memory.reports).sort((a,b)=>b[1].updatedAt-a[1].updatedAt);$('export-reports').disabled=!reports.length;$('backup-summary').textContent=`${Object.keys(memory.reviews).length} geübte Satz-/Übungsart-Kombinationen · ${Object.keys(memory.verbProgress).length} geübte Verbformen · ${memory.favorites.length} Favoriten · ${reports.length} Hinweise`;
 $('report-list').innerHTML=reports.length?`${reports.length>50?'<p>Die 50 zuletzt bearbeiteten Hinweise. Der Export enthält alle Hinweise.</p>':''}`+reports.slice(0,50).map(([id,r])=>`<details class="saved-report"><summary>#${r.sentenceId} · ${escape(REPORT_CATEGORIES[r.category])}</summary><p lang="fi">${escape(r.sentenceText)}</p><p>${escape(r.translationText)}</p><p class="user-report-note">${escape(r.note||'Ohne ergänzende Notiz.')}</p><a href="https://tatoeba.org/en/sentences/show/${r.sentenceId}" target="_blank" rel="noopener">Satz auf Tatoeba ↗</a><button class="quiet" data-delete-report="${escape(id)}">Hinweis löschen</button></details>`).join(''):'<p>Noch keine Hinweise. Nutze „Fehler melden“ direkt auf einer Lernkarte.</p>';
 document.querySelectorAll('[data-delete-report]').forEach(b=>b.onclick=()=>{const reports={...memory.reports};delete reports[b.dataset.deleteReport];try{commitLearning({...memory,reports});renderReportList();if($('report-error'))$('report-error').textContent=queue[0]&&Object.values(memory.reports).some(r=>r.sentenceId===queue[0].id)?'Hinweis bearbeiten':'Fehler melden';$('backup-status').textContent='Hinweis gelöscht.';}catch{$('backup-status').textContent='Der Hinweis konnte nicht gelöscht werden. Dein Browser hat das Speichern abgelehnt.';}});
}
function clearImport(){importSequence++;pendingBackup=null;$('import-preview').hidden=true;$('import-backup').value='';}
function syncPersistenceControls(){const locked=!accountActive();$('export-backup').disabled=locked;$('import-backup').disabled=locked;$('export-reports').disabled=locked||!Object.keys(memory.reports).length;if(locked)$('backup-status').textContent='Ohne Konto wird nichts dauerhaft gespeichert. Registriere dich oder melde dich an, um Sicherungen und gespeicherten Lernstand zu verwenden.';}
$('manage').onclick=()=>{stopAudio();clearImport();$('backup-status').textContent='';renderReportList();syncPersistenceControls();$('manage-dialog').showModal();};
$('close-manage').onclick=()=>$('manage-dialog').close();$('manage-dialog').addEventListener('close',clearImport);
$('close-report').onclick=()=>$('report-dialog').close();$('report-category').onchange=loadReportNote;
$('report-form').onsubmit=e=>{e.preventDefault();if(!reportSentence)return;const category=$('report-category').value;if(!Object.hasOwn(REPORT_CATEGORIES,category))return;const note=$('report-note').value.trim();if(note.length>2000)return;const id=`${reportSentence.id}:${category}`,old=memory.reports[id],now=Math.max(Date.now(),(old?.updatedAt||0)+1);const r={sentenceId:reportSentence.id,category,note,sentenceText:reportSentence.text,translationText:reportSentence.translations.map(t=>t.text).join(' / '),createdAt:old?.createdAt||now,updatedAt:now};try{commitLearning({...memory,reports:{...memory.reports,[id]:r}});$('report-status').textContent=accountActive()?'Hinweis gespeichert. Er wird mit deinem Konto synchronisiert.':'Hinweis nur für diese Sitzung vorgemerkt. Ohne Konto wird er beim Neuladen gelöscht.';if($('report-error'))$('report-error').textContent='Hinweis bearbeiten';}catch{$('report-status').textContent='Dein Browser konnte den Hinweis nicht speichern. Bitte versuche es erneut; deine Eingabe bleibt hier stehen.';}};
$('export-backup').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um deinen Lernstand dauerhaft zu speichern oder zu exportieren.';return;}try{downloadJSON(`suomi-sicherung-${day()}.json`,{format:'suomi-backup',version:1,exportedAt:new Date().toISOString(),learning:{...memory,prefs:{level,direction,audioOnly,activity,speed,grammarTopic}}});$('backup-status').textContent='Download gestartet. Bewahre die Datei für einen Gerätewechsel auf.';}catch{$('backup-status').textContent='Der Download konnte nicht gestartet werden. Bitte versuche es erneut.';}};
$('export-reports').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um Hinweise dauerhaft zu speichern oder zu exportieren.';return;}try{downloadJSON(`suomi-hinweise-${day()}.json`,{format:'suomi-reports',version:1,exportedAt:new Date().toISOString(),reports:Object.values(memory.reports)});$('backup-status').textContent='Download gestartet. Hänge die Hinweise-Datei hier im Chat an, um die Korrekturen anzustoßen.';}catch{$('backup-status').textContent='Der Download konnte nicht gestartet werden.';}};
$('import-backup').onchange=async e=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um eine Sicherung zu importieren.';e.target.value='';return;}const sequence=++importSequence;pendingBackup=null;$('import-preview').hidden=true;$('backup-status').textContent='';const file=e.target.files?.[0];if(!file)return;try{if(file.size>20*1024*1024)throw new Error('Die Datei ist zu groß. Bitte verwende eine Suomi-Sicherung bis 20 MB.');const text=await file.text();if(sequence!==importSequence)return;const parsed=JSON.parse(text,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw new Error('Ungültige Datenfelder.');return value;});pendingBackup=validateBackup(parsed);$('import-summary').textContent=`Bereit zum Import: ${Object.keys(pendingBackup.reviews).length} Bewertungen, ${pendingBackup.favorites.length} Favoriten und ${Object.keys(pendingBackup.reports).length} Hinweise. Einstellungen aus der Sicherung werden übernommen; eine neue Lerneinheit beginnt.`;$('import-preview').hidden=false;}catch(err){if(sequence!==importSequence)return;pendingBackup=null;$('backup-status').textContent=err instanceof SyntaxError?'Die Datei enthält keine lesbare Sicherung. Dein Lernstand bleibt erhalten.':`${err.message} Dein Lernstand bleibt erhalten.`;}};
$('cancel-import').onclick=()=>{clearImport();$('backup-status').textContent='Import abgebrochen.';};
$('apply-backup').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um eine Sicherung zu übernehmen.';return;}if(!pendingBackup||!ready)return;const candidate=mergeLearning(memory,pendingBackup);if(!levels.includes(candidate.prefs.level))candidate.prefs.level=levels[0]||1;try{commitLearning(candidate);}catch{$('backup-status').textContent='Dein Browser konnte die Sicherung nicht speichern. Der bisherige Lernstand bleibt erhalten.';return;}({level,direction,audioOnly,activity,speed,grammarTopic}=candidate.prefs);clearImport();mode='new';verbSession=null;start();renderReportList();$('backup-status').textContent='Lernstand zusammengeführt. Deine Einstellungen sind übernommen und eine neue Lerneinheit ist bereit.';};

function showView(name,openSettings=false){
 for(const view of ['home','practice','progress','classrooms']){const node=$(`${view}-view`);if(node)node.hidden=view!==name;}
 document.querySelectorAll('.bottom-nav [data-view]').forEach(b=>{const selected=b.dataset.view===name;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 if(name!=='practice')stopAudio();
 if(name==='practice')$('practice-settings').open=openSettings;
 window.scrollTo({top:0,behavior:'smooth'});
}
$('continue-practice').onclick=()=>{
 if(!ready)return;
 if(activity==='verbs'&&verbSession&&!verbSession.current)verbSession=null;
 if(mode!=='new'){mode='new';start();}else if(activity==='verbs')render();
 showView('practice');
};
$('home-review').onclick=()=>{
 if(!ready||$('home-review').disabled)return;
 if(activity==='verbs'){
  if(verbSession?.current){showView('practice');$('notice').textContent='Beende zuerst deine laufende Runde. Deine Eingabe bleibt erhalten.';return;}
  const now=Date.now();
  const reviewKeys=VERBS.flatMap(v=>PRONOUNS.map((_,p)=>v.id+':'+p)).filter(k=>memory.verbProgress[k]?.seen&&memory.verbProgress[k].due<=now);
  if(!reviewKeys.length){renderStats();return;}
  verbSession={...createVerbSession(10),count:Math.min(10,reviewKeys.length),reviewKeys};
  mode='review';nextVerbQuestion();showView('practice');return;
 }
 mode='review';start();showView('practice');
};
$('home-choose').onclick=()=>{showView('practice',true);$('practice-settings').querySelector('summary')?.focus();};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
document.querySelectorAll('[data-home-activity]').forEach(b=>b.onclick=()=>{if(!ready||activity===b.dataset.homeActivity)return;activity=b.dataset.homeActivity;mode='new';start();});
document.querySelectorAll('[data-home-direction]').forEach(b=>b.onclick=()=>{if(!ready||direction===b.dataset.homeDirection)return;direction=b.dataset.homeDirection;mode='new';start();});
document.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>{if(b.dataset.activity==='writing'&&!syncWritingAvailability())return;if(activity!==b.dataset.activity){activity=b.dataset.activity;mode='new';start();}});
document.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{if(direction!==b.dataset.direction){direction=b.dataset.direction;start();}});
$('grammar-topic').onchange=e=>{grammarTopic=e.target.value;start();};
$('audio-only').checked=audioOnly;
$('levels').onclick=e=>{const b=e.target.closest('[data-level]');if(b){if(activity==='verbs')activity='translate';level=Number(b.dataset.level);start();showView('practice');}};
$('audio-only').onchange=e=>{audioOnly=e.target.checked;start();};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;start();});
$('about').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();$('about-dialog').onclick=e=>{if(e.target===$('about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
document.addEventListener('keydown',e=>{if(document.querySelector('dialog[open]')||(!$('classrooms-view')?.hidden)||!ready||['writing','verbs'].includes(activity)||$('about-dialog').open||$('report-dialog').open||$('manage-dialog').open||e.ctrlKey||e.metaKey||e.altKey||e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;if(e.code==='Space'&&e.target.tagName!=='BUTTON'&&!revealed&&queue.length&&isTranslation()){e.preventDefault();$('reveal').click();}else if(revealed&&['1','2','3'].includes(e.key)){e.preventDefault();grade({1:'again',2:'hard',3:'easy'}[e.key]);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();else if(ready)renderStats();});
try{const response=await fetch('sentences.json');if(!response.ok)throw new Error('load');const payload=await response.json();data=payload.sentences;if(Array.isArray(payload.levels))levels=payload.levels.map(l=>l.id).filter(Number.isInteger);if(!levels.includes(level))level=levels[0]||1;archived=Array.isArray(payload.archived_sentences)?payload.archived_sentences:[];if(!Array.isArray(data)||!data.length)throw new Error('empty');try{const g=await fetch('grammar.json');if(g.ok){const payload=await g.json();grammar=payload.sentences||{};grammarAvailable=true;}}catch{}ready=true;start();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch{$('card').className='card empty';$('card').innerHTML='<h2>Die Sätze konnten nicht geladen werden.</h2><p>Prüfe deine Verbindung und lade die Seite erneut.</p>';$('actions').innerHTML='<button class="primary" id="retry">Erneut versuchen</button>';$('retry').onclick=()=>location.reload();$('total').textContent='Sätze nicht verfügbar';}
