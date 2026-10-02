// Regression test: a failing token refresh must only end the session when the
// refresh token is really rejected (400/401). Server errors keep local progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
const start=source.indexOf('let refreshInFlight=null;');
const end=source.indexOf('\nasync function request(',start);
assert(start>=0&&end>start,'refreshSession implementation found');

async function run(status,{concurrent=1,stored=null}={}){
  const storage=new Map([['suomi-learning-v1','{"reviews":{"1:fi-de":{}}}'],['suomi-cloud-stamp-v1','{}'],['vanamo-daily-sentence:u1','{}'],['vanamo-daily-sentence:u2','{}'],['suomi-hyppy.progress.grund','{}'],['suomi-hyppy.highscore','12'],['vanamo-theme','ruska']]);
  if(stored)storage.set('suomi-auth-session-v1',JSON.stringify(stored));
  const calls=[];let reloads=0,saved='unchanged',syncMessage='';
  const context={
    STORE:'suomi-learning-v1',SESSION:'suomi-auth-session-v1',STAMP:'suomi-cloud-stamp-v1',
    session:{refresh_token:'r1',access_token:'a1',user:{id:'u1'}},
    localStorage:{getItem:key=>storage.get(key)??null,removeItem:key=>storage.delete(key),get length(){return storage.size},key:i=>[...storage.keys()][i]??null},
    sessionStorage:{removeItem(){}},
    location:{reload(){reloads++}},
    saveSession:v=>{saved=v},
    syncState:t=>{syncMessage=t},
    api:async()=>{calls.push(1);await new Promise(r=>setTimeout(r,5));return {ok:status>=200&&status<300,status,json:async()=>({access_token:'a2',refresh_token:'r2'})}},
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start,end)}\nthis.refreshSession=refreshSession;`,context);
  const results=await Promise.all(Array.from({length:concurrent},()=>context.refreshSession()));
  return {results,storage,reloads,saved,syncMessage,calls:calls.length,session:context.session};
}

for(const status of [500,503,429]){
  const r=await run(status);
  assert.deepEqual(r.results,[false]);
  assert(r.storage.has('suomi-learning-v1'),`HTTP ${status} keeps the local learning state`);
  assert.equal(r.reloads,0,`HTTP ${status} does not reload`);
  assert.equal(r.saved,'unchanged',`HTTP ${status} keeps the session`);
  assert(r.syncMessage,'user sees why synchronization is paused');
}
for(const status of [400,401]){
  const r=await run(status);
  assert(!r.storage.has('suomi-learning-v1'),`HTTP ${status} (invalid refresh token) clears the account copy`);
  assert.equal(r.saved,null);assert.equal(r.reloads,1);
  for(const key of ['suomi-cloud-stamp-v1','vanamo-daily-sentence:u1','suomi-hyppy.progress.grund'])assert(!r.storage.has(key),`${key} of the account is removed`);
  for(const key of ['vanamo-daily-sentence:u2','suomi-hyppy.highscore','vanamo-theme'])assert(r.storage.has(key),`${key} (other account / device setting) stays`);
}
const ok=await run(200,{concurrent:3});
assert.deepEqual(ok.results,[true,true,true]);
assert.equal(ok.calls,1,'parallel 401 responses share one refresh (no rotated-token race)');
// Another tab already rotated the token: adopt it instead of reusing the old one.
const adopted=await run(400,{stored:{refresh_token:'r2',access_token:'a2',user:{id:'u1'}}});
assert.deepEqual(adopted.results,[true]);
assert.equal(adopted.calls,0,'no refresh request with the already used token');
assert.equal(adopted.session.refresh_token,'r2');
assert(adopted.storage.has('suomi-learning-v1'),'learning state stays');
// A different account in storage is not adopted.
const otherAccount=await run(200,{stored:{refresh_token:'x',access_token:'y',user:{id:'someone-else'}}});
assert.equal(otherAccount.calls,1);
// Same token in storage: normal refresh.
const same=await run(200,{stored:{refresh_token:'r1',access_token:'a1',user:{id:'u1'}}});
assert.equal(same.calls,1);
const authSource=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
assert(authSource.includes("locks.request('suomi-auth-refresh'"),'refreshes are serialized across tabs');
assert(authSource.includes("window.addEventListener('storage'"),'tabs follow session changes of other tabs');
console.log('PASS: token refresh keeps local progress on server errors, ends only rejected sessions, single-flight refresh, adopts tokens rotated by other tabs.');
