// Regression test for cross-device learning-state synchronization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mergeVerbProgress} from './dist/verb-practice.mjs';
import {mergePerformanceEvents} from './dist/learning-insights.mjs';
import {mergeGames} from './dist/games-progress.mjs';
import {mergeEndingsProgress} from './dist/endings-progress.mjs';

const source=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
const start=source.indexOf('function mergeLearning(');
const end=source.indexOf('\nasync function cloudLearning',start);
assert(start>=0&&end>start,'mergeLearning implementation found');

const context={mergeVerbProgress,mergePerformanceEvents,mergeGames,mergeEndingsProgress};
vm.createContext(context);
vm.runInContext(`${source.slice(start,end)}\nthis.mergeLearning=mergeLearning;`,context);

const base={favorites:[],daily:{},prefs:{level:1},reports:{},writingRatings:{}};
const local={...base,performanceEvents:[{id:'local',at:100,kind:'sentence',sentenceId:1,activity:'translate',grade:'hard',direction:'fi-de',difficulty:'hard',grammarTopic:''}],reviews:{'1:fi-de':{due:1,interval:1,repetitions:1,updatedAt:100},'2:fi-de':{due:2,interval:1,repetitions:1,updatedAt:300}}};
const cloud={...base,performanceEvents:[{id:'cloud',at:200,kind:'sentence',sentenceId:2,activity:'listen',grade:'again',direction:'fi-de',difficulty:'hard',grammarTopic:''}],reviews:{'1:fi-de':{due:4102444800000,interval:3,repetitions:2,updatedAt:200},'2:fi-de':{due:3,interval:1,repetitions:1,updatedAt:200}}};
const merged=context.mergeLearning(local,cloud);

assert.equal(merged.reviews['1:fi-de'].updatedAt,200,'newer phone review wins over stale laptop review');
assert.equal(merged.reviews['2:fi-de'].updatedAt,300,'newer laptop review is retained');
assert.deepEqual(merged.performanceEvents.map(event=>event.id),['local','cloud'],'analysis history is merged across devices');
const gm=context.mergeLearning({...local,games:{hyppy:{grund:{a:{box:1,right:1,wrong:0,last:500},b:{box:3,right:3,wrong:0,last:100}}}}},{...cloud,games:{hyppy:{grund:{a:{box:0,right:1,wrong:1,last:400},b:{box:0,right:3,wrong:1,last:900}},verbs:{c:{box:1,right:1,wrong:0,last:1}}}}});
assert.equal(gm.games.hyppy.grund.a.last,500,'newer game answer from this device wins');
assert.equal(gm.games.hyppy.grund.b.last,900,'newer game answer from the cloud wins');
assert.ok(gm.games.hyppy.verbs.c,'decks only known to one side survive');
const ending=(updatedAt,streak)=>({attempts:2,errors:streak?0:1,streak,firstAt:50,due:updatedAt+1,updatedAt});
const em=context.mergeLearning({...local,endingsProgress:{'5:1':ending(900,1),'6:0':ending(100,1)}},{...cloud,endingsProgress:{'5:1':ending(400,0),'6:0':ending(800,0),'7:2':ending(10,1)}});
assert.equal(em.endingsProgress['5:1'].updatedAt,900,'newer endings answer from this device wins');
assert.equal(em.endingsProgress['6:0'].updatedAt,800,'newer endings answer from the cloud wins');
assert.ok(em.endingsProgress['7:2'],'endings only known to the cloud survive');
assert.ok(context.mergeLearning(local,{...cloud,endingsProgress:{'7:2':ending(10,1)}}).endingsProgress['7:2'],'older app versions without endings keep cloud progress');

const stampCheck=source.indexOf('await cloudUpdatedAt()');
const mergeBeforeWrite=source.indexOf('await cloudLearning()',stampCheck);
const cloudWrite=source.indexOf("request('/rest/v1/learning_state?on_conflict=user_id'",mergeBeforeWrite);
assert(stampCheck>=0&&mergeBeforeWrite>stampCheck&&cloudWrite>mergeBeforeWrite,'cloud timestamp is checked and the cloud state merged before every write');
assert(!source.includes('setInterval('),'no periodic synchronization checks');
assert(source.includes("window.addEventListener('suomi-learning-changed',scheduleSync)"),'local persistence schedules synchronization');
const appSource=fs.readFileSync(new URL('./dist/app.js',import.meta.url),'utf8');
assert(appSource.includes('commitLearning(candidate,false)'),'applying cloud data does not emit a local edit');
assert(source.includes("$('sync-now').onclick"),'manual synchronization remains available');

