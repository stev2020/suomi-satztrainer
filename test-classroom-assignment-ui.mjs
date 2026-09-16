import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./dist/classrooms.js',import.meta.url),'utf8');
new Function(source.replace(/^import .*$/gm,''));
const assignment=source.slice(source.indexOf('function assignment('),source.indexOf('function discussion('));
const render=source.slice(source.indexOf('function renderCustomItems('),source.indexOf('function assignment('));
const check=new Function('teacher','creator','submitted','closed',`
 const room={teacher,archived:false,member_count:1,members:[],assignments:[{id:'a',own_assignment:creator,title:'Test',submissions:submitted?[{own:true,answers:['MY ANSWER'],reactions:{}}]:[],released:closed,items:[{text:'SECRET SOLUTION',translations:[{text:'Hallo'}]}],submitted_count:0}]};
 let selected,dirty;const drafts=new Map(),target={};const $=()=>target;
 const b=(text)=>text,esc=String,date=()=>'',sources=()=>'',discussion=()=>'',sentenceSourceIcon=()=>'';${assignment}
 assignment('a');return target.innerHTML;
`);
for(const teacher of [false,true])for(const creator of [false,true])for(const submitted of [false,true])for(const closed of [false,true]){
 const html=check(teacher,creator,submitted,closed);
 assert.equal(html.includes('data-cr-form="submit"'),!creator&&!submitted&&!closed);
 assert.equal(html.includes('SECRET SOLUTION'),creator||submitted||closed);
 if(!submitted&&!creator&&!closed)assert(!html.includes('Abgabenübersicht'));
}
assert(!check(true,undefined,false,false).includes('data-cr-form="submit"'),'old API remains compatible until migration');
assert(check(false,undefined,false,false).includes('data-cr-form="submit"'));
const html=new Function(`const customItems=[{added:true,de:'<b>Hallo</b>',fi:'Hei'},{added:false,de:'',fi:''}];const host={};const document={querySelectorAll:()=>[host]};const b=(text)=>text;const esc=v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;');${render};renderCustomItems();return host.innerHTML;`)();
assert(!html.split('</fieldset>')[0].includes('<textarea'));
assert(html.includes('&lt;b&gt;'));
assert(html.split('</fieldset>')[1].includes('<textarea'));
console.log('PASS: assignment role/submission/release matrix, old API compatibility, static confirmed sentence and escaped text.');
