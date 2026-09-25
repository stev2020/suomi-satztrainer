// Regression test: a failing token refresh must only end the session when the
// refresh token is really rejected (400/401). Server errors keep local progress.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
const start=source.indexOf('let refreshInFlight=null;');
const end=source.indexOf('\nasync function request(',start);
assert(start>=0&&end>start,'refreshSession implementation found');

async function run(status,{concurrent=1}={}){
  const storage=new Map([['suomi-learning-v1','{"reviews":{"1:fi-de":{}}}']]);
  const calls=[];let reloads=0,saved='unchanged',syncMessage='';
  const context={
    STORE:'suomi-learning-v1',
    session:{refresh_token:'r1',access_token:'a1'},
    localStorage:{removeItem:key=>storage.delete(key)},
    location:{reload(){reloads++}},
    saveSession:v=>{saved=v},
    syncState:t=>{syncMessage=t},
    api:async()=>{calls.push(1);await new Promise(r=>setTimeout(r,5));return {ok:status>=200&&status<300,status,json:async()=>({access_token:'a2',refresh_token:'r2'})}},
  };
  vm.createContext(context);
  vm.runInContext(`${source.slice(start,end)}\nthis.refreshSession=refreshSession;`,context);
  const results=await Promise.all(Array.from({length:concurrent},()=>context.refreshSession()));
  return {results,storage,reloads,saved,syncMessage,calls:calls.length};
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
}
const ok=await run(200,{concurrent:3});
assert.deepEqual(ok.results,[true,true,true]);
assert.equal(ok.calls,1,'parallel 401 responses share one refresh (no rotated-token race)');
console.log('PASS: token refresh keeps local progress on server errors, ends only rejected sessions, single-flight refresh.');