function harness({storage=new Map(),remote:initialRemote=null,remoteAt:initialAt=null,current:initialCurrent=null}={}){
  let current=structuredClone(initialCurrent||{...base,reviews:{},verbProgress:{},performanceEvents:[]});
  let remote=structuredClone(initialRemote||current),remoteAt=initialAt,postGate=null,getGate=null,fail=false;
  const calls=[],timers=new Map(),delays=[];let timerId=0;
  const elements=new Map();
  const sandbox={uiLocale:'de-DE',mergeVerbProgress,mergePerformanceEvents,mergeGames,mergeEndingsProgress,console,URL,TextEncoder,
    SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-public-key',
    document:{hidden:false,getElementById:id=>{if(!elements.has(id))elements.set(id,{textContent:'',classList:{toggle(){}}});return elements.get(id)}},
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
    location:{reload(){throw new Error('Unexpected reload')}},
    window:{suomiLearningState:{snapshot:()=>structuredClone(current),applyCloud:incoming=>{
      // Like the app: discard unknown top-level fields and retain local
      // favorite order. Raw cloud and accepted app state need not match.
      const {legacyField,...accepted}=structuredClone(incoming);
      accepted.favorites=[...new Set([...current.favorites,...incoming.favorites])];
      current=accepted;storage.set('suomi-learning-v1',JSON.stringify(current));return true;
    }}},
    setTimeout:(fn,delay)=>{const id=++timerId;timers.set(id,fn);delays.push(delay);return id},clearTimeout:id=>timers.delete(id),
    fetch:async(url,options)=>{
      const method=options.method||'GET';
      // Supabase returns timestamps as +00:00, the app sends Z: compare as times.
      const at=remoteAt&&remoteAt.replace('Z','+00:00');
      if(method==='GET'&&url.includes('select=updated_at&')){calls.push('STAMP');return {ok:true,status:200,json:async()=>[{updated_at:at}]}}
      calls.push(method);
      if(method==='GET'){if(getGate)await getGate;return {ok:true,status:200,json:async()=>[{state:structuredClone(remote),updated_at:at}]}}
      const body=JSON.parse(options.body);
      if(postGate)await postGate;
      if(fail)return {ok:false,status:500};
      remote=body.state;remoteAt=body.updated_at;return {ok:true,status:204};
    }};
  vm.createContext(sandbox);
  const code=source.slice(0,source.indexOf('loadSession();bind();')).replace(/^import .*;\n/gm,'');
  vm.runInContext(code+"\nsession={user:{id:'test-user'},access_token:'test-token'};syncReady=true;this.sync={pullAndMerge,syncChangedNow,scheduleSync};",sandbox);
  return {sandbox,calls,timers,delays,storage,sync:sandbox.sync,
    current:()=>current,remote:()=>remote,remoteAt:()=>remoteAt,
    // Another device writes: new content and a newer timestamp.
    cloud:value=>{remote=structuredClone(value);remoteAt=new Date(Date.parse(remoteAt||'2026-09-01T00:00:00Z')+1000).toISOString()},edit:fn=>{fn(current);storage.set('suomi-learning-v1',JSON.stringify(current));sandbox.sync.scheduleSync()},
    gatePost:value=>{postGate=value},gateGet:value=>{getGate=value},fail:value=>{fail=value},
    flush:async()=>{for(const [id,fn] of [...timers]){timers.delete(id);fn()}await settle()},
  };
}
async function settle(){for(let n=0;n<30;n++)await Promise.resolve()}
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}

// A normalized cloud result used to differ from lastSnapshot indefinitely.
const idle=harness();
idle.cloud({...idle.remote(),legacyField:'old schema',favorites:[2,1]});
idle.edit(state=>{state.favorites=[1]});
await idle.sync.pullAndMerge();
assert.deepEqual(idle.calls,['GET','POST']);
assert.deepEqual(idle.current().favorites,[1,2]);
for(let i=0;i<10;i++){idle.sync.syncChangedNow();await idle.flush()}
assert.deepEqual(idle.calls,['GET','POST'],'idle/focus checks never upload the accepted cloud snapshot again');
assert.equal(idle.timers.size,0,'no recurring timer remains');

// Several quick edits are coalesced, unchanged persistence does nothing.
idle.edit(state=>{state.daily['2026-09-19']=1});
idle.edit(state=>{state.daily['2026-09-19']=2});
assert.equal(idle.timers.size,1);
await idle.flush();
assert.equal(idle.remote().daily['2026-09-19'],2);
assert.equal(idle.calls.length,4);
idle.edit(()=>{});await idle.flush();
assert.equal(idle.calls.length,4,'a no-op save does not access the network');

