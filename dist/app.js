import {tc} from './i18n.mjs?v=23';
import {canSearch,createSearch} from './wordsearch.mjs';
import {mountSearch,searchInstructions} from './wordsearch-ui.mjs?v=64';
import {createWordExercise,wordAnswerMatches,finnishSentenceMatches,sentenceWords} from './word-practice.mjs?v=61';
import {VERBS} from './verbs-data.mjs';
import {PRONOUNS,validateVerbProgress,mergeVerbProgress,markAsked,markAnswered,answerMatches,createVerbSession,chooseCombination,verbSummary,unlockedVerbCount} from './verb-practice.mjs';
import {verbUsage} from './verb-examples.mjs?v=1';
import {GRAMMAR_TOPICS,topicNotes} from './grammar-topics.mjs';
import {reviewPlan,dueSentences,unseenSentences,lastPracticed} from './review-plan.mjs';
import {everydayPathState} from './learning-path.mjs';
import {addPerformanceEvent,buildLearningInsights,mergePerformanceEvents,validatePerformanceEvents} from './learning-insights.mjs';
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-config.js';
import {validateGames,mergeGames} from './games-progress.mjs';
import {mountWordLookup,loadLexicon,lookupForSentence,splitSentence,getLexicon} from './word-lookup.mjs?v=2';
import {planVerbs,planEndings,interleave,alternate,verbCard,endingCard} from './daily-mix.mjs?v=3';
import {validateEndingsProgress,mergeEndingsProgress,markEndingAnswered,missedEndings} from './endings-progress.mjs?v=1';
import {createGuestCard,shortGloss,flipWordIndex} from './guest-card.mjs?v=12';
import {renderGreeting,renderToday,createDailySentence,animateProgress,GOAL_CHOICES,DAILY_GOAL} from './home-extras.mjs?v=11';
import {buildDifficultDeck} from './difficult-words.mjs?v=2';
import {buildEndingItems,indexLexicon,renderEndings,hasEndingChoices} from './endings-practice.mjs?v=2';
import {translationFeedbackMarkup} from './translation-feedback.mjs?v=1';
import {loadDialogs,renderDialogs,dialogForTopic,createDialogSession} from './dialogs.mjs?v=2';
import {LEVEL_PATHS} from './learning-path-data.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeURL=s=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?escape(u.href):'#';}catch{return '#';}};
const STORE='suomi-learning-v1';
const SESSION='suomi-auth-session-v1';
const hasStoredSession=()=>{try{const s=JSON.parse(localStorage.getItem(SESSION));return !!(s?.access_token&&s?.refresh_token&&s?.user?.id);}catch{return false;}};
const accountActive=()=>document.body.dataset.account==='authenticated'||hasStoredSession();
// Ohne Konto ist nur das erste Level offen; weitere Level gibt es nach der Registrierung.
const levelLocked=n=>!accountActive()&&n!==(levels[0]||1);
// Ohne Konto gibt es nur die Übersetzungsübung, die anderen Übungsarten sind ausgegraut.
const activityLocked=a=>!accountActive()&&a!=='translate';
function syncActivityLocks(){document.querySelectorAll?.('[data-home-activity],[data-activity]').forEach(b=>{const locked=activityLocked(b.dataset.homeActivity||b.dataset.activity);b.classList.toggle('is-locked',locked);if(locked){b.setAttribute('aria-disabled','true');b.title='Mit Konto verfügbar';}else{b.removeAttribute('aria-disabled');b.removeAttribute('title');}});}
function openRegister(){if(window.suomiOpenAccount)window.suomiOpenAccount('register');else{$('account-button')?.click();setTimeout(()=>document.querySelector('[data-account-tab="register"]')?.click(),0);}}
let guestExerciseAccepted=false,pendingGuestStart=null;
try{guestExerciseAccepted=sessionStorage.getItem('suomi-guest-exercise-accepted')==='1';}catch{}
if(!hasStoredSession())try{localStorage.removeItem(STORE);}catch{}
const REPORT_CATEGORIES={translation:'Übersetzung falsch',unnatural:'Unnatürlich formuliert',outdated:'Veraltet oder ungebräuchlich',inappropriate:'Ungeeignet oder anstößig',duplicate:'Doppelter Satz',grammar:'Grammatikhilfe',audio:'Aufnahme',level:'Falsches Level',other:'Sonstiges'};
let memory={reviews:{},favorites:[],daily:{},prefs:{},reports:{},writingRatings:{},verbProgress:{},endingsProgress:{},performanceEvents:[],games:{}};
try{const saved=hasStoredSession()?JSON.parse(localStorage.getItem(STORE)):null;if(saved&&typeof saved==='object'){for(const k of ['reviews','daily','prefs'])if(saved[k]&&typeof saved[k]==='object'&&!Array.isArray(saved[k]))memory[k]=saved[k];if(Array.isArray(saved.favorites))memory.favorites=saved.favorites.filter(Number.isInteger);if(saved.verbProgress)try{memory.verbProgress=validateVerbProgress(saved.verbProgress);}catch{}if(saved.endingsProgress)try{memory.endingsProgress=validateEndingsProgress(saved.endingsProgress);}catch{}if(saved.performanceEvents)try{memory.performanceEvents=validatePerformanceEvents(saved.performanceEvents);}catch{}if(saved.writingRatings)try{memory.writingRatings=validateWritingRatings(saved.writingRatings);}catch{}if(saved.reports)try{memory.reports=validateReports(saved.reports);}catch{}if(saved.games)memory.games=validateGames(saved.games);}}catch{}
let grammar={},grammarAvailable=false,grammarLoading=true,loadedSentenceIds=new Set();
const qualityExclusions={sentences:new Set(),translations:new Set()};
const qualityTranslationKey=(sentenceId,translationId)=>`${sentenceId}:${translationId}`;
const qualitySourceKind=item=>['english_bridge','finnish_adaptation'].includes(item?.origin)?'app_generated':item?.origin==='tatoeba_via_english'?'indirect_tatoeba':item?.origin==='teacher_created'?'editorial':item?.id?'direct_tatoeba':'unknown';
// Gesperrte Sätze (Qualitätsprüfung) kommen von Supabase. Damit ein langsamer oder gerade
// aufwachender Server die Startseite nicht aufhält, gilt zuerst die zuletzt gespeicherte Liste;
// die frische Antwort wird höchstens kurz abgewartet und sonst still nachgezogen (siehe unten).
const QUALITY_CACHE='vanamo-quality-exclusions';
function applyQualityExclusions(value){
 const sentences=new Set(),translations=new Set();
 for(const id of value?.sentence_ids||[])if(Number.isSafeInteger(Number(id)))sentences.add(Number(id));
 for(const pair of value?.translations||[])if(Number.isSafeInteger(Number(pair?.sentence_id))&&Number.isSafeInteger(Number(pair?.translation_id)))translations.add(qualityTranslationKey(Number(pair.sentence_id),Number(pair.translation_id)));
 const changed=sentences.size!==qualityExclusions.sentences.size||translations.size!==qualityExclusions.translations.size||[...sentences].some(id=>!qualityExclusions.sentences.has(id))||[...translations].some(k=>!qualityExclusions.translations.has(k));
 qualityExclusions.sentences=sentences;qualityExclusions.translations=translations;
 return changed;
}
let qualityCached=false;
try{const cached=JSON.parse(localStorage.getItem(QUALITY_CACHE)||'null');if(cached){applyQualityExclusions(cached);qualityCached=true;}}catch{}
async function loadQualityExclusions(){
 try{
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/sentence_quality_exclusions`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:'{}'});
  if(!response.ok)return false;
  const value=await response.json();
  try{localStorage.setItem(QUALITY_CACHE,JSON.stringify({sentence_ids:value?.sentence_ids||[],translations:value?.translations||[]}));}catch{}
  return applyQualityExclusions(value);
 }catch{return false;}
}
function qualityFilteredCards(cards){
 const reports=Object.values(memory.reports);
 return cards.filter(s=>!qualityExclusions.sentences.has(Number(s.id))&&!reports.some(r=>Number(r.sentenceId)===Number(s.id)&&r.category!=='translation')).map(s=>{
  const localTranslationReport=reports.some(r=>Number(r.sentenceId)===Number(s.id)&&r.category==='translation');
  return {...s,translations:s.translations.filter((t,index)=>!(localTranslationReport&&index===0)&&!qualityExclusions.translations.has(qualityTranslationKey(Number(s.id),Number(t.id))))};
 }).filter(s=>s.translations.length);
}
let levels=[1,2,3,4,5,6];
let data=[],archived=[],level=levels.includes(memory.prefs.level)?memory.prefs.level:1,direction=['de-fi','random'].includes(memory.prefs.direction)?memory.prefs.direction:'fi-de',audioOnly=memory.prefs.audioOnly===true,mode='new',queue=[],initialCount=0,completed=0,revealed=false,player=null,playedAudioCard=null,ready=false,dailySession=null;
let activity=['listen','dictation','writing','grammar','verbs','suchsel','endings','dialogs'].includes(memory.prefs.activity)?memory.prefs.activity:'translate',speed=[0.5,0.75,1].includes(memory.prefs.speed)?memory.prefs.speed:1,draft='';
const dialogState={dialogs:null,session:null,loading:false,failed:false,level:null};
const endingsState={level:null,items:null,index:null,session:null,missed:new Set(),loading:false};
let grammarTopic=GRAMMAR_TOPICS.some(t=>t.id===memory.prefs.grammarTopic)?memory.prefs.grammarTopic:'negation';
let searchDifficulty=memory.prefs.searchDifficulty==='hard'?'hard':'easy',searchPuzzle=null;
let difficulty=memory.prefs.difficulty==='easy'?'easy':'hard',wordExercise=null;
let dailyGoal=GOAL_CHOICES.includes(memory.prefs.dailyGoal)?memory.prefs.dailyGoal:DAILY_GOAL;
const isWordPractice=()=>activity==='translate'&&difficulty==='easy';
const isTranslation=()=>['translate','grammar'].includes(activity);
const matchesTopic=s=>topicNotes(s,grammar,grammarTopic).length>0;
const writingSessions={};
const WRITING_RATINGS={right:'Richtig',almost:'Fast richtig',again:'Noch üben'};
const MIN_WRITING_SENTENCES=5;
const ACTIVITY_LABELS={translate:'Übersetzen',listen:'Hörübung',dictation:'Diktat',writing:'Schreibtest',grammar:'Grammatik',verbs:'Verbformen',suchsel:'Wortsel',endings:'Endungen',dialogs:'Dialoge'};
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
const base=(includeArchived=false)=>(includeArchived?[...data,...archived]:data).filter(s=>s.level===level&&(activity==='suchsel'?canSearch(s):(!(audioOnly||!isTranslation())||s.audios.length))&&(activity!=='grammar'||matchesTopic(s)));
const filtered=()=>activity==='grammar'?base():base(mode!=='new').filter(s=>eligibleDirections(s).length);
function persist(){const saved=dailySession?.previous||{};memory.prefs={level,direction:saved.direction||direction,audioOnly,activity:saved.activity||activity,speed,grammarTopic,difficulty:saved.difficulty||difficulty,searchDifficulty,dailyGoal};try{if(accountActive()){localStorage.setItem(STORE,JSON.stringify(memory));window.dispatchEvent(new Event('suomi-learning-changed'));}else localStorage.removeItem(STORE);}catch{if(accountActive())$('notice').textContent='Dein Lernstand konnte gerade nicht lokal zwischengespeichert werden.';}}
let guestSaveNoticeShown=false;
function guestSaveHint(){if(accountActive()||guestExerciseAccepted||guestSaveNoticeShown)return;guestSaveNoticeShown=true;const n=$('notice');if(n)n.textContent='Du übst ohne Konto. Dein Fortschritt wird nicht gespeichert. Registriere dich kostenlos, um ihn zu behalten.';}
const restingAudioLabel=b=>b?.dataset.played==='true'?'Wiederholen':'Anhören';
function setAudioButtonLabel(b,label){if(!b)return;b.querySelector('span').textContent=tc('Audio',label);b.dataset.state=label==='Anhalten'?'playing':/…$/.test(label)?'loading':'idle';b.setAttribute('aria-label',label==='Wiederholen'?'Aufnahme wiederholen':label==='Anhalten'?'Wiedergabe anhalten':'Finnischen Satz anhören');}
function bindSpeedOptions(){$('speed')?.querySelectorAll('button').forEach(b=>b.onclick=()=>{speed=Number(b.dataset.speed);if(player)player.playbackRate=speed;$('speed').querySelectorAll('button').forEach(o=>o.setAttribute('aria-pressed',String(o===b)));persist();});}
function stopAudio(){if(player){player.pause();player=null;}const b=$('play-audio');if(b)setAudioButtonLabel(b,restingAudioLabel(b));}
const AUDIO_CACHE_LIMIT=8,audioCache=new Map();
// Aufnahme-Adresse aus der Tatoeba-ID (sentences.json enthält sie nicht mehr einzeln).
const audioURL=a=>a?.download_url||(a?.id?`https://api.tatoeba.org/v1/audios/${encodeURIComponent(a.id)}/file`:'');
function prepareAudio(url){
 if(typeof Audio==='undefined'||!url)return null;
 if(audioCache.has(url)){const cached=audioCache.get(url);audioCache.delete(url);audioCache.set(url,cached);return cached;}
 const audio=new Audio();audio.preload='auto';audio.src=url;audio.load();audioCache.set(url,audio);
 while(audioCache.size>AUDIO_CACHE_LIMIT){const [oldURL,oldAudio]=audioCache.entries().next().value;oldAudio.pause();oldAudio.removeAttribute('src');oldAudio.load();audioCache.delete(oldURL);}
 return audio;
}
// Audio comes from api.tatoeba.org; load it only while the practice view is open (privacy, data use).
function preloadQueueAudio(){if($('practice-view')?.hidden)return;const urls=queue.slice(0,3).map(s=>audioURL(s.audios?.[0])).filter(Boolean);for(const url of new Set(urls))prepareAudio(url);}
function shuffle(a){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
// „Wiederholen“: fällige Sätze, dazu fällige und ein paar neue Verbformen und Endungen (siehe daily-mix.mjs).
const learnedSentenceIds=()=>new Set(Object.keys(memory.reviews||{}).map(k=>Number(k.split(':')[0])));
// Alle Lücken für „Wiederholen“ (alle Level), einmal gebaut, sobald die Wortanalyse geladen ist.
function buildDailyEndings(lexicon=getLexicon()){
 if(dailyEndings||!lexicon||!ready)return;
 const all=[...data,...archived];
 dailyEndings={items:buildEndingItems(lexicon,all,null),index:indexLexicon(lexicon,all)};
 dailyEndings.byId=new Map(dailyEndings.items.map(i=>[i.id,i]));
}
let dailyEndings=null,dailyEndingsLoading=false,dailyEndingsFailed=false;
function allEndingItems(){
 if(dailyEndings)return dailyEndings.items;
 if(!ready||!data.length)return null;
 const lexicon=getLexicon();
 if(!lexicon){
  if(!dailyEndingsLoading&&ready&&!activityLocked('endings')){dailyEndingsLoading=true;loadLexicon().then(()=>{dailyEndingsLoading=false;if(ready)renderDailyPlan();}).catch(()=>{dailyEndingsFailed=true;}).finally(()=>{dailyEndingsLoading=false;});}
  return null;
 }
 // Aufbau kostet spürbar Rechenzeit (auf dem Handy mehrere hundert ms): nicht mitten im Start,
 // sondern wenn der Browser Luft hat; danach „Wiederholen“ neu berechnen.
 if(!dailyEndingsLoading){
  dailyEndingsLoading=true;
  const build=()=>{dailyEndingsLoading=false;if(dailyEndings)return;buildDailyEndings(lexicon);if(ready)renderDailyPlan();};
  // Im Intro wartet der Vogel genau darauf (vanamoHomeBusy): sofort rechnen, solange nur die Begrüßung dasteht.
  // Fliegt der Schwarm schon (langsame Verbindung), erst nach dem Intro – sonst ruckelt er.
  if(document.documentElement.classList.contains('intro-flying'))afterIntro().then(build);
  else if(introActive())setTimeout(build,0);
  else if(typeof requestIdleCallback==='function')requestIdleCallback(build,{timeout:2000});else setTimeout(build,300);
 }
 return null;
}
function extrasPlan(){
 const none={due:[],fresh:[],dueTotal:0};
 const sentencesDue=dueSentences([...data,...archived],memory.reviews,null).length,learnedIds=learnedSentenceIds();
 const endings=activityLocked('endings')?none:planEndings({items:allEndingItems(),progress:memory.endingsProgress,learnedIds,level,sentencesDue,choosable:item=>hasEndingChoices(item,dailyEndings.index),otherDue:0});
 const verbs=activityLocked('verbs')?none:planVerbs({verbs:VERBS,progress:memory.verbProgress,lexicon:getLexicon(),learnedIds:[...learnedIds],sentencesDue,otherDue:endings.dueTotal});
 // Neue Endungen nur, wenn auch mit den fälligen Verbformen noch Platz ist.
 const endingsFinal=verbs.dueTotal&&!activityLocked('endings')?planEndings({items:allEndingItems(),progress:memory.endingsProgress,learnedIds,level,sentencesDue,choosable:item=>hasEndingChoices(item,dailyEndings.index),otherDue:verbs.dueTotal}):endings;
 return {verbs,endings:endingsFinal,sentencesDue};
}
function dailyPlan(){
 // Beim Start der Runde nicht auf den Aufbau im Hintergrund warten.
 if(!activityLocked('endings'))buildDailyEndings();
 const sentences=reviewPlan([...data,...archived],memory.reviews,null,{translationOffset:reviewTranslationCount});
 const {verbs,endings}=extrasPlan();
 const others=[...alternate(verbs.due.map(verbCard),endings.due.map(endingCard)),...alternate(verbs.fresh.map(verbCard),endings.fresh.map(endingCard))];
 return interleave(sentences,others);
}
let reviewTranslationCount=0,guidedNew=false,pathSession=null;
const pathState=()=>{const cards=[...data,...archived],available=new Set(cards.filter(s=>s.translations?.length).map(s=>s.id));return everydayPathState(cards,memory.reviews,level,new Set([...loadedSentenceIds].filter(id=>!available.has(id))));};
function renderLearningPath(){
 const state=pathState(),active=guidedNew&&pathSession?.level===level&&queue.length;
 const topic=active?pathSession.topic:state.topic,lesson=active?pathSession.lesson:state.lesson;
 $('path-level').innerHTML=levels.map(n=>`<option value="${n}" ${n===level?'selected':''} ${levelLocked(n)?'disabled':''}>${levelLocked(n)?`Level ${n} · mit Konto`:`Level ${n}`}</option>`).join('');
 $('path-level-hint').hidden=accountActive();
 $('path-next-level').textContent=accountActive()?'Zum nächsten Level':'Mit Konto weiter zum nächsten Level';
 $('path-level').disabled=!ready;
 // Angemeldete wählen das Level direkt im Lernpfad-Etikett; Gäste behalten die eigene Zeile mit Registrierungs-Hinweis.
 const account=accountActive(),levelHome=account?$('path-tag'):$('path-level-control');
 if(levelHome?.append&&$('path-level').parentElement!==levelHome)levelHome.append($('path-level'));
 $('path-level-control').hidden=account;
 $('path-tag-text').textContent=account?'Dein Lernpfad ·':`Dein Lernpfad · Level ${level}`;
 $('start-new-sentences').disabled=!ready||(!active&&!state.lesson?.remaining.length);
 $('start-new-sentences').textContent=active?'Etappe fortsetzen':state.complete?'Levelpfad geschafft':state.seen?'Weiterlernen':'Lernpfad starten';
 $('path-current-title').textContent=topic?.title||`Lernpfad für Level ${level} geschafft!`;
 $('new-sentences-note').hidden=!!lesson;
 $('new-sentences-note').textContent=lesson?'':'Alle verfügbaren Themen dieses Levels kennengelernt. Wiederhole deine Sätze oder wechsle zum nächsten Level.';
 $('path-goal').textContent=(topic?.goal||'Dein bisheriger Fortschritt bleibt beim Levelwechsel erhalten.')+(lesson?` (${lesson.index+1}/${topic.lessons.length})`:'');
 $('path-progress-text').textContent=`Level ${level} · ${state.seen} von ${state.total} Sätzen kennengelernt`;
 $('path-progress').max=Math.max(1,state.total);if(typeof animateProgress==='function')animateProgress($('path-progress'),state.seen);else $('path-progress').value=state.seen;
 $('path-next-level').hidden=!state.complete||!levels.some(n=>n>level);
 $('path-overview').innerHTML=state.topics.map((topic,index)=>{
  const current=active?topic.id===pathSession.topic.id:topic.id===state.topic?.id;
  return `<li class="path-stop ${current?'current':topic.complete?'complete':'upcoming'}" ${current?'aria-current="step"':''}><span class="path-number" aria-hidden="true">${topic.complete&&!current?'✓':index}</span><div><h4>${escape(topic.title)}</h4><p>${!topic.available?'Noch keine passenden Sätze in diesem Level':`${current?'Du bist hier':topic.complete?'Kennengelernt':'Danach'} · ${topic.seen}/${topic.total}`}</p></div></li>`;
 }).join('');
}
function dailyPlanStats(){
 const {verbs,endings,sentencesDue}=extrasPlan();
 return {dueCount:sentencesDue,verbDue:verbs.dueTotal,verbNew:verbs.fresh.length,endingDue:endings.dueTotal,endingNew:endings.fresh.length,
  roundSentences:Math.min(10,sentencesDue),roundVerbs:verbs.due.length+verbs.fresh.length,roundEndings:endings.due.length+endings.fresh.length,
  roundSize:Math.min(10,sentencesDue)+verbs.due.length+verbs.fresh.length+endings.due.length+endings.fresh.length,newCount:unseenSentences(data,memory.reviews,level).length};
}
function dailyNote(stats){
 const due=stats.dueCount||stats.verbDue||stats.endingDue;
 const fresh=stats.verbNew&&stats.endingNew?'Verbformen und Endungen':stats.verbNew?'Verbformen':stats.endingNew?'Endungen':'';
 if(due&&fresh)return `Fällige Wiederholungen – dazu ein paar neue ${fresh}.`;
 if(due)return stats.verbDue||stats.endingDue?'Sätze, Verbformen und Endungen – bunt gemischt.':'Bekannte, fällige Sätze – abwechslungsreich üben, ohne neue Sätze.';
 return fresh?`Heute ein paar neue ${fresh}.`:'Für heute ist alles wiederholt.';
}
// Bis die Sätze geladen sind, zeigt die Startseite nur leere Kästen statt Platzhaltertexten.
let homeDone=false;
function homeLoaded(){homeDone=true;const home=$('home-view');home.classList.remove('is-loading');home.removeAttribute('aria-busy');}
function renderDailyPlan(){
 const button=$('start-daily-session');if(!button)return;
 const stats=dailyPlanStats(),available=stats.roundSize,onlySentences=available===Math.min(10,stats.dueCount);
 // Unter der großen Zeile steht, was in dieser Runde steckt (höchstens 10 Sätze) – nicht der ganze Rückstand.
 if($('daily-due').textContent!==String(stats.roundSentences)){$('daily-due').textContent=stats.roundSentences;const chip=$('daily-due').parentElement;if(chip?.classList?.add){chip.classList.remove('bump');void chip.offsetWidth;chip.classList.add('bump');}}
 {const chip=$('daily-due').parentElement;if(chip)chip.hidden=ready&&(!stats.roundSentences||onlySentences);if($('daily-due-label'))$('daily-due-label').textContent=stats.roundSentences===1?'Satz':'Sätze';}
 document.querySelector('.home-daily').classList.toggle('all-done',ready&&accountActive()&&!available&&!(dailySession?.active&&queue.length));
 for(const [id,n] of [['daily-verbs',stats.roundVerbs],['daily-endings',stats.roundEndings]]){const chip=$(id);if(chip){chip.textContent=n;if(chip.parentElement)chip.parentElement.hidden=!n;}}
 renderLearningPath();
 $('daily-plan-note').textContent=dailyNote(stats);
 button.disabled=!ready||(!available&&!(dailySession?.active&&queue.length));
 // Ohne Konto steht dort die Satzkarte; „Wiederholen“ gibt es für Gäste nicht – sie machen mit neuen Sätzen weiter.
 // Satzkarte und „Sätze wiederholen“ immer aus demselben Kontostand ableiten, damit nie beides falsch zusammen steht.
 const card=typeof guestCard==='undefined'?null:guestCard,guest=!accountActive()&&!!card?.available;
 if(card){$('guest-card').hidden=!guest;if(guest)card.start();else card.stop();}
 document.querySelector('.home-daily').hidden=guest;
 const running=dailySession?.active&&queue.length;
 button.textContent=running?'Wiederholung fortsetzen':!available?'Alles wiederholt':'Jetzt starten →';
 // Die große Zeile nennt die Größe dieser einen Runde (höchstens 20), nie alles Fällige.
 $('daily-plan-title').textContent=running?'Deine Runde läuft noch':!available?'Wiederholen':onlySentences?(available===1?'1 Satz zum Wiederholen':`${available} Sätze zum Wiederholen`):(available===1?'1 Aufgabe zum Wiederholen':`${available} Aufgaben zum Wiederholen`);
 $('header-practice').disabled=button.disabled;
 const favs=ready?favoriteSentences().length:0;if($('home-favorites')){$('home-favorites').hidden=!favs;$('fav-home-count').textContent=favs;}
 syncHeaderPractice();
}
// Ohne Konto gibt es nichts zu wiederholen – „Üben“ im Header nur für angemeldete Nutzer zeigen.
function syncHeaderPractice(){const b=$('header-practice');if(b)b.hidden=!accountActive();}
function applyDailyCard(){
 if(!dailySession?.active||!queue.length)return;
 if(queue[0].dailyActivity==='verbs'&&!startDailyVerb(queue[0])){queue.shift();return applyDailyCard();}
 if(queue[0].dailyActivity==='endings'&&!startDailyEnding(queue[0])){queue.shift();return applyDailyCard();}
 const card=queue[0];activity=card.dailyActivity;direction=card.dailyActivity==='translate'?'random':direction;difficulty=card.dailyDifficulty||'hard';mode='review';
}
// Favoriten aus allen Levels als Übersetzungsrunde (Knopf „Favoriten üben“ auf der Startseite).
var favoritesRound=null;
const favoriteSentences=()=>{const ids=new Set(memory.favorites);return [...data,...archived].filter(s=>ids.has(s.id)&&s.translations?.length);};
function startFavorites(){
 if(!ready)return;const pool=favoriteSentences();if(!pool.length){renderDailyPlan();return;}
 if(!favoritesRound)favoritesRound={activity,mode};
 activity='translate';mode='favorites';guidedNew=false;dailySession=null;wordExercise=null;searchPuzzle=null;stopAudio();playedAudioCard=null;draft='';syncControls();
 queue=shuffle(pool).slice(0,10).map(s=>{const c=studyDirections();return {...s,practiceDirection:c[Math.floor(Math.random()*c.length)]};});
 initialCount=queue.length;completed=0;revealed=false;persist();showView('practice');render();
}
// Eine Verbform aus „Wiederholen“: eigene Mini-Runde mit genau dieser Aufgabe.
function startDailyVerb(card){
 if(verbSession?.dailyCard===card)return true;
 const verb=VERBS.find(v=>v.id===card.dailyVerb.verbId);if(!verb)return false;
 const {person,key}=card.dailyVerb;
 if(!card.retry&&!saveVerbProgress(markAsked(memory.verbProgress,key)))return false;
 verbSession={...createVerbSession(5),count:1,daily:true,dailyCard:card,current:{verb,person,key},history:[key]};
 return true;
}
// Eine Lücke aus „Wiederholen“: eigener kleiner Zustand, die Darstellung kommt aus endings-practice.mjs.
let endingsDaily=null;
function startDailyEnding(card){
 if(endingsDaily?.card===card)return true;
 allEndingItems();const item=dailyEndings?.byId.get(card.dailyEnding.key);if(!item)return false;
 endingsDaily={card,items:[item],index:dailyEndings.index,session:{items:[item],position:0,answers:[],checked:false,draft:'',showCase:false,count:1,choices:null}};
 return true;
}
function saveEndingAnswer(item,correct){
 try{commitLearning({...memory,endingsProgress:markEndingAnswered(memory.endingsProgress,item.id,correct),daily:{...memory.daily,[day()]:(Number(memory.daily[day()])||0)+1}});return true;}
 catch{$('notice').textContent='Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.';return false;}
}
function nextDailyCard(){
 const card=queue.shift();completed++;
 const correct=card?.dailyActivity==='endings'?endingsDaily?.session.answers[0]?.correct:verbSession?.correct;
 // Falsches kommt nach zwei anderen Aufgaben einmal wieder (wie „Nochmal“ bei Sätzen).
 if(card&&!correct&&!card.retry)queue.splice(Math.min(2,queue.length),0,{...card,retry:true});
 verbSession=null;endingsDaily=null;revealed=false;draft='';persist();render();
 ($('reveal')||$('verb-input')||$('endings-input')||document.querySelector('[data-ending-choice]')||$('finish-daily-session'))?.focus({preventScroll:true});
}
function startDailySession(){
 if(!ready)return;
 if(dailySession?.active&&queue.length){applyDailyCard();showView('practice');render();return;}
 const plan=dailyPlan();if(!plan.length){renderDailyPlan();return;}
 guidedNew=false;
 dailySession={active:true,previous:{activity,direction,difficulty,mode},mix:{total:plan.length,verbs:plan.filter(x=>x.dailyActivity==='verbs').length,verbsNew:plan.filter(x=>x.dailyVerb?.isNew).length,endings:plan.filter(x=>x.dailyActivity==='endings').length,endingsNew:plan.filter(x=>x.dailyEnding?.isNew).length,translate:plan.filter(x=>x.dailyActivity==='translate').length,listen:plan.filter(x=>x.dailyActivity==='listen').length,dictation:plan.filter(x=>x.dailyActivity==='dictation').length,suchsel:plan.filter(x=>x.dailyActivity==='suchsel').length}};
 queue=plan;initialCount=plan.length;completed=0;revealed=false;wordExercise=null;searchPuzzle=null;draft='';playedAudioCard=null;verbSession=null;endingsDaily=null;applyDailyCard();syncControls();showView('practice');render();
}
function dailyFinishNote(mix){
 const fresh=[[mix.verbsNew,'Verbformen'],[mix.endingsNew,'Endungen']].filter(([n])=>n).map(([n,l])=>n+' '+l).join(' · ');
 if(!fresh)return 'Nur fällige Wiederholungen – ohne neue Inhalte.';
 return mix.verbsNew+mix.endingsNew===mix.total?`Heute neu kennengelernt: ${fresh}`:`Fällige Wiederholungen · neu dazu: ${fresh}`;
}
function finishDailySession(){
 if(!dailySession)return;
 const previous=dailySession.previous;dailySession=null;activity=previous.activity;direction=previous.direction;difficulty=previous.difficulty;mode=previous.mode;queue=[];initialCount=0;completed=0;revealed=false;syncControls();renderStats();showView('home');
}

function renderStats(){
 syncWritingAvailability();
 const verbStats=verbSummary(VERBS,memory.verbProgress);
 $('verb-progress-summary').textContent=`${verbStats.seen} von ${verbStats.total} Formen gesehen · ${verbStats.secure} sicher · ${verbStats.due} zum Wiederholen`;
 $('home-verbs').hidden=activityLocked('verbs');
 $('quick-verb-review').textContent='Verbformen üben';
 $('home-verbs-note').textContent=!verbStats.seen?'Lerne die ersten Formen kennen':verbStats.due?`${verbStats.due} zum Wiederholen · dazu neue Formen`:'Alles wiederholt · weiter mit neuen Formen';
 if(typeof renderHomeExtras==='function')renderHomeExtras();else $('today-count').textContent=memory.daily[day()]||0;
 $('total').textContent=`${data.length} finnische Sätze`;
 $('audio-total').textContent=`${data.filter(s=>s.audios.length).length} mit Originalaufnahme`;
 renderLearningInsights();
 $('levels').innerHTML=levels.map(n=>{const all=(activity==='writing'?[...data,...archived]:data).filter(s=>s.level===n&&(['translate','grammar','writing','verbs','suchsel','endings','dialogs'].includes(activity)||s.audios.length)&&(activity!=='grammar'||matchesTopic(s))&&(activity!=='suchsel'||canSearch(s))),seen=all.filter(s=>activity==='writing'?isWritingEligible(s):activity==='verbs'?['fi-de','de-fi'].some(dir=>memory.reviews[s.id+':'+dir]):studyDirections().some(dir=>review(s,dir))).length;return `<button class="level ${n===level?'active':''} ${levelLocked(n)?'locked':''}" data-level="${n}" aria-pressed="${n===level}"><span class="level-number">${String(n).padStart(2,'0')}</span><span><b>Level ${n}</b><small>${levelLocked(n)?'Mit kostenlosem Konto':activity==='writing'?`${seen} Sätze bereit`:`${seen} von ${all.length} geübt`}</small></span></button>`;}).join('');
 $('new-count').textContent=base().filter(s=>eligibleDirections(s,'new').length).length;
 const dueCount=base(true).filter(s=>eligibleDirections(s,'review').length).length;
 $('due-count').textContent=dueCount;
 renderHomeSession(verbStats,dueCount);renderDailyPlan();
 $('fav-count').textContent=base(true).filter(s=>memory.favorites.includes(s.id)).length;
 $('practice-summary').textContent=`Level ${level} · ${ACTIVITY_LABELS[activity]}`;
 $('settings-level').textContent=`Level ${level}`;
 document.querySelectorAll('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===mode);b.setAttribute('aria-pressed',b.dataset.mode===mode);});
 if((activity==='verbs'&&verbSession?.daily)||(activity==='endings'&&endingsDaily&&dailySession?.active)){
  $('practice-summary').textContent='Wiederholen';$('session-title').textContent='Wiederholen';
  $('session-progress').textContent=`${completed} / ${completed+queue.length}`;$('progress-bar').style.width=`${completed/Math.max(1,completed+queue.length)*100}%`;return;
 }
 if(activity==='verbs'){
  $('practice-summary').textContent='Verbformen · Präsens';
  $('session-title').textContent='Verbformen · Präsens';
  const count=verbSession?.answers.length||0,total=verbSession?.count||0;
  $('session-progress').textContent=total?`${count} / ${total}`:'Aufgabenanzahl wählen';
  $('progress-bar').style.width=total?`${count/total*100}%`:'0%';return;
 }
 if(activity==='dialogs'){const session=dialogState.session;$('session-title').textContent=session?`Level ${session.dialog.level} · Dialog · ${session.dialog.title}`:`Level ${level} · Dialoge`;$('session-progress').textContent=session?`${Math.min(session.position,session.dialog.lines.length)} / ${session.dialog.lines.length}`:'Dialog wählen';$('progress-bar').style.width=session?`${Math.min(1,session.position/session.dialog.lines.length)*100}%`:'0%';return;}
 if(activity==='endings'){const session=endingsState.level===level?endingsState.session:null,total=session?.items.length||0,count=session?.answers.length||0;$('session-title').textContent=`Level ${level} · Endungen · ${difficulty==='easy'?'Leicht':'Schwer'}`;$('session-progress').textContent=total?`${count} / ${total}`:'Aufgabenanzahl wählen';$('progress-bar').style.width=total?`${count/total*100}%`:'0%';return;}
 if(activity==='writing'){const session=writingSessions[level],total=session?.items.length||0,count=session?.answers.length||0;$('session-title').textContent=`Level ${level} · Schreibtest · Deutsch → Finnisch`;$('session-progress').textContent=total?`${count} / ${total}`:(writingPool().length>=MIN_WRITING_SENTENCES?'Satzanzahl wählen':'Noch keine Sätze bereit');$('progress-bar').style.width=total?`${count/total*100}%`:'0%';return;}
 $('session-title').textContent=guidedNew&&pathSession?`Level ${level} · ${pathLabel(pathSession.topic,pathSession.lesson)}`:favoritesRound&&mode==='favorites'?'Deine Favoriten · alle Level':`Level ${level} · ${activity==='grammar'?GRAMMAR_TOPICS.find(t=>t.id===grammarTopic).label:mode==='new'?'Neue Sätze · Audio zuerst':mode==='review'?'Wiederholen':'Deine Favoriten'}`;
 $('session-progress').textContent=initialCount?`${completed} / ${completed+queue.length}`:'Keine Karten ausgewählt';
 $('progress-bar').style.width=initialCount?`${completed/(completed+queue.length)*100}%`:'0%';
}
let currentInsights=null;
function insightButton(kind,ready){return `<button type="button" data-insight="${kind}" data-exercise-start ${ready?'':'disabled'}>${ready?'Jetzt üben':'Noch Daten sammeln'}</button>`;}
function renderLearningInsights(){
 const container=$('learning-insights');if(!container||!ready)return;
 currentInsights=buildLearningInsights({sentences:[...data,...archived],grammar,grammarTopics:GRAMMAR_TOPICS,reviews:memory.reviews,verbProgress:memory.verbProgress,verbs:VERBS,pronouns:PRONOUNS,events:memory.performanceEvents});
 const topic=id=>GRAMMAR_TOPICS.find(item=>item.id===id)?.label||'Grammatik';
 const activityLabel=id=>id==='listen'?'Hören':'Übersetzen';
 const percent=value=>`${Math.round(value*100)} % sicher`;
 const words=currentInsights.words,verbs=currentInsights.verbs,grammarInsight=currentInsights.grammar,activityInsight=currentInsights.activity,improved=currentInsights.improved;
 const comparison=activityInsight.comparison,comparisonText=comparison.listen!==undefined&&comparison.translate!==undefined?`Hören: ${percent(comparison.listen)} · Übersetzen: ${percent(comparison.translate)}`:activityInsight.ready?`${activityLabel(activityInsight.activity)} braucht im Moment mehr Aufmerksamkeit.`:'Bewerte Hören und Übersetzen jeweils mindestens zweimal.';
 const improvedLabel=improved.id.startsWith('grammar:')?topic(improved.id.slice(8)):ACTIVITY_LABELS[improved.id]||'dieser Bereich';
 container.innerHTML=`<article class="insight-card"><p class="insight-kicker">Wortschatz</p><h3>Häufig verwechselte Wörter</h3><p>${words.ready?'Diese Wörter tauchen besonders oft in schwierigen Sätzen auf.':'Nach den ersten schwierigen Bewertungen erscheinen hier konkrete Wörter.'}</p>${words.ready?`<div class="insight-tags">${words.labels.map(word=>`<span lang="fi">${escape(word)}</span>`).join('')}</div>`:''}${insightButton('words',words.ready)}</article>
 <article class="insight-card"><p class="insight-kicker">Verbformen</p><h3>Schwierige Verben und Personen</h3><p>${verbs.ready?'Diese Kombinationen verursachen derzeit die meisten Fehler.':'Noch ist keine Verbform auffällig schwierig.'}</p>${verbs.ready?`<div class="insight-tags">${verbs.items.map(item=>`<span lang="fi">${escape(item.label)}</span>`).join('')}</div>`:''}${insightButton('verbs',verbs.ready)}</article>
 <article class="insight-card"><p class="insight-kicker">Grammatik</p><h3>Schwache Grammatikthemen</h3><p>${grammarInsight.ready?`${escape(topic(grammarInsight.topicId))} ist aktuell dein deutlichstes Übungsfeld.`:'Bewerte mindestens zwei Aufgaben desselben Grammatikthemas.'}</p>${grammarInsight.ready?`<div class="insight-tags"><span>${escape(topic(grammarInsight.topicId))}</span><span>${percent(grammarInsight.average)}</span></div>`:''}${insightButton('grammar',grammarInsight.ready)}</article>
 <article class="insight-card"><p class="insight-kicker">Übungsarten</p><h3>Hören oder Übersetzen?</h3><p>${comparisonText}</p>${activityInsight.ready?`<div class="insight-tags"><span>${escape(activityLabel(activityInsight.activity))} gezielt stärken</span></div>`:''}${insightButton('activity',activityInsight.ready)}</article>
 <article class="insight-card"><p class="insight-kicker">Entwicklung</p><h3>Zuletzt verbessert</h3><p>${improved.ready?`Bei ${escape(improvedLabel)} sind deine letzten Bewertungen klar besser geworden.`:'Sobald mehrere Bewertungen vergleichbar sind, siehst du hier deine Fortschritte.'}</p>${improved.ready?`<div class="insight-tags"><span>${escape(improvedLabel)}</span><span>+${Math.round(improved.delta*100)} Punkte</span></div>`:''}${insightButton('improved',improved.ready)}</article>`;
 container.querySelectorAll('[data-insight]').forEach(button=>button.onclick=()=>startInsight(button.dataset.insight));
}
function startTargetedSentences(ids,nextActivity,topicId=''){
 const wanted=new Set(ids),available=[...data,...archived].filter(sentence=>wanted.has(sentence.id)&&(nextActivity!=='listen'||sentence.audios.length));
 if(!available.length){activity=nextActivity;if(topicId)grammarTopic=topicId;mode='new';start();showView('practice');return;}
 level=available[0].level;activity=nextActivity;if(topicId)grammarTopic=topicId;direction=nextActivity==='translate'?'de-fi':direction;difficulty=nextActivity==='translate'?'easy':difficulty;mode='review';dailySession=null;guidedNew=false;
 queue=shuffle(available.filter(sentence=>sentence.level===level)).slice(0,10).map(sentence=>({...sentence,practiceDirection:nextActivity==='translate'?'de-fi':'fi-de'}));initialCount=queue.length;completed=0;revealed=false;wordExercise=null;searchPuzzle=null;draft='';playedAudioCard=null;syncControls();persist();showView('practice');render();
}
function startInsight(kind){
 if(!currentInsights)return;
 if(kind==='words')return startTargetedSentences(currentInsights.words.sentenceIds,'translate');
 if(kind==='verbs'){
  const keys=currentInsights.verbs.keys;if(!keys.length)return;activity='verbs';mode='review';dailySession=null;verbSession={...createVerbSession(keys.length<=5?5:10),count:Math.min(10,keys.length),reviewKeys:keys.slice(0,10)};nextVerbQuestion();showView('practice');return;
 }
 if(kind==='grammar')return startTargetedSentences(currentInsights.grammar.sentenceIds,'grammar',currentInsights.grammar.topicId);
 if(kind==='activity')return startTargetedSentences(currentInsights.activity.sentenceIds,currentInsights.activity.activity);
 if(kind==='improved'){
  const id=currentInsights.improved.id;return id.startsWith('grammar:')?startTargetedSentences(currentInsights.improved.sentenceIds,'grammar',id.slice(8)):startTargetedSentences(currentInsights.improved.sentenceIds,id);
 }
}
function renderHomeSession(verbStats,dueCount){
 const descriptions={suchsel:'Finde die finnischen Wörter zum deutschen Satz im Buchstabengitter.',translate:'Übe finnische Sätze und ihre deutsche Übersetzung.',listen:'Höre finnische Sätze und verstehe ihre Bedeutung.',dictation:'Höre einen finnischen Satz und schreibe ihn auf.',verbs:'Übe die richtige Verbform im Präsens.',writing:'Übersetze bekannte deutsche Sätze ins Finnische.',grammar:'Übe Sätze zu einem bestimmten Grammatikthema.',endings:'Setze Wörter in die richtige Form: Fälle, Plural und Stufenwechsel.',dialogs:'Lies kurze Alltagsdialoge zu deinen Themen und spiele eine Rolle mit.'};
 const detail=activity==='dialogs'?'13 Themen':activity==='endings'?(difficulty==='easy'?'Leicht · Auswahl':'Schwer · selbst schreiben'):activity==='grammar'?GRAMMAR_TOPICS.find(t=>t.id===grammarTopic)?.label:['writing','suchsel'].includes(activity)?'Deutsch → Finnisch':isTranslation()?DIRECTION_LABELS[direction]:'Mit Originalaufnahme';
 $('continue-title').textContent=ACTIVITY_LABELS[activity];
 $('home-session-description').textContent=descriptions[activity];
 $('home-direction-control').hidden=activity!=='translate';
 document.querySelectorAll('[data-home-direction]').forEach(b=>{const selected=b.dataset.homeDirection===direction;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 $('home-session-meta').textContent=activity==='verbs'?VERBS.length+' Verben · Präsens · alle sechs Personen':'Level '+level+(activity==='translate'?'':' · '+detail)+(isTranslation()&&audioOnly?' · Nur mit Audio':'');
 $('continue-practice').textContent=activity==='translate'?(direction==='random'?'Beide Lernrichtungen':DIRECTION_LABELS[direction])+' üben':['listen','dictation','verbs','suchsel','endings'].includes(activity)?'Üben':activity==='dialogs'?'Dialoge öffnen':ACTIVITY_LABELS[activity]+' üben';
 $('continue-practice').disabled=!ready;
 const count=activity==='verbs'?verbStats.due:dueCount;
 const unit=activity==='verbs'?(count===1?'Verbform':'Verbformen'):(count===1?'Satz':'Sätze');
 $('home-review').textContent=count?count+' '+unit+' wiederholen':'Keine '+(activity==='verbs'?'Verbformen':'Sätze')+' zu wiederholen';
 $('home-review').disabled=!ready||count===0;
 $('home-review').hidden=['writing','grammar','endings','dialogs'].includes(activity);
 $('home-review').setAttribute('aria-label',$('home-review').textContent+' · '+ACTIVITY_LABELS[activity]+(isTranslation()?' · '+DIRECTION_LABELS[direction]:''));
 document.querySelectorAll('[data-home-activity]').forEach(b=>{const selected=b.dataset.homeActivity===activity;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 syncActivityLocks();
}
function prioritizeAudio(pool){return [...shuffle(pool.filter(s=>s.audios.length&&!s.translations[0].origin)),...shuffle(pool.filter(s=>s.audios.length&&!!s.translations[0].origin)),...shuffle(pool.filter(s=>!s.audios.length))];}
function start(){if(!ready)return;favoritesRound=null;if(activityLocked(activity))activity='translate';guidedNew=false;dailySession=null;wordExercise=null;searchPuzzle=null;stopAudio();playedAudioCard=null;draft='';if(activity==='writing'&&!syncWritingAvailability())activity='translate';syncControls();if(['verbs','endings','dialogs'].includes(activity)){queue=[];revealed=false;persist();render();return;}if(activity==='writing'){queue=[];revealed=false;persist();render();return;}const pool=filtered();queue=(mode==='new'&&!['grammar','suchsel'].includes(activity)?prioritizeAudio(pool):mode==='review'?shuffle(pool).sort((a,b)=>lastPracticed(a,memory.reviews)-lastPracticed(b,memory.reviews)):shuffle(pool)).slice(0,10).map(s=>{const choices=activity==='grammar'?studyDirections():eligibleDirections(s);return {...s,practiceDirection:choices[Math.floor(Math.random()*choices.length)]};});initialCount=queue.length;completed=0;revealed=false;persist();render();}
function source(s){
 const original=()=>`<a href="https://tatoeba.org/en/sentences/show/${s.id}" target="_blank" rel="noopener">#${s.id} · ${escape(s.owner||'Tatoeba')}</a> · ${escape(s.license)}`;
 if(s.origin==='english_bridge')return `Für diese App mit KI aus dem Englischen übersetzt.<br>Englische Vorlage: ${source(s.source)}<br><span lang="en">${escape(s.source.text)}</span>`;
 if(s.origin==='finnish_adaptation')return `Für diese App mit KI aus dem Finnischen übersetzt.<br>Finnische Vorlage: ${source(s.source)}`;
 if(s.origin==='tatoeba_via_english')return `${original()}<br>Indirekt über eine gemeinsame englische Vorlage verknüpft: ${source(s.source)}<br><span lang="en">${escape(s.source.text)}</span>`;
 return original();
}
function sourceIcon(s){
 if(!s||!/^\d+$/.test(String(s.id))||['english_bridge','finnish_adaptation','teacher_created'].includes(s.origin))return '';
 const id=Number(s.id),owner=s.owner||'Tatoeba',license=s.license||'CC BY 2.0 FR';
 const label=`Quelle: Tatoeba-Satz #${id} von ${owner}, Lizenz ${license}. Auf Tatoeba öffnen.`;
 return `<button type="button" class="sentence-source-icon" data-i18n-attrs data-source-url="https://tatoeba.org/en/sentences/show/${id}" data-source-label="${escape(label)}" aria-label="${escape(label)}" aria-expanded="false" title="${escape(label)}"></button>`;
}
let sourcePopover=null,sourcePopoverTrigger=null;
function closeSourcePopover(){
 if(!sourcePopover||sourcePopover.hidden)return;
 sourcePopover.hidden=true;
 sourcePopoverTrigger?.setAttribute('aria-expanded','false');
 sourcePopoverTrigger=null;
}
function openSourcePopover(trigger){
 if(sourcePopoverTrigger===trigger&&!sourcePopover?.hidden){closeSourcePopover();return;}
 if(!sourcePopover){
  sourcePopover=document.createElement('div');
  sourcePopover.id='sentence-source-popover';
  sourcePopover.className='sentence-source-popover';
  sourcePopover.hidden=true;
  sourcePopover.setAttribute('role','dialog');
  sourcePopover.setAttribute('aria-label','Satzquelle');
  sourcePopover.innerHTML='<p class="sentence-source-popover-text"></p><a target="_blank" rel="noopener">Satz auf Tatoeba öffnen ↗</a>';
  document.body.appendChild(sourcePopover);
 }
 sourcePopoverTrigger?.setAttribute('aria-expanded','false');
 sourcePopoverTrigger=trigger;
 trigger.setAttribute('aria-expanded','true');
 sourcePopover.querySelector('p').textContent=trigger.dataset.sourceLabel;
 sourcePopover.querySelector('a').href=trigger.dataset.sourceUrl;
 sourcePopover.hidden=false;
 const rect=trigger.getBoundingClientRect(),box=sourcePopover.getBoundingClientRect(),gap=8;
 let top=rect.bottom+gap;
 if(top+box.height>window.innerHeight-12)top=Math.max(12,rect.top-box.height-gap);
 const left=Math.min(Math.max(12,rect.left+rect.width/2-box.width/2),window.innerWidth-box.width-12);
 sourcePopover.style.top=`${top}px`;
 sourcePopover.style.left=`${left}px`;
}
document.addEventListener('click',event=>{
 const trigger=event.target.closest?.('.sentence-source-icon');
 if(trigger){event.preventDefault();event.stopPropagation();openSourcePopover(trigger);return;}
 if(sourcePopover&&!sourcePopover.contains(event.target))closeSourcePopover();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSourcePopover();});
window.addEventListener('resize',closeSourcePopover);
window.addEventListener('scroll',closeSourcePopover,true);
function translationNote(s){
 const origin=s.translations[0].origin;
 if(origin==='english_bridge')return 'Deutsch aus einer englischen Tatoeba-Vorlage übersetzt.';
 if(origin==='finnish_adaptation')return 'Deutsche Fassung für diese App aus dem Finnischen übersetzt.';
 if(origin==='tatoeba_via_english')return 'Deutsche Tatoeba-Fassung über eine gemeinsame englische Vorlage verknüpft.';
 return '';
}
function translationProvenanceBadge(t){
 if(['english_bridge','finnish_adaptation'].includes(t?.origin))return '<span class="translation-provenance generated">KI-Übersetzung · ungeprüft</span>';
 if(t?.origin==='tatoeba_via_english')return '<span class="translation-provenance indirect">Indirekte Tatoeba-Übersetzung</span>';
 return '<span class="translation-provenance direct">Direkte Tatoeba-Übersetzung</span>';
}
function syncControls(){
 $('practice-settings').hidden=!!dailySession?.active||guidedNew;
 $('settings-level-row').hidden=activity==='verbs';
 $('grammar-controls').hidden=activity!=='grammar';
 if(activity==='grammar'){
  const topic=GRAMMAR_TOPICS.find(t=>t.id===grammarTopic);
  $('grammar-topic').innerHTML=GRAMMAR_TOPICS.map(t=>{const count=data.filter(s=>s.level===level&&(!audioOnly||s.audios.length)&&topicNotes(s,grammar,t.id).length).length;return `<option value="${t.id}" ${t.id===grammarTopic?'selected':''}>${t.label} · ${count} Sätze</option>`;}).join('');
  $('grammar-help').textContent=grammarLoading?'Die Grammatikhilfen werden geladen …':grammarAvailable?`${topic.hint} Bis zu 10 Sätze pro Runde, auch bereits gelernte. Bewertungen zählen zur gewählten Lernrichtung.`:'Die Grammatikhilfen konnten nicht geladen werden. Bitte lade die Seite bei bestehender Verbindung neu.';
 }
 $('practice-toolbar').hidden=['writing','verbs','suchsel','endings','dialogs'].includes(activity);$('learning-modes').hidden=['writing','grammar','verbs','endings','dialogs'].includes(activity);$('writing-help').hidden=activity!=='writing';$('writing-review-controls').hidden=activity!=='writing';$('writing-history').hidden=true;
 $('direction-group').hidden=!isTranslation();
 document.querySelectorAll('[data-search-difficulty-group]').forEach(g=>g.hidden=activity!=='suchsel');
 document.querySelectorAll('[data-search-difficulty]').forEach(b=>{const selected=b.dataset.searchDifficulty===searchDifficulty;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 document.querySelectorAll('[data-difficulty-group]').forEach(g=>g.hidden=!['translate','endings'].includes(activity));
 document.querySelectorAll('[data-difficulty]').forEach(b=>{const selected=b.dataset.difficulty===difficulty;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
 const difficultyNote=$('translation-difficulty-note');if(difficultyNote)difficultyNote.textContent=activity==='endings'?(difficulty==='easy'?'Form auswählen, der Fall wird angezeigt':'Form selbst schreiben'):difficulty==='easy'?'Wörter in die richtige Reihenfolge bringen':'Übersetzung selbst schreiben';
 for(const [name,value] of [['activity',activity],['direction',direction]])document.querySelectorAll(`[data-${name}]`).forEach(b=>{const selected=b.dataset[name]===value;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',selected);});
 $('audio-only').disabled=!isTranslation();
 $('audio-only').checked=!isTranslation()||audioOnly;
 $('notice').textContent='';
}
// Übersetzen ohne eigene Eingabe: die Satzkachel dreht sich um wie die Wortkarte auf der Startseite.
let flipAnimatedFor='';
function flipReveal(s){return activity==='translate'&&!isWordPractice()&&(cardDirection(s)==='fi-de'||!draft.trim());}
function flipMarkup(s,front){
 const fiFront=cardDirection(s)==='fi-de',shown=fiFront?s:s.translations[0];
 const key=`${s.id}:${cardDirection(s)}`,animate=flipAnimatedFor!==key;flipAnimatedFor=key;
 const back=fiFront?s.translations.map((t,i)=>`<p lang="de" class="${i?'variant':''}">${escape(t.text)}${sourceIcon(t)}</p>`).join(''):`<p lang="fi">${escape(s.text)}${sourceIcon(s)}</p>`;
 return `<div class="sentence-flip is-flipped ${animate?'animate':''}" role="button" tabindex="0" aria-pressed="true" aria-label="Karte umdrehen"><div class="sentence-flip-inner"><p class="sentence sentence-front" lang="${fiFront?'fi':'de'}">${escape(front)}${sourceIcon(shown)}</p><div class="sentence sentence-back">${back}</div></div></div>${fiFront?translationProvenanceBadge(s.translations[0]):''}`;
}
function bindSentenceFlip(){
 // Vor dem Aufdecken: Antippen der Satzkachel deckt die Übersetzung auf (wie der Knopf); Wörter öffnen weiter die Wortinfo.
 const tile=!revealed&&activity==='translate'&&!isWordPractice()?document.querySelector('#card .sentence'):null;
 if(tile){tile.classList?.add?.('sentence-tap');tile.onclick=e=>{if(e.target.closest('button,a,.fi-word'))return;$('reveal')?.click();};}
 const card=document.querySelector('#card .sentence-flip');if(!card)return;
 const toggle=()=>{card.classList.remove('animate');const on=!card.classList.contains('is-flipped');card.classList.toggle('is-flipped',on);card.setAttribute('aria-pressed',String(on));};
 card.onclick=e=>{if(e.target.closest('button,a,.fi-word'))return;toggle();};
 card.onkeydown=e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();toggle();}};
}
function questionMarkup(s,front){
 if(!isTranslation()&&!revealed)return `<h2 class="listening-title">${activity==='listen'?'Hör genau hin.':'Was hörst du?'}</h2><p class="listening-hint">${activity==='listen'?'Höre den finnischen Satz und überlege, was er bedeutet.':'Höre den finnischen Satz und schreibe ihn auf.'}</p>`;
 if(revealed&&flipReveal(s))return flipMarkup(s,front);
 const shown=!isTranslation()||cardDirection(s)==='fi-de'?s:s.translations[0];return `<p class="sentence" lang="${!isTranslation()||cardDirection(s)==='fi-de'?'fi':'de'}">${escape(front)}${sourceIcon(shown)}</p>`;
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
 if(!revealed)return `<div class="dictation"><label for="dictation-input">Deine Eingabe auf Finnisch</label><textarea id="dictation-input" lang="fi" rows="3" maxlength="500" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-describedby="dictation-hint" data-i18n-attrs placeholder="Schreibe hier, was du hörst …"></textarea><div class="letter-buttons"><button type="button" data-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-letter="ö" aria-label="ö einfügen">ö</button></div><p id="dictation-hint">Achte auf ä, ö und doppelte Buchstaben. Du kannst die Aufnahme beliebig oft wiederholen.</p></div>`;
 const c=compareAnswer(draft,s.text);
 return `<div class="dictation comparison result-feedback-card ${c.same?'correct':'incorrect'}"><h3>${c.same?'Richtig gehört und geschrieben!':'Noch nicht ganz.'}</h3><span>Deine Eingabe</span><p lang="fi">${c.typed||'—'}</p>${c.same?'':`<span>Richtige Lösung</span><p class="correct-solution" lang="fi">${c.expected}${sourceIcon(s)}</p>`}<small>Großschreibung, Satzzeichen und zusätzliche Leerzeichen werden beim Vergleich ignoriert.</small></div>`;
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
 const session=writingSessions[level];if(!session?.items.length){const available=writingPool().length;if(available>=MIN_WRITING_SENTENCES){$('card').className='card writing-setup';$('card').innerHTML=`<h2 id="writing-setup-title" tabindex="-1">Wie viele Sätze möchtest du schreiben?</h2><p>Wähle die Länge deines Schreibtests. Aktuell sind ${available} geeignete ${available===1?'Satz':'Sätze'} in diesem Level verfügbar.</p><div class="choice-buttons writing-count-options" role="group" aria-label="Satzanzahl wählen"><button type="button" data-writing-count="5" data-exercise-start>5 Sätze</button><button type="button" data-writing-count="10" data-exercise-start ${available<10?'disabled title="Dafür brauchst du mindestens 10 geeignete Sätze."':''}>10 Sätze</button></div>`;document.querySelectorAll('[data-writing-count]').forEach(b=>b.onclick=()=>{startWritingSession(true,false,Number(b.dataset.writingCount));$('notice').textContent='';render();$('writing-input')?.focus();});return;}$('card').className='card empty';$('card').innerHTML='<h2>Noch keine Sätze bereit.</h2><p>Übe mindestens fünf Sätze jeweils zweimal in derselben Lernrichtung oder Hörübung. Du kannst auch ein anderes Level wählen.</p>';$('actions').innerHTML='<button id="writing-go-learn" class="primary" data-exercise-start>Sätze üben</button>';$('writing-go-learn').onclick=()=>{activity='translate';mode='new';start();};return;}
 const count=session.answers.length,total=session.items.length;
 if(count===total){
  $('card').className='card writing-results';
  $('card').innerHTML=`<h2 id="writing-result-title" tabindex="-1">${session.reviewOnly?'Auflösung deiner Wiederholung':'Deine Auflösung'}</h2><p class="writing-results-intro">${total} ${total===1?'Satz bearbeitet':'Sätze bearbeitet'}. Vergleiche Bedeutung und Formulierung. Andere Übersetzungen können ebenfalls richtig sein; es gibt keine automatische Fehlerbewertung. Markiere deine Antworten freiwillig: „Fast richtig“ und „Noch üben“ kommen auf die Wiederholungsliste, „Richtig“ entfernt sie daraus.</p>${session.items.map((s,i)=>{const same=normalizeAnswer(session.answers[i])===normalizeAnswer(s.text)||finnishSentenceMatches(session.answers[i],s.text);return `<article class="writing-result"><h3>${i+1}. <span lang="de">${escape(s.translations[0].text)}${sourceIcon(s.translations[0])}</span></h3>${translationProvenanceBadge(s.translations[0])}<div class="writing-comparison"><div><h4>Deine Antwort</h4><p lang="fi">${escape(session.answers[i])}</p></div><div><h4>Finnische Vorlage</h4><p lang="fi">${escape(s.text)}${sourceIcon(s)}</p></div></div><p class="writing-match">${same?'Entspricht der Vorlage (optionale Personalpronomen sowie Großschreibung, Leerzeichen und Satzzeichen ausgenommen).':'Abweichende Formulierung – prüfe selbst, ob die Bedeutung stimmt.'}</p>${same?'':translationFeedbackMarkup({answer:session.answers[i],templates:[s.text],language:'fi',sentenceText:s.text,compact:true})}${grammarMarkup(s,session.answers[i])}${translationNote(s)?`<p class="bridge-note">${escape(translationNote(s))}</p>`:''}<details class="sources"><summary>Quellen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations[0])}</p></details><div class="writing-rating-buttons" role="group" aria-label="Antwort ${i+1} selbst bewerten">${Object.entries(WRITING_RATINGS).map(([value,label])=>`<button data-writing-id="${s.id}" data-writing-rating="${value}" aria-pressed="${session.ratings?.[s.id]===value}">${label}</button>`).join('')}</div><p class="writing-rating-status">${session.ratings?.[s.id]?`Deine Bewertung: ${WRITING_RATINGS[session.ratings[s.id]]}`:'Noch nicht bewertet'}</p><button class="report-error" data-writing-report="${s.id}">Fehler melden</button></article>`;}).join('')}`;
  $('actions').innerHTML='<button class="primary" id="writing-new-session">Neuer Schreibtest</button>';$('writing-new-session').onclick=()=>{delete writingSessions[level];$('notice').textContent='';render();$('writing-setup-title')?.focus();};
  document.querySelectorAll('[data-writing-rating]').forEach(b=>b.onclick=()=>rateWritingAnswer(session,Number(b.dataset.writingId),b.dataset.writingRating));
  document.querySelectorAll('[data-writing-report]').forEach(b=>b.onclick=()=>{const s=session.items.find(s=>s.id===Number(b.dataset.writingReport));if(s)openReport(s);});return;
 }
 const s=session.items[count];$('card').className='card writing-card';
 $('card').innerHTML=`<div class="card-top"><span class="card-label">${session.reviewOnly?'Gezielte Wiederholung':'Schreibtest'} · Deutsch → Finnisch</span><span class="writing-counter">Satz ${count+1} von ${total}</span></div><p class="sentence" lang="de">${escape(s.translations[0].text)}${sourceIcon(s.translations[0])}</p><div class="dictation"><label for="writing-input">Deine Übersetzung auf Finnisch</label><textarea id="writing-input" lang="fi" rows="3" maxlength="2000" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-describedby="writing-input-hint" placeholder="Schreibe deine Antwort …"></textarea><div class="letter-buttons"><button type="button" data-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-letter="ö" aria-label="ö einfügen">ö</button></div><p id="writing-input-hint" class="translation-hint">Mit OK gibst du deine Antwort ab. Die Vorlage siehst du erst am Ende.</p></div>`;
 const input=$('writing-input');input.value=session.draft;input.oninput=e=>{session.draft=e.target.value;$('notice').textContent='';};
 document.querySelectorAll('[data-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart;if(input.value.length-(input.selectionEnd-pos)>=2000)return;input.setRangeText(b.dataset.letter,pos,input.selectionEnd,'end');session.draft=input.value;input.focus();};});
 $('actions').innerHTML=`<button class="primary" id="writing-ok">${count+1===total?'OK · Zur Auflösung':'OK · Nächster Satz'}</button>`;$('writing-ok').onclick=()=>submitWritingAnswer(session,count);
 $('writing-history').hidden=count===0;$('writing-history').innerHTML=count?`<h2 id="writing-history-title">Deine bisherigen Antworten</h2><ol>${session.answers.map((answer,i)=>`<li><p lang="de">${escape(session.items[i].translations[0].text)}${sourceIcon(session.items[i].translations[0])}</p><p lang="fi" class="writing-history-answer">${escape(answer)}</p></li>`).join('')}</ol>`:'';
}

const animatedWordChecks=new WeakSet();
function wordPracticeMarkup(s){
 const language=cardDirection(s)==='fi-de'?'de':'fi';
 if(!wordExercise)wordExercise=createWordExercise(s,language,data);
 const w=wordExercise;
 if(revealed){
  // Wie auf der Satzkarte der Startseite: der Antwortsatz wird grün oder rot, darunter „Richtig!“ bzw. die Lösung.
  const correct=wordAnswerMatches(w),solution=language==='de'?s.translations[0]:s;
  const tiles=w.selected.map(id=>w.tokens.find(t=>t.id===id)).filter(Boolean).map((t,i)=>`<span class="word-tile" style="--i:${i}">${escape(t.text)}</span>`).join('');
  // Grün/Rot nur beim ersten Anzeigen nach dem Prüfen animieren, nicht bei jedem Neuzeichnen.
  const animate=!animatedWordChecks.has(w);animatedWordChecks.add(w);
  return `<div class="word-result word-checked ${correct?'correct':'incorrect'}${animate?' check-anim':''}"><div class="word-answer ${correct?'is-right':'is-wrong'}" lang="${language}">${tiles||'<span class="word-placeholder">–</span>'}</div><p class="word-solution">${correct?'Richtig!':`Leider nicht, richtig ist: <span lang="${language}">${escape(solution.text)}${sourceIcon(solution)}</span>`}</p></div>`;}
 return `<div class="word-practice"><p id="word-hint" class="sr-only">${wordHint(w)}</p><div id="word-answer" class="word-answer" role="group" aria-label="Dein Antwortsatz" lang="${language}"></div><div id="word-bank" class="word-bank" role="group" aria-label="Verfügbare Wörter" data-i18n-attrs lang="${language}" aria-describedby="word-hint"></div></div>`;
}
// Die Anleitung steht im leeren Antwortfeld (wie auf der Gastkarte); für Screenreader zusätzlich unsichtbar davor.
const wordHint=w=>`Tippe die Wörter in der richtigen Reihenfolge an. ${w.tokens.length-w.expected.length===1?'1 Wort gehört':'2 Wörter gehören'} nicht dazu.`;
function bindWordPractice(){
 if(revealed)return;
 const w=wordExercise;
 const update=()=>{
  $('word-answer').innerHTML=w.selected.length?w.selected.map(id=>{const t=w.tokens.find(t=>t.id===id);return `<button type="button" data-return-word="${id}" data-i18n-attrs aria-label="${escape(t.text)} zurücklegen">${escape(t.text)}</button>`;}).join(''):`<span class="word-placeholder" aria-hidden="true" data-i18n>${wordHint(w)}</span>`;
  $('word-bank').innerHTML=w.tokens.map(t=>`<button type="button" data-pick-word="${t.id}" ${w.selected.includes(t.id)?'disabled':''}>${escape(t.text)}</button>`).join('');
  document.querySelectorAll('[data-pick-word]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.pickWord);if(w.selected.includes(id))return;w.selected.push(id);$('notice').textContent='';update();const next=document.querySelector('#word-bank button:not(:disabled)');(next||$('reveal'))?.focus({preventScroll:true});});
  document.querySelectorAll('[data-return-word]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.returnWord);w.selected=w.selected.filter(value=>value!==id);update();document.querySelector(`[data-pick-word="${id}"]`)?.focus({preventScroll:true});});
 };
 update();
}

function translationDraftMarkup(s){
 if(isWordPractice())return wordPracticeMarkup(s);
 if(!isTranslation()||cardDirection(s)==='fi-de')return '';
 const target=cardDirection(s)==='fi-de'?'de':'fi',label=target==='de'?'Deutsch':'Finnisch';
 if(revealed)return draft.trim()?translationFeedbackMarkup({answer:draft,templates:target==='fi'?[s.text]:s.translations.map(t=>t.text),language:target,sentenceText:s.text}):'<p class="translation-hint">Lies die Vorlage und bewerte anschließend, wie gut du den Satz schon kannst.</p>';
 const letters=target==='fi'?['ä','ö']:['ä','ö','ü','ß'];
 return `<div class="dictation translation-entry"><label for="translation-input">Deine Übersetzung auf ${label} (optional)</label><textarea id="translation-input" lang="${target}" rows="3" maxlength="2000" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="Optional: Schreibe deine Übersetzung … Du kannst die Übersetzung auch direkt anzeigen lassen, ohne etwas einzutippen."></textarea><div class="letter-buttons">${letters.map(letter=>`<button type="button" data-letter="${letter}" aria-label="${letter} einfügen">${letter}</button>`).join('')}</div></div>`;
}
// Link differences to existing, sentence-specific notes; never infer a grammar rule
// from a suffix or treat an alternative translation as a proven error.
function answerGrammarNotes(s,notes,answer){
 const tokenize=text=>normalizeAnswer(text).split(' ').filter(Boolean);
 const expected=tokenize(s.text),typed=tokenize(answer);
 if(!typed.length||normalizeAnswer(answer)===normalizeAnswer(s.text)||finnishSentenceMatches(answer,s.text))return [];
 // Bound work for pasted answers and malformed imported sentences.
 if(expected.length>150||typed.length>300)return [];
 const dp=Array.from({length:expected.length+1},()=>new Uint16Array(typed.length+1));
 for(let i=0;i<=expected.length;i++)dp[i][0]=i;
 for(let j=0;j<=typed.length;j++)dp[0][j]=j;
 for(let i=1;i<=expected.length;i++)for(let j=1;j<=typed.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(expected[i-1]===typed[j-1]?0:1));
 const changed=new Set();let i=expected.length,j=typed.length;
 while(i||j){
  if(i&&j&&expected[i-1]===typed[j-1]){i--;j--;}
  else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1){changed.add(--i);j--;}
  else if(i&&dp[i][j]===dp[i-1][j]+1)changed.add(--i);
  else j--;
 }
 const contains=(words,focus)=>words.some((_,start)=>focus.every((word,k)=>words[start+k]===word));
 return notes.filter(note=>{
  const focus=tokenize(note.focus||'');
  if(!focus.length||contains(typed,focus))return false;
  return expected.some((_,start)=>focus.every((word,k)=>expected[start+k]===word)&&focus.some((_,k)=>changed.has(start+k)));
 }).sort((a,b)=>tokenize(a.focus).length-tokenize(b.focus).length).slice(0,2);
}
// Grammatik kommt nach dem Start an: offene Übung ohne Neustart aktualisieren.
function grammarLoaded(){
 if(!ready||$('practice-view').hidden)return;
 if(activity==='grammar'){syncControls();if(!queue.length){start();render();}return;}
 const box=$('card')?.querySelector('details.grammar');
 if(box&&revealed&&queue[0]&&!['writing','verbs','endings','dialogs','suchsel'].includes(activity))box.outerHTML=grammarMarkup(queue[0]);
}
function grammarMarkup(s,writingAnswer=null){
 if(!revealed&&writingAnswer===null)return '';
 const entry=grammar[String(s.id)];
 const notes=entry?.sentence===s.text?(activity==='grammar'&&writingAnswer===null?topicNotes(s,grammar,grammarTopic):entry.notes):[];
 if(!notes?.length)return `<details class="grammar"><summary>Grammatik verstehen und Hinweise <span>0</span></summary><p>${grammarAvailable?'Für diesen Satz ist noch keine Grammatikhilfe hinterlegt.':grammarLoading?'Die Grammatikhilfe wird geladen …':'Die Grammatikhilfe ist gerade nicht verfügbar. Lade die Seite bei bestehender Verbindung neu.'}</p></details>`;
 const answer=writingAnswer!==null?writingAnswer:activity==='dictation'||(isTranslation()&&cardDirection(s)==='de-fi')?draft:'';
 const relevant=answerGrammarNotes(s,notes,answer),other=notes.filter(n=>!relevant.includes(n));
 const noteMarkup=n=>`<article lang="de"><h3>${escape(n.title)}</h3><p class="grammar-focus" lang="fi">${escape(n.focus)}</p><p>${escape(n.text)}</p></article>`;
 return `<details class="grammar" ${activity==='grammar'&&!relevant.length?'open':''}><summary>Grammatik verstehen und Hinweise <span>${relevant.length||notes.length}</span></summary>${relevant.length?`<p class="grammar-answer-intro">Diese Stellen weichen von der Vorlage ab. Die Hinweise erklären die Form in der Vorlage – andere Formulierungen können ebenfalls richtig sein.</p><div class="grammar-notes grammar-answer-notes">${relevant.map(noteMarkup).join('')}</div>${other.length?`<details class="grammar-more"><summary>Alle weiteren Satzhinweise (${other.length})</summary><div class="grammar-notes">${other.map(noteMarkup).join('')}</div></details>`:''}`:`<div class="grammar-notes">${notes.map(noteMarkup).join('')}</div>`}<p class="grammar-credit">Mit KI formulierte Lernhilfe zu ausgewählten Stellen im Satz. <a href="https://uusikielemme.fi/finnish-grammar" target="_blank" rel="noopener">Grammatik zum Nachlesen (Englisch) ↗</a></p></details>`;
}
function audioMarkup(s){if(!s.audios.length)return revealed&&s.audio_status==='license_missing'?'<p class="audio-license-note">Auf Tatoeba gibt es eine Aufnahme. Da keine Wiederverwendungsfreigabe angegeben ist, wird sie hier nicht eingebunden.</p>':'';if(isTranslation()&&cardDirection(s)==='de-fi'&&!revealed)return '';const a=s.audios[0],played=playedAudioCard===s;return `<div class="audio-row"><button class="audio-button" id="play-audio" data-played="${played}" data-state="idle" aria-label="${played?'Aufnahme wiederholen':'Finnischen Satz anhören'}"><svg class="icon-speaker" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M11 4 5 9H2v6h3l6 5V4Z"/><path d="M15 8a6 6 0 0 1 0 8M18 4a11 11 0 0 1 0 16"/></svg><svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg><span class="sr-only">${played?'Wiederholen':'Anhören'}</span></button><div class="speed-options" id="speed" role="group" aria-label="Wiedergabegeschwindigkeit">${[[1,'1×'],[0.75,'0,75×'],[0.5,'0,5×']].map(([v,l])=>`<button type="button" data-speed="${v}" aria-pressed="${speed===v}">${l}</button>`).join('')}</div></div>`;}

let verbSession = null;
function saveVerbProgress(progress,answered=false,event=null) {
 const daily=answered?{...memory.daily,[day()]:(Number(memory.daily[day()])||0)+1}:memory.daily;
 const performanceEvents=event?addPerformanceEvent(memory.performanceEvents,event):memory.performanceEvents;
 try { commitLearning({...memory,verbProgress:progress,daily,performanceEvents}); return true; }
 catch { $('notice').textContent='Dein Lernstand konnte nicht gespeichert werden. Bitte versuche es erneut.'; return false; }
}
// Brings the exercise card to the top of the screen before focusing. A plain focus() made the
// browser jump to the focused button/input at the bottom, so the question and the pronoun roll were off screen.
function focusVerbView(el){
 const card=$('card');
 if(card){const top=card.getBoundingClientRect().top;if(top<0||top>innerHeight*.4)scrollTo({top:Math.max(0,top+scrollY-12),behavior:'auto'});}
 el?.focus({preventScroll:true});
}
function nextVerbQuestion() {
 const item=chooseCombination(VERBS,memory.verbProgress,verbSession);
 if(!item)return;
 if(!saveVerbProgress(markAsked(memory.verbProgress,item.key)))return;
 verbSession.current=item;verbSession.draft='';verbSession.checked=false;
 verbSession.history.push(item.key);render();focusVerbView($('verb-input'));
}
function submitVerbAnswer() {
 const session=verbSession;
 if(activity!=='verbs'||!session?.current||session.checked)return;
 const answer=session.draft.trim();
 if(!answer){$('notice').textContent='Trage zuerst die Verbform ein.';$('verb-input')?.focus();return;}
 const {verb,person,key}=session.current,correct=answerMatches(answer,verb,person);
 if(!saveVerbProgress(markAnswered(memory.verbProgress,key,correct),true,{kind:'verb',verbId:verb.id,person,correct}))return;
 session.checked=true;session.correct=correct;
 const answeredIndex=session.answers.length;
 session.answers.push({verb,person,answer,correct});
 if(!correct){session.retries=session.retries.filter(r=>r.key!==key);session.retries.push({key,after:answeredIndex+3});}
 $('notice').textContent='';render();guestSaveHint();focusVerbView($('verb-next'));
}
// Startkarte der Verbübung: Beispiel, Kennzahlen, freigeschaltete Verben mit Fortschritt je Person, nächste Stufe.
function verbStartMarkup(summary){
 const progress=memory.verbProgress,now=Date.now(),open=unlockedVerbCount(VERBS,progress);
 const state=(v,p)=>{const r=progress[v.id+':'+p];return !r?.seen?'':r.streak>=2?'secure':'seen';};
 const seenIn=list=>list.reduce((n,v)=>n+PRONOUNS.filter((_,p)=>progress[v.id+':'+p]?.seen).length,0);
 const needed=open<VERBS.length?Math.max(0,Math.ceil(open*6*2/3)-seenIn(VERBS.slice(0,open))):0;
 const shown=VERBS.slice(Math.max(0,open-10),open),earlier=open-shown.length,next=VERBS.slice(open,open+5);
 const chip=v=>{const states=PRONOUNS.map((_,p)=>state(v,p)),done=states.every(Boolean);
  return `<li class="verb-chip${done?' is-done':''}"><span class="verb-chip-fi" lang="fi">${escape(v.id)}</span><span class="verb-chip-de">${escape(v.de)}</span><span class="verb-dots" role="img" aria-label="${states.filter(Boolean).length} von 6 Formen gesehen">${states.map(s=>`<i class="${s}"></i>`).join('')}</span></li>`;};
 const lock='<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';
 return `<span class="card-label">Verbformen · Präsens</span>
<div class="verb-hero"><div><h2>Wie viele Formen möchtest du üben?</h2><p class="verb-hero-sub">${VERBS.length} Verben · Die wichtigsten zuerst · Neue Formen und gezielte Wiederholungen</p></div>
<div class="verb-hero-demo" aria-hidden="true" lang="fi"><span class="verb-hero-pronoun">minä</span><span class="verb-hero-inf">olla</span><span class="verb-hero-arrow">→</span><span class="verb-hero-form">ole<span class="verb-ending">n</span></span></div></div>
<div class="verb-stats"><div><strong>${summary.seen}</strong><span>gesehen</span></div><div><strong>${summary.secure}</strong><span>sicher</span></div><div><strong>${summary.due}</strong><span>fällig</span></div></div>
<div class="verb-meter" aria-hidden="true"><span class="verb-meter-seen" style="width:${summary.total?summary.seen/summary.total*100:0}%"></span><span class="verb-meter-secure" style="width:${summary.total?summary.secure/summary.total*100:0}%"></span></div>
<p class="verb-coverage">${summary.seen} von ${summary.total} Formen schon gesehen · ${summary.secure} sicher</p>
<section class="verb-stage" aria-labelledby="verb-stage-title"><div class="verb-stage-head"><h3 id="verb-stage-title">Deine Verben</h3><span>${open} von ${VERBS.length} freigeschaltet</span></div>
<ul class="verb-chips">${shown.map(chip).join('')}</ul>${earlier?`<p class="verb-stage-more">+ ${earlier} weitere schon freigeschaltet</p>`:''}
${next.length?`<div class="verb-next"><span class="verb-next-label">${lock} Als Nächstes${needed?` · noch ${needed} ${needed===1?'Form':'Formen'}`:''}</span><ul>${next.map(v=>`<li lang="fi">${escape(v.id)}</li>`).join('')}</ul></div>`:''}</section>
<div class="choice-buttons verb-counts" role="group" aria-label="Anzahl der Aufgaben"><button type="button" data-verb-count="5" data-exercise-start><strong>5 Aufgaben</strong><small>ca. 2 Minuten</small></button><button type="button" data-verb-count="10" data-exercise-start><strong>10 Aufgaben</strong><small>ca. 4 Minuten</small></button></div>
<p class="verb-hint">Nach jeder Antwort siehst du alle sechs Formen – bei den wichtigsten Verben mit Satzmustern. Schwierige Formen kommen mit Abstand wieder.</p>`;
}
// Beispielsätze bzw. Satzmuster unter der Formentabelle (verb-examples.mjs).
function verbUsageMarkup(verb){
 const usage=verbUsage(verb.id);if(!usage)return '';
 const patterns=usage.kind==='patterns';
 return `<section class="verb-usage${patterns?' is-patterns':''}" aria-label="${patterns?'Satzmuster':'Beispiel'}"><h3>${patterns?'Satzmuster':usage.items.length>1?'Beispiele':'Beispiel'}</h3><ul>${usage.items.map(x=>`<li>${x.label?`<span class="verb-pattern">${escape(x.label)}</span>`:''}<span class="verb-example" lang="fi" data-words="">${escape(x.fi)}</span><span class="verb-example-de" lang="de">${escape(x.de)}</span></li>`).join('')}</ul><p class="verb-usage-note">Für Vanamo geschriebene Beispielsätze.</p></section>`;
}
// Marks the personal ending (minä -n, sinä -t, me -mme, te -tte, he -vat/-vät) so the pattern stands out.
function verbFormMarkup(form,person,verb){if(verb?.impersonal){const [who,...rest]=String(form).split(' ');return '<span class="verb-ending">'+escape(who)+'</span> '+escape(rest.join(' '));}const m=[/n$/,/t$/,null,/mme$/,/tte$/,/v[aä]t$/][person]?.exec(form);return m&&m.index>0?escape(form.slice(0,m.index))+'<span class="verb-ending">'+escape(m[0])+'</span>':escape(form);}
// Slot-machine reveal of the pronoun. The real pronoun stays in the DOM (screen readers, tests); only a CSS overlay rolls.
function rollVerbPronoun(el,target){
 if(!el||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 const delays=[40,40,45,45,50,55,60,70,80,95,110,130,155,185,220],others=PRONOUNS.filter(p=>p!==target);let last=target,step=0;
 const card=el.closest('.verb-card');el.classList.add('rolling');card?.classList.add('verb-rolling');
 const tick=()=>{
  if(!el.isConnected)return;
  if(step>=delays.length){card?.classList.remove('verb-rolling');el.classList.remove('rolling');el.removeAttribute('data-roll');el.classList.add('landed');return;}
  const pool=others.filter(p=>p!==last);last=pool[Math.floor(Math.random()*pool.length)];el.dataset.roll=last;
  setTimeout(tick,delays[step++]);
 };
 tick();
}
function renderVerbSession() {
 if(verbSession?.daily&&!dailySession?.active)verbSession=null;
 stopAudio();renderStats();$('writing-history').hidden=true;$('actions').innerHTML='';$('keyboard-note').hidden=true;
 const card=$('card'),session=verbSession,summary=verbSummary(VERBS,memory.verbProgress);
 card.className='card verb-card';
 if(!session){
  card.className='card verb-card verb-start';
  card.innerHTML=verbStartMarkup(summary);
  card.querySelectorAll('[data-verb-count]').forEach(b=>b.onclick=()=>{verbSession=createVerbSession(Number(b.dataset.verbCount));$('practice-settings').open=false;nextVerbQuestion();});
  return;
 }
 if(!session.current){
  const correct=session.answers.filter(a=>a.correct).length;
  card.innerHTML=`<div class="verb-score" aria-hidden="true"><strong>${correct}</strong><span>/ ${session.answers.length}</span></div><h2 tabindex="-1" id="verb-result-title">Runde geschafft.</h2><p>${correct} von ${session.answers.length} Antworten richtig.</p><p>Schwierige Formen bleiben für kommende Runden vorgemerkt.</p><ol class="verb-results">${session.answers.map(a=>`<li class="${a.correct?'verb-result-ok':'verb-result-miss'}"><span>${a.correct?'✓ Richtig':'Noch üben'}</span><strong lang="fi">${PRONOUNS[a.person]} ${escape(a.verb.forms[a.person])}</strong><small>${escape(a.verb.id)} · ${escape(a.verb.de)}</small>${a.correct?'':`<small>Deine Antwort: <span lang="fi">${escape(a.answer)}</span></small>`}</li>`).join('')}</ol>`;
  $('actions').innerHTML='<button type="button" class="primary" id="verb-again">Neue Runde</button>';
  $('verb-again').onclick=()=>{verbSession=null;mode='new';render();};return;
 }
 const {verb,person}=session.current;
 card.innerHTML=`<div class="card-top"><span class="card-label">Verbformen${session.daily?(session.dailyCard.dailyVerb.isNew&&!session.dailyCard.retry?' · <span class="verb-new-tag">Neu</span>':' · Wiederholen'):''}</span>${session.daily?'':`<span>${session.checked?session.answers.length:session.answers.length+1} von ${session.count}</span>`}</div><p class="verb-hint">Welche Form? · Präsens</p><div class="verb-prompt"><h2 class="verb-question" lang="fi"><span class="verb-pronoun">${PRONOUNS[person]}</span><span class="verb-sep"> · </span><span class="verb-infinitive">${escape(verb.id)}</span> <span class="verb-meaning-inline" lang="de"><span class="verb-paren">(</span>${escape(verb.de)}<span class="verb-paren">)</span></span></h2></div><form id="verb-form" ${session.checked?'hidden':''}><label for="verb-input">Deine Verbform</label><input id="verb-input" lang="fi" maxlength="100" spellcheck="false" autocomplete="off" autocorrect="off" autocapitalize="off" aria-describedby="verb-input-hint" placeholder="Deine Antwort …" ${session.checked?'readonly':''} value="${escape(session.draft)}"><p class="verb-hint" id="verb-input-hint">${verb.impersonal?'Unpersönliches Verb: Die Person steht im Genitiv, das Verb selbst ändert sich nicht.':person===2||person===5?`Schreibe „${PRONOUNS[person]}“ zusammen mit der Verbform. Das Pronomen ist hier erforderlich.`:`Nur die Verbform oder mit „${PRONOUNS[person]}“.`} Achte auf ä, ö und doppelte Buchstaben.</p>${session.checked?'':`<div class="letter-buttons"><button type="button" data-verb-letter="ä" aria-label="ä einfügen">ä</button><button type="button" data-verb-letter="ö" aria-label="ö einfügen">ö</button></div><button class="primary" type="submit">Lösung prüfen</button>`}</form>${session.checked?`<div class="verb-solution-card ${session.correct?'correct':'incorrect'}"><div class="verb-feedback ${session.correct?'verb-correct':'verb-wrong'}" role="status">${session.correct?'Richtig!':`Noch nicht richtig. Die Lösung ist <strong lang="fi">${!verb.impersonal&&(person===2||person===5)?PRONOUNS[person]+' ':''}${escape(verb.forms[person])}</strong>.`}</div><div class="verb-answer-summary"><span>Deine Verbform</span><strong lang="fi">${escape(session.draft)}</strong></div><table class="verb-forms"><caption>Alle sechs Formen von <span lang="fi">${escape(verb.id)}</span><span class="verb-forms-legend" aria-hidden="true"><span>Einzahl</span><span>Mehrzahl</span></span></caption><thead><tr><th scope="col">Personalpronomen</th><th scope="col">Präsens</th></tr></thead><tbody>${PRONOUNS.map((p,i)=>`<tr class="${i===person?'verb-target':''}"><th scope="row" lang="fi">${p}</th><td lang="fi">${verbFormMarkup(verb.forms[i],i,verb)}</td></tr>`).join('')}</tbody></table>${verbUsageMarkup(verb)}</div>`:''}`;
 if(!session.checked&&session.rolledFor!==session.answers.length){session.rolledFor=session.answers.length;rollVerbPronoun(card.querySelector('.verb-pronoun'),PRONOUNS[person]);}
 const input=$('verb-input');input.oninput=()=>{if(!session.checked)session.draft=input.value;};
 // Neue Frage: direkt lostippen können – auch wenn davor eine Satzkarte war oder die Runde gerade startet.
 if(!session.checked&&session.focusedFor!==session.answers.length){session.focusedFor=session.answers.length;requestAnimationFrame(()=>{const el=document.activeElement;if(input.isConnected&&!(el&&el!==input&&el.isConnected&&['INPUT','TEXTAREA','SELECT'].includes(el.tagName)))focusVerbView(input);});}
 $('verb-form').onsubmit=e=>{e.preventDefault();submitVerbAnswer();};
 card.querySelectorAll('[data-verb-letter]').forEach(b=>b.onclick=()=>{if(input.value.length>=100)return;input.setRangeText(b.dataset.verbLetter,input.selectionStart,input.selectionEnd,'end');session.draft=input.value;input.focus();});
 if(session.daily){
  $('actions').innerHTML=session.checked?'<button type="button" class="primary" id="verb-next">Weiter</button>':'';
  if(session.checked)$('verb-next').onclick=()=>{if(session===verbSession&&session.checked)nextDailyCard();};
  return;
 }
 $('actions').innerHTML=`${session.checked?`<button type="button" class="primary" id="verb-next">${session.answers.length===session.count?'Auswertung':'Weiter'}</button>`:''}<button type="button" class="quiet" id="verb-abort">Runde beenden</button>`;
 if(session.checked)$('verb-next').onclick=()=>{if(session!==verbSession||!session.checked)return;if(session.answers.length>=session.count){session.current=null;render();focusVerbView($('verb-result-title'));}else nextVerbQuestion();};
 $('verb-abort').onclick=()=>{verbSession=null;render();};
}

function renderSearchCard(s){
 $('keyboard-note').hidden=true;$('card').className='card search-card';
 if(!searchPuzzle)searchPuzzle=createSearch(s,searchDifficulty);
 $('session-title').textContent=`Level ${level} · Wortsel · Deutsch → Finnisch`;
 $('card').innerHTML=`<div class="card-top"><span class="card-label">Wortsel · ${searchDifficulty==='hard'?'Schwer':'Leicht'}</span></div><p class="search-instructions">${escape(searchInstructions(searchPuzzle))}</p>${revealed?`<p class="sentence" lang="de">${escape(s.translations[0].text)}${sourceIcon(s.translations[0])}</p><div class="search-solution"><h2 tabindex="-1" id="search-finished">Alle Wörter gefunden!</h2><span class="card-label">Der finnische Satz</span><p lang="fi" class="sentence">${escape(s.text)}${sourceIcon(s)}</p></div>${audioMarkup(s)}${grammarMarkup(s)}<details class="sources"><summary>Quellen</summary><p>Finnisch: ${source(s)}</p><p>Deutsch: ${source(s.translations[0])}</p></details>`:'<div id="search-puzzle"></div>'}<button type="button" id="report-error" class="report-error">Fehler melden</button>`;
 $('report-error').onclick=()=>openReport(s);
 if(!revealed){
  mountSearch($('search-puzzle'),searchPuzzle,()=>{revealed=true;render();$('search-finished').focus({preventScroll:true});},s.translations[0].text);
  document.querySelectorAll('[data-search-inline-difficulty]').forEach(b=>{const selected=b.dataset.searchInlineDifficulty===searchDifficulty;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));b.onclick=()=>{const next=b.dataset.searchInlineDifficulty;if(next===searchDifficulty)return;searchDifficulty=next;searchPuzzle=null;persist();render();};});
  const inlineNote=document.querySelector('.search-inline-note');if(inlineNote)inlineNote.textContent=searchDifficulty==='hard'?'Auch diagonal und rückwärts':'Nur nach rechts und unten';
  $('actions').innerHTML='<button type="button" class="quiet" id="search-skip">Satz überspringen</button>';$('search-skip').onclick=()=>{queue.shift();searchPuzzle=null;playedAudioCard=null;render();};
 }
 else{$('actions').innerHTML='<button class="grade" id="grade-again" data-grade="again">Nochmal<span>Jetzt gleich wiederholen</span></button><button class="grade" data-grade="hard">Schwer<span>Morgen wiederholen</span></button><button class="grade easy" data-grade="easy">Leicht<span>In '+easyDays(s)+' Tagen wiederholen</span></button>';document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(b.dataset.grade));if($('play-audio')){$('play-audio').onclick=()=>play(s);bindSpeedOptions();}}
}

function renderEndingsSession(){
 stopAudio();renderStats();$('writing-history').hidden=true;$('keyboard-note').hidden=true;
 if(endingsDaily&&!dailySession?.active)endingsDaily=null;
 if(endingsDaily){
  const state=endingsDaily,isNew=state.card.dailyEnding.isNew&&!state.card.retry;
  renderEndings({card:$('card'),actions:$('actions'),notice:$('notice'),level,difficulty,state,
   daily:{tag:isNew?' · <span class="verb-new-tag">Neu</span>':' · Wiederholen',onNext:()=>{if(endingsDaily===state)nextDailyCard();}},
   rerender:()=>{if(activity==='endings'&&endingsDaily===state)render();},
   onAnswer:(correct,item)=>saveEndingAnswer(item,correct)});
  return;
 }
 if(endingsState.level!==level){endingsState.level=level;endingsState.items=null;endingsState.session=null;}
 if(!endingsState.items&&!endingsState.loading){
  endingsState.loading=true;
  loadLexicon().then(lexicon=>{const all=[...data,...archived];endingsState.index=indexLexicon(lexicon,all);endingsState.items=buildEndingItems(lexicon,data,endingsState.level);endingsState.missed=new Set([...endingsState.missed,...missedEndings(memory.endingsProgress)]);}).catch(()=>{$('notice').textContent='Die Wortdaten konnten nicht geladen werden. Prüfe deine Verbindung.';}).finally(()=>{endingsState.loading=false;if(activity==='endings')render();});
 }
 renderEndings({card:$('card'),actions:$('actions'),notice:$('notice'),level,difficulty,state:endingsState,rerender:()=>{if(activity==='endings')render();},onAnswer:(correct,item)=>{if(item)saveEndingAnswer(item,correct);else{memory.daily[day()]=(Number(memory.daily[day()])||0)+1;persist();}}});
}
function ensureDialogs(){
 if(dialogState.dialogs||dialogState.loading)return Promise.resolve();
 dialogState.loading=true;dialogState.failed=false;
 return loadDialogs().then(list=>{dialogState.dialogs=list;}).catch(()=>{dialogState.failed=true;}).finally(()=>{dialogState.loading=false;if(activity==='dialogs')render();});
}
function openTopicDialog(dialogLevel,topic){
 ensureDialogs().then(()=>{const dialog=dialogForTopic(dialogState.dialogs||[],dialogLevel,topic);if(!dialog)return;guidedNew=false;pathSession=null;activity='dialogs';dialogState.level=level;dialogState.session=createDialogSession(dialog);syncControls();render();showView('practice');});
}
function renderDialogSession(){
 stopAudio();renderStats();$('writing-history').hidden=true;$('keyboard-note').hidden=true;
 if(dialogState.level!==level){dialogState.level=level;if(dialogState.session?.dialog.level!==level)dialogState.session=null;}
 ensureDialogs();
 const topicTitle=id=>(LEVEL_PATHS[level]||LEVEL_PATHS[1]).find(t=>t.id===id)?.title||'';
 renderDialogs({card:$('card'),actions:$('actions'),notice:$('notice'),level,state:dialogState,topicTitle,rerender:()=>{if(activity==='dialogs')render();},onLine:()=>{memory.daily[day()]=(Number(memory.daily[day()])||0)+1;persist();}});
}
// Lernpfad: jeder neue Satz in drei Schritten – 1 Lesen, 2 Satz bauen, 3 Wort merken (wie die Satzkarte der Startseite).
// Schritt 2 ist die bisherige Wortübung; bewertet wird erst nach Schritt 3. Wiederholungen bleiben einschrittig.
let cycleStep=0,cycleFlipped=false,cycleAnimate=false;const cycleDone=new Set(),cycleWords=new Set();
const CYCLE_STEPS=['Lesen','Satz bauen','Wort merken'];
// Etappentitel enthalten das Thema meist schon („Begrüßung und Grundlagen · Teil 1“) – dann nicht doppelt nennen.
function pathLabel(topic,lesson){return lesson.title.startsWith(topic.title)?lesson.title:`${topic.title} · ${lesson.title}`;}
function inCycle(s){return !!s&&guidedNew&&activity==='translate'&&!cycleDone.has(s.id);}
function resetCycle(){cycleStep=0;cycleFlipped=false;cycleAnimate=false;cycleDone.clear();cycleWords.clear();}
function cycleStepsMarkup(){return `<ol class="guest-steps cycle-steps" aria-label="Schritte">${CYCLE_STEPS.map((label,i)=>`<li class="${i===cycleStep?'current':i<cycleStep?'done':''}" ${i===cycleStep?'aria-current="step"':''}><span aria-hidden="true">${i+1}</span>${label}</li>`).join('')}</ol>`;}
function favoriteMarkup(s){const saved=memory.favorites.includes(s.id);return `<button class="favorite ${saved?'saved':''}" id="favorite" aria-label="${saved?'Aus Favoriten entfernen':'Als Favorit speichern'}" aria-pressed="${saved}">${saved?'★':'☆'}</button>`;}
function bindFavorite(s){const b=$('favorite');if(!b)return;b.onclick=()=>{const i=memory.favorites.indexOf(s.id);if(i<0)memory.favorites.push(s.id);else memory.favorites.splice(i,1);persist();renderStats();const active=memory.favorites.includes(s.id);b.classList.toggle('saved',active);b.textContent=active?'★':'☆';b.setAttribute('aria-pressed',active);b.setAttribute('aria-label',active?'Aus Favoriten entfernen':'Als Favorit speichern');guestSaveHint();};}
function cycleStage(inner){return `<div class="guest-stage cycle-stage">${inner}</div>`;}
// Schrittwechsel wie auf der Satzkarte: Inhalt gleitet nach links hinaus, der neue kommt von rechts (drei Tempi).
function cycleGo(change,renderAfter=true){
 const card=$('card');
 const reduce=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!card||reduce||typeof card.classList?.add!=='function'){cycleAnimate=false;change();if(renderAfter)render();return;}
 if(card.classList.contains('cycle-leaving'))return;
 card.style.setProperty('--travel',`${Math.max(card.offsetWidth,320)+80}px`);
 card.classList.add('cycle-leaving');
 setTimeout(()=>{card.classList.remove('cycle-leaving');cycleAnimate=true;change();if(renderAfter)render();},640);
}
function cycleEnter(){
 if(!cycleAnimate)return;cycleAnimate=false;
 const card=$('card');if(!card||typeof card.classList?.add!=='function')return;
 card.classList.add('cycle-entering');setTimeout(()=>card.classList.remove('cycle-entering'),900);
}
function renderCycle(s){
 const infos=lookupForSentence(s.text);
 if(!infos){loadLexicon().then(()=>{if(queue[0]===s&&cycleStep!==1)render();}).catch(()=>{cycleDone.add(s.id);render();});$('card').className='card cycle-card';$('card').innerHTML=`<div class="card-top"><span class="card-label">Finnisch <span>·</span> Level ${s.level}</span>${cycleStepsMarkup()}</div><p class="sentence" lang="fi">${escape(s.text)}</p>`;return true;}
 $('card').className='card cycle-card';$('card').style.setProperty('--travel',`${Math.max($('card').offsetWidth,320)+80}px`);
 const top=`<div class="card-top"><span class="card-label">Finnisch <span>·</span> Level ${s.level}${s.level_assessment?.status==='estimated'?' · geschätzt':''}</span>${cycleStepsMarkup()}${favoriteMarkup(s)}</div>`;
 if(cycleStep===0){
  const long=sentenceWords(s.text).length>7,cols=[];
  for(const p of splitSentence(s.text)){
   if(p.index!==undefined)cols.push({fi:escape(p.text),gloss:shortGloss(infos[p.index])});
   else if(p.text.trim()&&cols.length)cols[cols.length-1].fi+=escape(p.text);
   else if(p.text.trim())cols.push({fi:escape(p.text),gloss:''});
  }
  if(cols.length)cols[cols.length-1].fi+=sourceIcon(s);
  const tag=long?'button type="button"':'span',end=long?'button':'span';
  const words=cols.map(c=>`<${tag} class="guest-word cycle-word"><span class="guest-fi guest-l1">${c.fi}</span><span class="guest-gloss guest-l2" lang="de">${escape(c.gloss)}</span></${end}>`).join('');
  $('card').innerHTML=top+cycleStage(`<div class="guest-words cycle-words ${long?'gloss-on-tap':''}" lang="fi">${words}</div>${long?'<button type="button" class="link-button cycle-gloss-all" id="cycle-gloss-all">Alle Bedeutungen zeigen</button>':''}<p class="guest-translation guest-l3" lang="de">${escape(s.translations[0].text)}${sourceIcon(s.translations[0])}</p>`)+audioMarkup(s);
  if(long){$('card').querySelectorAll('.cycle-word').forEach(b=>b.onclick=e=>{if(e.target.closest('.sentence-source-icon'))return;b.classList.toggle('show');});$('cycle-gloss-all').onclick=()=>{const box=$('card').querySelector('.cycle-words');const on=!box.classList.contains('all');box.classList.toggle('all',on);$('cycle-gloss-all').textContent=on?'Bedeutungen ausblenden':'Alle Bedeutungen zeigen';};}
  $('actions').innerHTML='<button class="primary" id="cycle-next">Weiter: Satz bauen →</button>';
  $('cycle-next').onclick=()=>cycleGo(()=>{cycleStep=1;});
 }else{
  const i=flipWordIndex(infos,cycleWords),info=infos[i],word=sentenceWords(s.text)[i];
  const context=splitSentence(s.text).map(p=>p.index===i?`<mark>${escape(p.text)}</mark>`:escape(p.text)).join('');
  const note=cycleFlipped?`Grundform <b lang="fi">${escape(info.lemma)}</b> · ${escape(info.meaning)}`:'Weißt du, was das Wort heißt? Tippe auf die Karte, um sie umzudrehen.';
  $('card').innerHTML=top+cycleStage(`<p class="guest-context guest-l1" lang="fi">${context}</p><div class="guest-flip-wrap guest-l2"><button type="button" id="cycle-flip" class="guest-flip" aria-pressed="${cycleFlipped}" aria-label="${escape(word)} – Karte umdrehen"><span class="guest-flip-inner"><span class="guest-face guest-front" lang="fi">${escape(word)}</span><span class="guest-face guest-back" lang="de">${escape(shortGloss(info))}</span></span></button></div><p class="guest-flip-note guest-l3">${note}</p>`);
  const flip=()=>{cycleFlipped=!cycleFlipped;cycleWords.add(info.lemma);const b=$('cycle-flip');b.setAttribute('aria-pressed',String(cycleFlipped));$('card').querySelector('.guest-flip-note').innerHTML=cycleFlipped?`Grundform <b lang="fi">${escape(info.lemma)}</b> · ${escape(info.meaning)}`:'Weißt du, was das Wort heißt? Tippe auf die Karte, um sie umzudrehen.';cycleGrades(s);};
  $('cycle-flip').onclick=flip;cycleGrades(s);
 }
 bindFavorite(s);cycleEnter();
 if($('play-audio')){$('play-audio').onclick=()=>play(s);bindSpeedOptions();}
 return true;
}
function cycleGrades(s){
 if(!cycleFlipped){$('actions').innerHTML='<button class="primary" id="cycle-flip-button">Umdrehen</button>';$('cycle-flip-button').onclick=()=>$('cycle-flip').click();return;}
 $('actions').innerHTML='<div class="inline-grades cycle-grades"><button class="grade" id="grade-again" data-grade="again">Nochmal<span>Jetzt gleich wiederholen</span></button><button class="grade" data-grade="hard">Schwer<span>Morgen wiederholen</span></button><button class="grade easy" data-grade="easy">Leicht<span>In '+easyDays(s)+' Tagen wiederholen</span></button></div>';
 document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>cycleGo(()=>grade(b.dataset.grade),false));
}
function render(){applyDailyCard();$('practice-view').classList?.toggle('is-path',['translate','listen','dictation','grammar'].includes(activity));if(dailySession?.active&&!queue.length&&['verbs','endings'].includes(activity))activity='translate';if(activity==='verbs'){renderVerbSession();return;}if(activity==='endings'){renderEndingsSession();return;}if(activity==='dialogs'){renderDialogSession();return;}if(activity==='writing'){renderWritingSession();return;}$('writing-history').hidden=true;stopAudio();renderStats();preloadQueueAudio();const s=queue[0];$('actions').innerHTML='';$('keyboard-note').hidden=!s;$('keyboard-note').textContent=isTranslation()?'Nach dem Vergleich: 1 / 2 / 3 zum Bewerten':'Aufnahme beliebig oft anhören · Nach dem Aufdecken: 1 / 2 / 3 zum Bewerten';
 if(!s&&guidedNew&&pathSession&&initialCount){
  const state=pathState(),topic=state.topics.find(t=>t.id===pathSession.topic.id);
  const title=state.complete?`Lernpfad für Level ${level} geschafft!`:topic.complete?`${topic.title} geschafft!`:'Etappe geschafft!';
  $('card').className='card empty';
  $('card').innerHTML=`<span class="complete-mark">✓</span><h2>${escape(title)}</h2><p>${topic.seen} von ${topic.total} Sätzen in diesem Thema kennengelernt.</p><p>${state.lesson?`Als Nächstes: ${escape(pathLabel(state.topic,state.lesson))}.`:'Du hast alle verfügbaren Themen dieses Levels kennengelernt.'}</p><p>Festige das Gelernte später mit „Wiederholen“.</p>`;
  const topicDialog=topic.complete&&level<=6;$('actions').innerHTML=`<div class="completion-actions"><button class="primary completion-home" id="completion-home">Zur Startseite</button>${topicDialog?'<button class="primary" id="topic-dialog">Dialog zum Thema lesen</button>':''}${state.lesson?.remaining.length?'<button class="primary" id="next-session">Weiter auf dem Lernpfad</button>':''}</div>`;if(topicDialog){const topicId=topic.id;$('topic-dialog').onclick=()=>openTopicDialog(level,topicId);}
  $('completion-home').onclick=()=>showView('home');if(state.lesson?.remaining.length)$('next-session').onclick=startNewSentences;return;
 }
 if(!s){$('card').className='card empty';if(dailySession?.active&&initialCount){const mix=dailySession.mix;$('card').innerHTML=`<span class="complete-mark">✓</span><h2>Heutige Runde geschafft.</h2><p>${completed} Aufgaben erledigt · ${[[mix.translate,'Übersetzen'],[mix.listen,'Hören'],[mix.dictation,'Diktat'],[mix.suchsel,'Wortsel'],[mix.verbs,'Verbformen'],[mix.endings,'Endungen']].filter(([n])=>n).map(([n,l])=>n+' '+l).join(' · ')}</p><p>${dailyFinishNote(mix)}</p>`;$('actions').innerHTML='<button class="primary" id="finish-daily-session">Zur Startseite</button>';$('finish-daily-session').onclick=finishDailySession;}else if(initialCount){$('card').innerHTML='<span class="complete-mark">✓</span><h2>Gut gemacht.</h2><p>Deine Lerneinheit ist geschafft. Dein nächster Satz wartet schon.</p>';$('actions').innerHTML='<div class="completion-actions"><button class="primary completion-home" id="completion-home">Zur Startseite</button><button class="primary" id="next-session">Nächste Lerneinheit</button></div>';$('completion-home').onclick=()=>showView('home');$('next-session').onclick=guidedNew?startNewSentences:start;}else{let title='Alles für heute wiederholt.',text='Hier erscheinen die Sätze, sobald deine nächste Wiederholung fällig ist.';if(mode==='new'){title='In diesem Level ist alles entdeckt.';text='Wiederhole deine Sätze oder wechsle zum nächsten Level.';}if(mode==='favorites'){title='Deine Lieblingssätze warten hier.';text='Markiere einen Satz mit dem Stern auf der Lernkarte.';}if((audioOnly||!isTranslation())&&!base(mode!=='new').length){title='Hier gibt es noch keine Aufnahme.';text=isTranslation()?'Schalte „Nur mit Audio“ aus oder wähle ein anderes Level.':'Wähle ein anderes Level oder die Übungsart Übersetzen.';}if(activity==='grammar'){title=grammarAvailable?'Keine passenden Sätze in dieser Auswahl.':'Grammatikhilfen nicht verfügbar.';text=grammarAvailable?'Wähle ein anderes Grammatikthema oder Level. Falls aktiv, schalte „Nur mit Audio“ aus.':'Lade die Seite bei bestehender Verbindung neu.';}$('card').innerHTML=`<h2>${title}</h2><p>${text}</p>`;}return;}
 if(activity==='suchsel'){renderSearchCard(s);return;}
 if(inCycle(s)&&cycleStep!==1&&renderCycle(s))return;
 $('card').className=`card${revealed?' revealed':''}`;const saved=memory.favorites.includes(s.id),front=!isTranslation()?(revealed?s.text:''):cardDirection(s)==='fi-de'?s.text:s.translations[0].text;
 $('card').innerHTML=`<div class="card-top"><span class="card-label">${!isTranslation()?(activity==='listen'?'Hörmodus':'Diktat'):cardDirection(s)==='fi-de'?'Finnisch':'Deutsch'} <span>·</span> Level ${s.level}${s.level_assessment?.status==='estimated'?' · geschätzt':''}</span><button class="favorite ${saved?'saved':''}" id="favorite" aria-label="${saved?'Aus Favoriten entfernen':'Als Favorit speichern'}" aria-pressed="${saved}">${saved?'★':'☆'}</button></div>${questionMarkup(s,front)}${audioMarkup(s)}${dictationMarkup(s)}${translationDraftMarkup(s)}${revealed?`<div class="translation ${activity==='translate'&&!isWordPractice()?'hard-translation-solution':activity==='listen'?'listening-solution-card':''}" ${isWordPractice()||activity==='dictation'||flipReveal(s)?'hidden':''}><span class="card-label" style="justify-content:center">${isTranslation()?'Vorlage · ':''}${!isTranslation()||cardDirection(s)==='fi-de'?'Deutsch':'Finnisch'}</span>${!isTranslation()||cardDirection(s)==='fi-de'?s.translations.map((t,i)=>`<p lang="de" class="${i?'variant':''}">${escape(t.text)}${sourceIcon(t)}</p>${i===0?translationProvenanceBadge(t):''}`).join(''):`<p lang="fi">${escape(s.text)}${sourceIcon(s)}</p>`}</div><div id="inline-grades" class="actions inline-grades" aria-label="Antwort bewerten"></div>${grammarMarkup(s)}${translationNote(s)?`<p class="bridge-note">${escape(translationNote(s))}</p>`:''}<details class="sources"><summary>Quellen &amp; Aufnahmen</summary><p>Finnisch: ${source(s)}</p>${s.translations.map(t=>`<p>Deutsch: ${source(t)}</p>`).join('')}${s.audios.map(a=>`<p>Aufnahme: <a href="${safeURL(a.attribution_url||`https://tatoeba.org/en/user/profile/${encodeURIComponent(a.author)}`)}" target="_blank" rel="noopener">${escape(a.author)}</a> · <a href="${safeURL(licenseURL(a.license))}" target="_blank" rel="noopener">${escape(a.license)}</a></p>`).join('')}</details>`:''}`;bindSentenceFlip();
 if(inCycle(s)){$('card').querySelector('.card-top .favorite')?.insertAdjacentHTML('beforebegin',cycleStepsMarkup());$('card').classList.add('cycle-card');cycleEnter();}
 if(revealed){
  $('card').insertAdjacentHTML('beforeend',`<button id="report-error" class="report-error">${Object.values(memory.reports).some(r=>r.sentenceId===s.id)?'Hinweis bearbeiten':'Fehler melden'}</button>`);
  $('report-error').onclick=()=>openReport(s);
 }
 $('favorite').onclick=()=>{const i=memory.favorites.indexOf(s.id);if(i<0)memory.favorites.push(s.id);else memory.favorites.splice(i,1);persist();renderStats();const b=$('favorite'),active=memory.favorites.includes(s.id);b.classList.toggle('saved',active);b.textContent=active?'★':'☆';b.setAttribute('aria-pressed',active);b.setAttribute('aria-label',active?'Aus Favoriten entfernen':'Als Favorit speichern');guestSaveHint();};
 if($('play-audio')){$('play-audio').onclick=()=>play(s);bindSpeedOptions();}
 const inputId=activity==='dictation'?'dictation-input':isTranslation()&&!isWordPractice()&&cardDirection(s)==='de-fi'?'translation-input':null;
 if(inputId&&!revealed){const input=$(inputId);input.value=draft;input.oninput=e=>{draft=e.target.value;$('notice').textContent='';};document.querySelectorAll('[data-letter]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const pos=input.selectionStart,limit=activity==='dictation'?500:2000;if(input.value.length-(input.selectionEnd-pos)>=limit)return;input.setRangeText(b.dataset.letter,pos,input.selectionEnd,'end');draft=input.value;input.focus();};});}
 if(isWordPractice())bindWordPractice();
 if(!revealed){$('actions').innerHTML='<button class="primary" id="reveal">'+(isWordPractice()?'Prüfen':activity==='dictation'?'Diktat vergleichen':activity==='listen'?'Satz & Übersetzung aufdecken':'Übersetzung anzeigen')+'</button>';$('reveal').onclick=()=>{if(isWordPractice()){if(!wordExercise.selected.length){$('notice').textContent='Wähle zuerst Wörter für deinen Satz aus.';return;}draft=wordExercise.selected.map(id=>wordExercise.tokens.find(t=>t.id===id).text).join(' ');}if(activity==='dictation'&&!draft.trim()){$('notice').textContent='Schreibe zuerst auf, was du gehört hast.';$(inputId).focus();return;}$('notice').textContent='';revealed=true;render();($('grade-again')||$('cycle-next'))?.focus({preventScroll:true});};}
 else if(inCycle(s)){const target=$('inline-grades')||$('actions');target.innerHTML='<button class="primary cycle-next" id="cycle-next">Weiter: Wort merken →</button>';$('cycle-next').onclick=()=>cycleGo(()=>{cycleStep=2;cycleFlipped=false;});}
 else{const gradeTarget=$('inline-grades')||$('actions');gradeTarget.innerHTML='<button class="grade" id="grade-again" data-grade="again">Nochmal<span>Jetzt gleich wiederholen</span></button><button class="grade" data-grade="hard">Schwer<span>Morgen wiederholen</span></button><button class="grade easy" data-grade="easy">Leicht<span>In '+easyDays(s)+' Tagen wiederholen</span></button>';document.querySelectorAll('[data-grade]').forEach(b=>b.onclick=()=>grade(b.dataset.grade));}
}
function licenseURL(license){if(license==='CC0 1.0')return 'https://creativecommons.org/publicdomain/zero/1.0/';const m=license.match(/^CC (BY(?:-[A-Z]+)*) ([\d.]+)(?: (FR))?$/i);return m?`https://creativecommons.org/licenses/${m[1].toLowerCase()}/${m[2]}/${m[3]?'fr/':''}`:'https://tatoeba.org/en/terms_of_use';}
function easyDays(s){return Math.min(180,Math.max(3,Math.round((Number(review(s)?.interval)||0)*2.5)));}
function grade(g){if(activity==='writing')return;if(!revealed||!queue.length)return;if(inCycle(queue[0])&&!(cycleStep===2&&cycleFlipped))return;if(inCycle(queue[0])){cycleDone.add(queue[0].id);cycleStep=0;cycleFlipped=false;}const s=queue.shift(),interval=g==='again'?0:g==='hard'?1:easyDays(s),now=Date.now();memory.performanceEvents=addPerformanceEvent(memory.performanceEvents,{kind:'sentence',sentenceId:s.id,activity,direction:cardDirection(s),difficulty,grade:g,grammarTopic:activity==='grammar'?grammarTopic:'',at:now});memory.reviews[key(s)]={due:now+interval*86400000,interval,repetitions:(Number(review(s)?.repetitions)||0)+1,updatedAt:now};memory.daily[day()]=(Number(memory.daily[day()])||0)+1;if(dailySession?.active&&activity==='translate'&&!s.translationCounted){reviewTranslationCount++;s.translationCounted=true;}if(g==='again')queue.splice(Math.min(2,queue.length),0,s);completed++;wordExercise=null;searchPuzzle=null;revealed=false;playedAudioCard=null;draft='';persist();render();guestSaveHint();$('reveal')?.focus({preventScroll:true});}
async function play(s){const a=s.audios[0],b=$('play-audio');if(player&&!player.paused){stopAudio();return;}stopAudio();const current=prepareAudio(audioURL(a));if(!current)return;player=current;current.currentTime=0;current.playbackRate=speed;current.preservesPitch=true;setAudioButtonLabel(b,current.readyState>=3?'Startet …':'Lädt …');const reset=()=>{if(player===current&&$('play-audio')===b)setAudioButtonLabel(b,restingAudioLabel(b));};current.onended=reset;current.onerror=()=>{if(player!==current)return;audioCache.delete(audioURL(a));reset();$('notice').textContent='Die Aufnahme ist gerade nicht erreichbar. Prüfe deine Internetverbindung.';};try{await current.play();if(player===current){playedAudioCard=s;b.dataset.played='true';setAudioButtonLabel(b,'Anhalten');}}catch{if(player!==current)return;audioCache.delete(audioURL(a));reset();$('notice').textContent='Die Aufnahme konnte nicht abgespielt werden. Versuche es gleich noch einmal.';}}
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
 objectRecord(input);if(input.format!=='suomi-backup'||input.version!==1)throw new Error('Das ist keine unterstützte Vanamo-Sicherung. Bitte wähle eine Datei aus „Sicherung herunterladen“.');
 const m=objectRecord(input.learning),out={reviews:{},favorites:[],daily:{},prefs:{},reports:{},writingRatings:{},performanceEvents:[]};
 const reviews=Object.entries(objectRecord(m.reviews));if(reviews.length>100000)throw new Error('Die Sicherung enthält zu viele Bewertungen.');
 for(const [k,r] of reviews){objectRecord(r);if(!/^[1-9]\d{0,15}:(fi-de|de-fi|listen|dictation|suchsel)$/.test(k)||!validInt(Number(k.split(':')[0]))||!validInt(r.due,8640000000000000)||!validInt(r.interval,180)||!validInt(r.repetitions,10000000)||(r.updatedAt!==undefined&&!validInt(r.updatedAt,8640000000000000)))throw new Error('Die Sicherung enthält eine ungültige Bewertung.');out.reviews[k]={due:r.due,interval:r.interval,repetitions:r.repetitions,...(r.updatedAt===undefined?{}:{updatedAt:r.updatedAt})};}
 if(!Array.isArray(m.favorites)||m.favorites.length>100000||m.favorites.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('Ungültige Favoriten.');out.favorites=[...new Set(m.favorites)];
 const daily=Object.entries(objectRecord(m.daily));if(daily.length>50000)throw new Error('Zu viele Tageswerte.');for(const [date,n] of daily){if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date||!validInt(n,10000000))throw new Error('Ungültiger Tagesfortschritt.');out.daily[date]=n;}
 const p=objectRecord(m.prefs);if(!Number.isInteger(p.level)||p.level<1||p.level>1000||!['fi-de','de-fi','random'].includes(p.direction)||typeof p.audioOnly!=='boolean'||!['translate','listen','dictation','writing','grammar','verbs','suchsel','endings','dialogs'].includes(p.activity)||![.5,.75,1].includes(p.speed))throw new Error('Ungültige Lerneinstellungen.');out.prefs={searchDifficulty:p.searchDifficulty==='hard'?'hard':'easy',difficulty:p.difficulty==='easy'?'easy':'hard',level:p.level,direction:p.direction,audioOnly:p.audioOnly,activity:p.activity,speed:p.speed,grammarTopic:GRAMMAR_TOPICS.some(t=>t.id===p.grammarTopic)?p.grammarTopic:'negation',dailyGoal:GOAL_CHOICES.includes(p.dailyGoal)?p.dailyGoal:DAILY_GOAL};out.reports=validateReports(m.reports||{});out.writingRatings=validateWritingRatings(m.writingRatings||{});out.verbProgress=validateVerbProgress(m.verbProgress||{});out.endingsProgress=validateEndingsProgress(m.endingsProgress||{});out.performanceEvents=validatePerformanceEvents(m.performanceEvents||[]);return out;
}
function mergeLearning(current,incoming){
 const out={reviews:{...current.reviews},favorites:[...new Set([...current.favorites,...incoming.favorites])],daily:{...current.daily},prefs:{...incoming.prefs},reports:{...current.reports},writingRatings:{...current.writingRatings},verbProgress:mergeVerbProgress(current.verbProgress,incoming.verbProgress),endingsProgress:mergeEndingsProgress(current.endingsProgress,incoming.endingsProgress),performanceEvents:mergePerformanceEvents(current.performanceEvents||[],incoming.performanceEvents||[]),games:mergeGames(current.games,incoming.games)};
 for(const [k,r] of Object.entries(incoming.reviews)){const old=out.reviews[k];const newer=old&&Number.isFinite(old.updatedAt)&&Number.isFinite(r.updatedAt)?r.updatedAt>old.updatedAt:!old||r.repetitions>old.repetitions||(r.repetitions===old.repetitions&&r.due>old.due);if(!old||newer)out.reviews[k]={...r};}
 for(const [date,n] of Object.entries(incoming.daily))out.daily[date]=Math.max(out.daily[date]||0,n);
 for(const [id,r] of Object.entries(incoming.writingRatings||{}))if(!out.writingRatings[id]||r.updatedAt>out.writingRatings[id].updatedAt)out.writingRatings[id]={...r};
 for(const [id,r] of Object.entries(incoming.reports))if(!out.reports[id]||r.updatedAt>out.reports[id].updatedAt)out.reports[id]={...r};
 return out;
}
function commitLearning(candidate,notify=true){if(accountActive())localStorage.setItem(STORE,JSON.stringify(candidate));else localStorage.removeItem(STORE);memory=candidate;if(notify&&accountActive())window.dispatchEvent(new Event('suomi-learning-changed'));}
function learningSnapshot(){return JSON.parse(JSON.stringify({...memory,prefs:{level,direction,audioOnly,activity,speed,grammarTopic,difficulty,searchDifficulty,dailyGoal}}));}
window.suomiLearningState={snapshot:learningSnapshot,
 // Spiele (games.mjs): Lernstand je Spiel und Wortliste lesen/speichern
 gameProgress:(game,deck)=>JSON.parse(JSON.stringify(memory.games?.[game]?.[deck]||{})),
 saveGameProgress:(game,deck,map)=>{const games=validateGames({...memory.games,[game]:{...(memory.games?.[game]||{}),[deck]:map}});commitLearning({...memory,games});},
 // Klassenräume: vorhandene Sätze einer Aufgabe ins Wiederholen legen, fällig ab sofort.
 // Sätze, die schon fällig sind, bleiben unverändert; unbekannte Sätze werden nur gezählt.
 addReviews:items=>{
  if(!ready||!accountActive())return null;
  const known=new Set([...data,...archived].map(s=>s.id)),reviews={...memory.reviews},now=Date.now();
  let added=0,already=0,missing=0;
  for(const {id,direction:dir} of Array.isArray(items)?items:[]){
   if(!['fi-de','de-fi'].includes(dir)||!known.has(id)){missing++;continue;}
   const k=`${id}:${dir}`,old=reviews[k];
   if(old&&Number.isFinite(old.due)&&old.due<=now){already++;continue;}
   reviews[k]=old?{...old,due:now,updatedAt:now}:{due:now,interval:0,repetitions:1,updatedAt:now};added++;
  }
  if(added){commitLearning({...memory,reviews});renderStats();}
  return {added,already,missing};
 },
 applyCloud:incoming=>{
 let endingsProgress={};try{endingsProgress=validateEndingsProgress(incoming.endingsProgress||{});}catch{}
 const candidate=mergeLearning(memory,{...incoming,prefs:learningSnapshot().prefs,verbProgress:validateVerbProgress(incoming.verbProgress||{}),endingsProgress});
 commitLearning(candidate,false);if(ready)renderStats();return true;
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
$('report-form').onsubmit=async e=>{e.preventDefault();if(!reportSentence)return;const submit=e.submitter||$('report-form').querySelector('[type="submit"]'),category=$('report-category').value;if(!Object.hasOwn(REPORT_CATEGORIES,category))return;const note=$('report-note').value.trim();if(note.length>2000)return;const id=`${reportSentence.id}:${category}`,old=memory.reports[id],now=Math.max(Date.now(),(old?.updatedAt||0)+1);const r={sentenceId:reportSentence.id,category,note,sentenceText:reportSentence.text,translationText:reportSentence.translations.map(t=>t.text).join(' / '),createdAt:old?.createdAt||now,updatedAt:now};
 try{
  commitLearning({...memory,reports:{...memory.reports,[id]:r}});if($('report-error'))$('report-error').textContent='Hinweis bearbeiten';
  if(!accountActive()||typeof window.suomiAccountRequest!=='function'){$('report-status').textContent='Hinweis nur für diese Sitzung vorgemerkt. Melde dich an, damit der Satz zentral geprüft wird.';return;}
  submit.disabled=true;$('report-status').textContent='Hinweis wird eingereicht …';
  const translation=reportSentence.translations[0];
  const response=await window.suomiAccountRequest('/rest/v1/rpc/sentence_quality_api',{method:'POST',body:JSON.stringify({action:'report',payload:{sentence_id:reportSentence.id,translation_id:category==='translation'&&Number.isSafeInteger(Number(translation?.id))?Number(translation.id):null,category,note,sentence_text:reportSentence.text,translation_text:r.translationText,source_kind:qualitySourceKind(category==='translation'?translation:reportSentence),activity}})});
  const value=await response.json().catch(()=>({}));if(!response.ok||value.error)throw new Error(value.error||value.message||'Der Hinweis konnte nicht eingereicht werden.');
  if(value.target==='translation'&&translation?.id)qualityExclusions.translations.add(qualityTranslationKey(Number(reportSentence.id),Number(translation.id)));else qualityExclusions.sentences.add(Number(reportSentence.id));
  data=qualityFilteredCards(data);archived=qualityFilteredCards(archived);renderStats();
  $('report-status').textContent=value.target==='translation'?'Danke. Diese Übersetzung ist für dich ausgeblendet und wird geprüft.':'Danke. Dieser Satz ist für dich ausgeblendet und wird geprüft.';
  submit.disabled=false;
 }catch(err){submit.disabled=false;$('report-status').textContent=`Der Hinweis bleibt in deinem Konto gespeichert, konnte aber noch nicht zentral eingereicht werden: ${err.message}`;}
};
$('export-backup').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um deinen Lernstand dauerhaft zu speichern oder zu exportieren.';return;}try{downloadJSON(`suomi-sicherung-${day()}.json`,{format:'suomi-backup',version:1,exportedAt:new Date().toISOString(),learning:{...memory,prefs:{level,direction,audioOnly,activity,speed,grammarTopic,difficulty,searchDifficulty,dailyGoal}}});$('backup-status').textContent='Download gestartet. Bewahre die Datei für einen Gerätewechsel auf.';}catch{$('backup-status').textContent='Der Download konnte nicht gestartet werden. Bitte versuche es erneut.';}};
$('export-reports').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um Hinweise dauerhaft zu speichern oder zu exportieren.';return;}try{downloadJSON(`suomi-hinweise-${day()}.json`,{format:'suomi-reports',version:1,exportedAt:new Date().toISOString(),reports:Object.values(memory.reports)});$('backup-status').textContent='Download gestartet. Hänge die Hinweise-Datei hier im Chat an, um die Korrekturen anzustoßen.';}catch{$('backup-status').textContent='Der Download konnte nicht gestartet werden.';}};
$('import-backup').onchange=async e=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um eine Sicherung zu importieren.';e.target.value='';return;}const sequence=++importSequence;pendingBackup=null;$('import-preview').hidden=true;$('backup-status').textContent='';const file=e.target.files?.[0];if(!file)return;try{if(file.size>20*1024*1024)throw new Error('Die Datei ist zu groß. Bitte verwende eine Vanamo-Sicherung bis 20 MB.');const text=await file.text();if(sequence!==importSequence)return;const parsed=JSON.parse(text,(key,value)=>{if(['__proto__','constructor','prototype'].includes(key))throw new Error('Ungültige Datenfelder.');return value;});pendingBackup=validateBackup(parsed);$('import-summary').textContent=`Bereit zum Import: ${Object.keys(pendingBackup.reviews).length} Bewertungen, ${pendingBackup.favorites.length} Favoriten und ${Object.keys(pendingBackup.reports).length} Hinweise. Einstellungen aus der Sicherung werden übernommen; eine neue Lerneinheit beginnt.`;$('import-preview').hidden=false;}catch(err){if(sequence!==importSequence)return;pendingBackup=null;$('backup-status').textContent=err instanceof SyntaxError?'Die Datei enthält keine lesbare Sicherung. Dein Lernstand bleibt erhalten.':`${err.message} Dein Lernstand bleibt erhalten.`;}};
$('cancel-import').onclick=()=>{clearImport();$('backup-status').textContent='Import abgebrochen.';};
$('apply-backup').onclick=()=>{if(!accountActive()){$('backup-status').textContent='Bitte melde dich an, um eine Sicherung zu übernehmen.';return;}if(!pendingBackup||!ready)return;const candidate=mergeLearning(memory,pendingBackup);if(!levels.includes(candidate.prefs.level))candidate.prefs.level=levels[0]||1;try{commitLearning(candidate);}catch{$('backup-status').textContent='Dein Browser konnte die Sicherung nicht speichern. Der bisherige Lernstand bleibt erhalten.';return;}({level,direction,audioOnly,activity,speed,grammarTopic,difficulty,searchDifficulty}=candidate.prefs);clearImport();mode='new';verbSession=null;start();renderReportList();$('backup-status').textContent='Lernstand zusammengeführt. Deine Einstellungen sind übernommen und eine neue Lerneinheit ist bereit.';};

function showView(name,openSettings=false){
 if(name==='home'&&ready)renderDailyPlan();
 if(name==='progress'&&ready)renderStats();
 if(name==='home'&&favoritesRound){activity=favoritesRound.activity;mode=favoritesRound.mode;favoritesRound=null;syncControls();renderStats();}
 if(name==='home'&&dailySession?.active){const previous=dailySession.previous;activity=previous.activity;direction=previous.direction;difficulty=previous.difficulty;mode=previous.mode;syncControls();renderStats();}
 for(const view of ['home','practice','progress','classrooms','games']){const node=$(`${view}-view`);if(node)node.hidden=view!==name;}
 document.querySelectorAll('.header-nav [data-view]').forEach(b=>{const selected=b.dataset.view===name;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 const headerPractice=$('header-practice');headerPractice.classList.toggle('selected',name==='practice');if(name==='practice')headerPractice.setAttribute('aria-current','page');else headerPractice.removeAttribute('aria-current');
 if(name!=='practice')stopAudio();
 if(name==='practice'){applyDailyCard();$('practice-settings').open=openSettings;preloadQueueAudio();}
 window.scrollTo({top:0,behavior:'smooth'});
}
$('continue-practice').onclick=()=>{
 if(!ready)return;
 if(guidedNew){mode='new';start();showView('practice');return;}
 if(dailySession?.active){dailySession=null;mode='new';start();showView('practice');return;}
 if(activity==='verbs'&&verbSession&&!verbSession.current)verbSession=null;
 if(mode!=='new'){mode='new';start();}else if(activity==='verbs')render();
 showView('practice');
};
$('home-review').onclick=()=>{
 if(!ready||$('home-review').disabled)return;
 dailySession=null;guidedNew=false;
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
function startNewSentences(){
 if(!ready)return;
 if(guidedNew&&pathSession?.level===level&&queue.length){showView('practice');render();return;}
 const state=pathState(),pool=state.lesson?.remaining||[];
 if(!pool.length){renderDailyPlan();showView('home');return;}
 pathSession={level,topic:state.topic,lesson:state.lesson};
 dailySession=null;guidedNew=true;activity='translate';direction='fi-de';difficulty='easy';mode='new';resetCycle();
 stopAudio();queue=pool.map(s=>({...s,practiceDirection:'fi-de'}));
 initialCount=queue.length;completed=0;revealed=false;wordExercise=null;searchPuzzle=null;draft='';playedAudioCard=null;
 syncControls();persist();showView('practice');render();
}
$('start-new-sentences').onclick=startNewSentences;
function choosePathLevel(next){
 if(!ready||!levels.includes(next)||next===level)return;
 if(levelLocked(next)){$('path-level').value=String(level);openRegister();return;}
 level=next;pathSession=null;guidedNew=false;dailySession=null;activity='translate';mode='new';
 start();showView('home');
}
$('path-level').onchange=e=>choosePathLevel(Number(e.target.value));
$('path-level-register').onclick=openRegister;
// Abmelden: gesperrtes Level verlassen; An- und Abmelden: Levelauswahl neu zeichnen.
if(typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(typeof syncGuestHome==='function')syncGuestHome();if(!ready)return;syncActivityLocks();if(activityLocked(activity)&&!levelLocked(level)){start();}if(levelLocked(level)){level=levels[0]||1;pathSession=null;guidedNew=false;dailySession=null;start();showView('home');}else{renderLearningPath();renderStats();}}).observe(document.body,{attributes:true,attributeFilter:['data-account']});
$('path-next-level').onclick=()=>choosePathLevel(levels.find(n=>n>level));
$('quick-verb-review').onclick=()=>{if(dailySession)finishDailySession();activity='verbs';syncControls();renderStats();$('continue-practice').click();};
$('start-daily-session').onclick=startDailySession;if($('home-favorites'))$('home-favorites').onclick=startFavorites;
$('header-practice').onclick=startDailySession;
$('home-choose').onclick=()=>{if(dailySession?.active||guidedNew){dailySession=null;mode='new';start();}showView('practice',true);$('practice-settings').querySelector('summary')?.focus();};
document.addEventListener('click',event=>{
 const button=event.target.closest?.('[data-exercise-start]');
 if(!button||accountActive()||guestExerciseAccepted)return;
 event.preventDefault();event.stopImmediatePropagation();pendingGuestStart=button;
 if(!$('guest-start-dialog').open)$('guest-start-dialog').showModal();
},true);
$('guest-continue').onclick=()=>{
 guestExerciseAccepted=true;try{sessionStorage.setItem('suomi-guest-exercise-accepted','1');}catch{}
 const button=pendingGuestStart;pendingGuestStart=null;$('guest-start-dialog').close();button?.click();
};
$('close-guest-start').onclick=()=>{$('guest-start-dialog').close();};
$('guest-start-dialog').addEventListener('close',()=>{pendingGuestStart=null;});
document.querySelectorAll('[data-guest-account]').forEach(button=>button.onclick=()=>{
 pendingGuestStart=null;$('guest-start-dialog').close();
 if(window.suomiOpenAccount)window.suomiOpenAccount(button.dataset.guestAccount);
 else{$('account-button')?.click();setTimeout(()=>document.querySelector(`[data-account-tab="${button.dataset.guestAccount}"]`)?.click(),0);}
});
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>showView(b.dataset.view));
window.addEventListener('vanamo:view',e=>showView(e.detail));
document.querySelectorAll('[data-home-activity]').forEach(b=>b.onclick=()=>{if(activityLocked(b.dataset.homeActivity)){openRegister();return;}if(!ready||activity===b.dataset.homeActivity)return;activity=b.dataset.homeActivity;mode='new';start();});
document.querySelectorAll('[data-home-direction]').forEach(b=>b.onclick=()=>{if(!ready||direction===b.dataset.homeDirection)return;direction=b.dataset.homeDirection;mode='new';start();});
document.querySelectorAll('[data-activity]').forEach(b=>b.onclick=()=>{if(activityLocked(b.dataset.activity)){openRegister();return;}if(b.dataset.activity==='writing'&&!syncWritingAvailability())return;if(activity!==b.dataset.activity){activity=b.dataset.activity;mode='new';start();}});
document.querySelectorAll('[data-search-difficulty]').forEach(b=>b.onclick=()=>{if(!ready||searchDifficulty===b.dataset.searchDifficulty)return;searchDifficulty=b.dataset.searchDifficulty;searchPuzzle=null;revealed=false;persist();syncControls();render();});
document.querySelectorAll('[data-difficulty]').forEach(b=>b.onclick=()=>{if(!ready||difficulty===b.dataset.difficulty)return;difficulty=b.dataset.difficulty;wordExercise=null;draft='';revealed=false;persist();syncControls();render();});
document.querySelectorAll('[data-direction]').forEach(b=>b.onclick=()=>{if(direction!==b.dataset.direction){direction=b.dataset.direction;start();}});
$('grammar-topic').onchange=e=>{grammarTopic=e.target.value;start();};
$('audio-only').checked=audioOnly;
$('levels').onclick=e=>{const b=e.target.closest('[data-level]');if(b&&levelLocked(Number(b.dataset.level))){openRegister();return;}if(b){if(activity==='verbs')activity='translate';level=Number(b.dataset.level);start();showView('practice');}};
$('audio-only').onchange=e=>{audioOnly=e.target.checked;start();};document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;start();});
$('about').onclick=()=>$('about-dialog').showModal();$('close-about').onclick=()=>$('about-dialog').close();$('about-dialog').onclick=e=>{if(e.target===$('about-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
document.addEventListener('keydown',e=>{if($('practice-view').hidden||document.querySelector('dialog[open]')||(!$('classrooms-view')?.hidden)||!ready||['writing','verbs','suchsel','endings','dialogs'].includes(activity)||$('about-dialog').open||$('report-dialog').open||$('manage-dialog').open||e.ctrlKey||e.metaKey||e.altKey||e.repeat||['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;const cs=queue[0];if(inCycle(cs)&&cycleStep!==1){if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();(cycleStep===0?$('cycle-next'):cycleFlipped?null:$('cycle-flip'))?.click();return;}if(cycleStep===2&&cycleFlipped&&['1','2','3'].includes(e.key)){e.preventDefault();document.querySelector(`[data-grade="${{1:'again',2:'hard',3:'easy'}[e.key]}"]`)?.click();}return;}else if(inCycle(cs)&&revealed&&['1','2','3'].includes(e.key))return;if(e.code==='Space'&&e.target.tagName!=='BUTTON'&&!revealed&&queue.length&&isTranslation()){e.preventDefault();$('reveal').click();}else if(revealed&&['1','2','3'].includes(e.key)){e.preventDefault();grade({1:'again',2:'hard',3:'easy'}[e.key]);}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopAudio();else if(ready)renderStats();});
// Sätze, Qualitätsliste und Grammatik gleichzeitig laden; die Startseite wartet nur auf die ersten beiden.
// Ohne Konto zeigt die Startseite statt „Sätze wiederholen“ eine Satzkarte zum Ausprobieren.
// Angemeldete: Begrüßung, Tagesziel mit Woche/Serie und „Satz des Tages“ (siehe home-extras.mjs).
function accountName(){try{return JSON.parse(localStorage.getItem('suomi-auth-session-v1')||'null')?.user?.user_metadata?.username||'';}catch{return '';}}
function accountId(){try{return JSON.parse(localStorage.getItem('suomi-auth-session-v1')||'null')?.user?.id||'';}catch{return '';}}
var dailySentence=null;
function renderHomeExtras(){
 if(typeof memory==='undefined'||!memory)return;
 const account=accountActive();
 renderGreeting(document.querySelector('#home-view .intro h1'),{account,name:accountName()});
 renderToday(document.querySelector('.today'),{count:memory.daily[day()]||0,daily:memory.daily,account,goal:dailyGoal,onGoalChange:n=>{dailyGoal=n;persist();renderHomeExtras();}});
 if(!dailySentence&&$('daily-sentence'))dailySentence=createDailySentence($('daily-sentence'),{sentences:()=>data,learnedIds:()=>new Set(Object.keys(memory.reviews||{}).map(k=>Number(k.split(':')[0]))),fallbackLevel:()=>levels[0]||1,sourceIcon:s=>sourceIcon(s),userKey:accountId});
 dailySentence?.render({account,ready});
}
var guestCard=createGuestCard($('guest-card'),{sentences:()=>data,level:()=>levels[0]||1,onUnavailable:()=>syncGuestHome(),onFinished:({animate})=>revealGuestPath(animate),onPathRequest:()=>pointToGuestPath(),sourceIcon:s=>sourceIcon(s)});
// Gäste: „Neue Sätze lernen“ zeigt nur die Überschrift, bis man es aufklappt (gilt für diesen Besuch).
var pathOpenedByGuest=false;
function syncPathCollapse(guest){const section=document.querySelector?.('.home-new'),toggle=$('path-toggle');if(!section||!toggle)return;const collapsed=guest&&!pathOpenedByGuest;section.classList?.toggle('is-collapsed',collapsed);section.classList?.toggle('is-collapsible',guest);toggle.hidden=!guest;toggle.setAttribute('aria-expanded',String(!collapsed));toggle.setAttribute('aria-label',collapsed?'Neue Sätze lernen aufklappen':'Neue Sätze lernen einklappen');}
if(typeof document!=='undefined'&&document.querySelector?.('.home-new .path-heading'))document.querySelector('.home-new .path-heading').addEventListener('click',()=>{if($('path-toggle').hidden)return;pathOpenedByGuest=$('path-toggle').getAttribute('aria-expanded')==='false';syncPathCollapse(true);});
// Gäste sehen „Neue Sätze lernen“ erst, wenn sie ihre fünf Sätze auf der Satzkarte durch haben.
function syncGuestPathVisibility(guest){const section=document.querySelector?.('.home-new');if(section)section.hidden=guest&&!guestCard.finished;}
function revealGuestPath(animate){
 pathOpenedByGuest=true;syncGuestHome();
 const section=document.querySelector('.home-new');if(!animate||section.hidden||typeof section.animate!=='function'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
 // Die Box wächst unter der Karte auf, ihr Inhalt folgt gestaffelt, zuletzt pulsiert „Lernpfad starten“.
 const cs=getComputedStyle(section),h=section.offsetHeight,ease='cubic-bezier(.2,.8,.2,1)';
 section.style.overflow='hidden';
 section.animate([{height:'0px',paddingTop:'0px',paddingBottom:'0px',borderTopWidth:'0px',borderBottomWidth:'0px',marginBottom:'0px',opacity:0,transform:'translateY(18px) scale(.97)'},{height:h+'px',paddingTop:cs.paddingTop,paddingBottom:cs.paddingBottom,borderTopWidth:cs.borderTopWidth,borderBottomWidth:cs.borderBottomWidth,marginBottom:cs.marginBottom,opacity:1,transform:'none'}],{duration:650,easing:ease}).finished.then(()=>{section.style.overflow='';}).catch(()=>{section.style.overflow='';});
 [...section.children].filter(el=>!el.hidden&&el.offsetParent).forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(12px)'},{opacity:1,transform:'none'}],{duration:500,delay:320+i*70,easing:ease,fill:'backwards'}));
 setTimeout(()=>pulseStart(),1100);
}
function pulseStart(){const b=$('start-new-sentences');if(!b)return;b.classList.remove('cta-pulse');void b.offsetWidth;b.classList.add('cta-pulse');setTimeout(()=>b.classList.remove('cta-pulse'),2600);}
function pointToGuestPath(){const section=document.querySelector('.home-new');if(!section||section.hidden)return;section.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});pulseStart();setTimeout(()=>$('start-new-sentences')?.focus({preventScroll:true}),500);}
function syncGuestHome(){document.documentElement.classList?.toggle('is-guest',!accountActive());if(typeof renderHomeExtras==='function')renderHomeExtras();syncActivityLocks();syncHeaderPractice();if(!guestCard)return;const guest=!accountActive()&&guestCard.available;syncPathCollapse(guest);syncGuestPathVisibility(guest);$('guest-card').hidden=!guest;if(!guest)guestCard.stop();else if(ready)guestCard.start();if(ready)renderDailyPlan();else document.querySelector('.home-daily').hidden=guest;}
syncGuestHome();
// Solange das Intro läuft (index.html: intro-pending, guest-intro.mjs: intro-running), wird nichts Schweres
// nebenher geladen oder berechnet – auf dem Handy ruckelt sonst der Vogelschwarm.
function introActive(){const c=document.documentElement.classList;return c.contains('intro-pending')||c.contains('intro-running');}
const afterIntro=()=>new Promise(resolve=>{const check=()=>introActive()?setTimeout(check,150):resolve();check();});
// Für das Intro der Angemeldeten: Der Vogel fliegt erst los, wenn Sätze und Tagesaufgaben fertig berechnet sind.
window.vanamoHomeBusy=()=>!homeDone||(ready&&accountActive()&&!activityLocked('endings')&&!dailyEndings&&!dailyEndingsFailed);
const sentencesRequest=fetch('sentences.json'),exclusionsRequest=loadQualityExclusions();
// Angemeldete brauchen die Wortanalyse gleich nach den Sätzen für die Tagesaufgaben: schon jetzt mitladen,
// damit sie nicht erst mitten im Intro ankommt.
if(accountActive()&&!activityLocked('endings'))loadLexicon().catch(()=>{});
let rawSentences=[],rawArchived=[];
// Die Grammatikhilfe wird erst nach den Sätzen geladen: Gleichzeitig geladen teilen
// sich beide Dateien die Leitung, und auf langsamen Handys verzögert das den Start.
// Gebraucht wird sie erst beim Aufdecken einer Karte (grammarLoaded zieht nach) – deshalb auch erst nach dem Intro.
let grammarRequest=null;
const loadGrammar=()=>grammarRequest??=fetch('grammar.json').then(r=>r.ok?r.json():null).then(p=>{if(p){grammar=p.sentences||{};grammarAvailable=true;}}).catch(()=>{}).finally(()=>{grammarLoading=false;grammarLoaded();});
setTimeout(()=>afterIntro().then(loadGrammar),8000);
try{const response=await sentencesRequest;if(!response.ok)throw new Error('load');const payload=await response.json();
 // Gäste sehen zuerst die Satzkarte, die das Wörterbuch braucht: erst das laden, dann die Grammatik.
 (accountActive()?Promise.resolve():loadLexicon().catch(()=>{})).finally(()=>afterIntro().then(loadGrammar));
 // Mit gespeicherter Sperrliste gar nicht warten, sonst höchstens 1,5 s; Späteres wird nachgezogen.
 const exclusionsInTime=await Promise.race([exclusionsRequest.then(()=>true),new Promise(r=>setTimeout(()=>r(false),qualityCached?0:1500))]);
 rawSentences=payload.sentences;rawArchived=Array.isArray(payload.archived_sentences)?payload.archived_sentences:[];
 if(!exclusionsInTime)exclusionsRequest.then(changed=>{if(!changed||!ready)return;data=qualityFilteredCards(rawSentences);archived=qualityFilteredCards(rawArchived);dailyEndings=null;renderStats();});
 loadedSentenceIds=new Set([...(payload.sentences||[]),...(Array.isArray(payload.archived_sentences)?payload.archived_sentences:[])].filter(s=>s?.translations?.length).map(s=>s.id));data=qualityFilteredCards(payload.sentences);if(Array.isArray(payload.levels))levels=payload.levels.map(l=>l.id).filter(Number.isInteger);if(!levels.includes(level)||levelLocked(level))level=levels[0]||1;archived=qualityFilteredCards(Array.isArray(payload.archived_sentences)?payload.archived_sentences:[]);if(!Array.isArray(data)||!data.length)throw new Error('empty');ready=true;start();homeLoaded();syncGuestHome();if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch{$('card').className='card empty';$('card').innerHTML='<h2>Die Sätze konnten nicht geladen werden.</h2><p>Prüfe deine Verbindung und lade die Seite erneut.</p>';$('actions').innerHTML='<button class="primary" id="retry">Erneut versuchen</button>';$('retry').onclick=()=>location.reload();$('total').textContent='Sätze nicht verfügbar';homeLoaded();}
mountWordLookup([$('practice-view')]);
window.suomiDifficultDeck=async()=>buildDifficultDeck({lexicon:await loadLexicon(),reviews:memory.reviews,events:memory.performanceEvents,missed:[...endingsState.missed]});
