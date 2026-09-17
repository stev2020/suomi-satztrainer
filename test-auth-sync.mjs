// Regression test for cross-device learning-state synchronization.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mergeVerbProgress} from './dist/verb-practice.mjs';

const source=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
const start=source.indexOf('function mergeLearning(');
const end=source.indexOf('\nasync function cloudLearning',start);
assert(start>=0&&end>start,'mergeLearning implementation found');

const context={mergeVerbProgress};
vm.createContext(context);
vm.runInContext(`${source.slice(start,end)}\nthis.mergeLearning=mergeLearning;`,context);

const base={favorites:[],daily:{},prefs:{level:1},reports:{},writingRatings:{}};
const local={...base,reviews:{'1:fi-de':{due:1,interval:1,repetitions:1,updatedAt:100},'2:fi-de':{due:2,interval:1,repetitions:1,updatedAt:300}}};
const cloud={...base,reviews:{'1:fi-de':{due:4102444800000,interval:3,repetitions:2,updatedAt:200},'2:fi-de':{due:3,interval:1,repetitions:1,updatedAt:200}}};
const merged=context.mergeLearning(local,cloud);

assert.equal(merged.reviews['1:fi-de'].updatedAt,200,'newer phone review wins over stale laptop review');
assert.equal(merged.reviews['2:fi-de'].updatedAt,300,'newer laptop review is retained');

const mergeBeforeWrite=source.indexOf('const cloud=await cloudLearning()');
const cloudWrite=source.indexOf("request('/rest/v1/learning_state?on_conflict=user_id'",mergeBeforeWrite);
assert(mergeBeforeWrite>=0&&cloudWrite>mergeBeforeWrite,'cloud state is read and merged before every write');
assert(!source.includes('CLOUD_POLL_MS'),'unchanged devices never trigger periodic cloud synchronization');
assert(!source.includes('lastCloudCheck'),'there is no elapsed-time based cloud synchronization');
assert(source.includes('const current=currentLearning(),snapshot=stableJSON(current);'),'field ordering cannot trigger false uploads');
assert(source.includes('if(snapshot!==lastSnapshot)synchronizeLearning(current,true,false)'),'only a real local change starts synchronization');
assert(source.includes("window.addEventListener('focus',syncChangedNow)"),'returning to a device flushes a pending local change without an unconditional cloud check');
assert(source.includes("$('sync-now').onclick"),'manual synchronization remains available');
assert(source.includes('await pullAndMerge();watch();'),'the cloud state is still loaded once on startup');

console.log('PASS: merge-before-write and change-triggered synchronization are present');