// Answers during upload survive in memory AND local storage, then upload once.
const race=harness();await race.sync.pullAndMerge();
const post=deferred();race.gatePost(post.promise);
race.edit(state=>{state.daily['2026-09-19']=1});await race.flush();
race.edit(state=>{state.daily['2026-09-19']=2});
post.resolve();await settle();
assert.equal(race.current().daily['2026-09-19'],2);
assert.equal(JSON.parse(race.storage.get('suomi-learning-v1')).daily['2026-09-19'],2);
await race.flush();
assert.equal(race.remote().daily['2026-09-19'],2,'queued answer reaches cloud');
assert.equal(race.calls.length,6,'one initial sync, one upload, one follow-up');
assert.equal(race.timers.size,0);

// An answer while the cloud GET is pending is included in that same upload.
const duringRead=harness();const get=deferred();duringRead.gateGet(get.promise);
const reading=duringRead.sync.pullAndMerge();
duringRead.edit(state=>{state.daily['2026-09-19']=1});
get.resolve();await reading;await duringRead.flush();
assert.equal(duringRead.remote().daily['2026-09-19'],1);
assert.equal(duringRead.calls.length,2);

// Failures leave progress locally and do not start an endless retry loop.
const failed=harness();await failed.sync.pullAndMerge();failed.fail(true);
failed.edit(state=>{state.daily['2026-09-19']=3});await failed.flush();
const failureCalls=failed.calls.length;
for(let i=0;i<10;i++)await failed.flush();
assert.equal(failed.calls.length,failureCalls);
assert.equal(failed.current().daily['2026-09-19'],3);
failed.fail(false);await failed.sync.pullAndMerge();
assert.equal(failed.remote().daily['2026-09-19'],3,'manual retry preserves pending progress');
// Steady answering: one timer that is not restarted, uploads after SYNC_DELAY.
const steady=harness();await steady.sync.pullAndMerge();
steady.edit(state=>{state.daily['2026-09-20']=1});const [firstTimer]=steady.timers.keys();
steady.edit(state=>{state.daily['2026-09-20']=2});
assert.deepEqual([...steady.timers.keys()],[firstTimer],'further answers keep the pending timer instead of postponing it');
assert.equal(steady.delays.at(-1),15000,'answers are collected for 15 seconds');
steady.calls.length=0;await steady.flush();
assert.deepEqual(steady.calls,['STAMP','POST'],'own last write: only updated_at is read, not the whole state');
assert.equal(steady.remote().daily['2026-09-20'],2);

// Another device wrote in between: the full cloud state is read and merged.
steady.cloud({...steady.remote(),daily:{...steady.remote().daily,'2026-09-21':7},legacyField:'newer app'});
steady.edit(state=>{state.daily['2026-09-20']=3});steady.calls.length=0;await steady.flush();
assert.deepEqual(steady.calls,['STAMP','GET','POST'],'a foreign write triggers a full read');
assert.equal(steady.remote().daily['2026-09-21'],7,'answers from the other device are kept');
assert.equal(steady.remote().daily['2026-09-20'],3,'answers from this device are kept');
assert.equal(steady.current().legacyField,undefined,'the app drops fields it does not know');
steady.edit(state=>{state.daily['2026-09-20']=4});steady.calls.length=0;await steady.flush();
assert.deepEqual(steady.calls,['STAMP','POST']);
assert.equal(steady.remote().legacyField,'newer app','fields of newer app versions survive the short path');

// Reload without new answers: one read, no upload. Then the short path again.
const reloaded=harness({storage:steady.storage,remote:steady.remote(),remoteAt:steady.remoteAt(),current:steady.current()});
await reloaded.sync.pullAndMerge();
assert.deepEqual(reloaded.calls,['GET'],'a page load without changes does not upload the learning state');
reloaded.edit(state=>{state.daily['2026-09-22']=1});await reloaded.flush();
assert.deepEqual(reloaded.calls,['GET','STAMP','POST']);
assert.equal(reloaded.remote().legacyField,'newer app');

// Stamp of another account is ignored.
const other=harness({storage:new Map([['suomi-cloud-stamp-v1',JSON.stringify({user:'someone-else',at:steady.remoteAt(),hash:'x'})]])});
await other.sync.pullAndMerge();
assert.deepEqual(other.calls,['GET','POST']);
console.log('PASS: event-driven sync, idle stability, coalescing, concurrent answers, failure recovery, timestamp short path, foreign writes and reloads');
