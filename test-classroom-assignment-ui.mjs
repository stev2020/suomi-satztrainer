import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./dist/classrooms.js',import.meta.url),'utf8');
new Function(source.replace(/^import .*$/gm,''));
const assignment=source.slice(source.indexOf('function assignment('),source.indexOf('function discussion('));
const render=source.slice(source.indexOf('function renderCustomItems('),source.indexOf('function assignment('));
const check=new Function('teacher','creator','submitted','closed','manage','direction',`
 const room={teacher,archived:false,member_count:1,members:[],assignments:[{id:'a',own_assignment:creator,title:'Test',can_manage:manage,direction,submissions:submitted?[{own:true,answers:['MY ANSWER'],reactions:{},feedback:[{item_index:0,body:'x',author:'T'}]}]:[],released:closed,items:[{text:'SECRET SOLUTION',translations:[{text:'Hallo'}]}],submitted_count:0}]};
 let selected,dirty;const drafts=new Map(),target={},dropDraft=()=>{},lexiconReady=true,classOverview=()=>'OVERVIEW',reviewOffer=()=>'OFFER',DIRECTIONS={'de-fi':'Deutsch → Finnisch','fi-de':'Finnisch → Deutsch',cloze:'Lückentext',verbs:'Verbformen'},isExact=a=>['cloze','verbs'].includes(a.direction),exactItem=(a,s,i,o)=>'EXACT'+(o.reveal?' REVEALED':'')+(o.canSubmit?' FIELD':''),scoreOf=()=>1,verdict=()=>'VERDICT',itemLabel=()=>'LABEL',directionOf=a=>DIRECTIONS[a.direction]?a.direction:'de-fi',loadLexicon=async()=>{},autoFeedback=()=>'AUTO',teacherNote=(s,i)=>(s.feedback||[]).some(f=>f.item_index===i)?'NOTE':'',feedbackForm=()=>'FORM';const $=()=>target;
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
assert(!check(true,true,false,false).includes('Aufgabe löschen'),'no manage buttons until the migration reports can_manage');
assert(check(true,true,false,false,true).includes('Aufgabe bearbeiten')&&check(true,true,true,true,true).includes('Aufgabe löschen'));
assert(!check(false,false,false,false,false).includes('Aufgabe bearbeiten'));
assert(check(false,false,true,false,false).includes('AUTO')&&check(false,false,true,false,false).includes('NOTE'),'own submission shows comparison and comment');
assert(!check(false,false,false,false,false).includes('AUTO'));
assert(check(true,true,true,false,true).includes('OVERVIEW')&&!check(true,false,true,true,false).includes('OVERVIEW')&&!check(false,false,true,true,false).includes('OVERVIEW'),'class overview only for whoever manages the assignment');
assert(check(false,false,true,false,false).includes('OFFER')&&!check(false,false,false,false,false).includes('OFFER')&&!check(true,true,false,false,true).includes('OFFER'),'review offer only after the own submission');
assert(check(true,true,true,false,true).includes('FORM')&&!check(true,false,true,true,false).includes('FORM'),'comment form only for whoever manages the assignment');
const html=new Function(`const customItems=[{added:true,de:'<b>Hallo</b>',fi:'Hei'},{added:false,de:'',fi:''}];const host={};const document={querySelectorAll:()=>[host]};const b=(text)=>text;const esc=v=>String(v).replaceAll('<','&lt;').replaceAll('>','&gt;');${render};renderCustomItems();return host.innerHTML;`)();
assert(!html.split('</fieldset>')[0].includes('<textarea'));
assert(html.includes('&lt;b&gt;'));
assert(html.split('</fieldset>')[1].includes('<textarea'));
{const open=check(false,false,false,false,false,'fi-de'),done=check(false,false,true,false,false,'fi-de'),old=check(false,false,false,false,false);
 assert(open.includes('Finnisch → Deutsch')&&open.includes('Finnischer Satz')&&open.includes('SECRET SOLUTION')&&open.includes('Deine deutsche Übersetzung')&&!open.includes('Hallo'),'fi-de shows the Finnish sentence and hides the German one');
 assert(done.includes('Deutsche Vorlage')&&done.includes('Hallo'));
 assert(old.includes('Deutsch → Finnisch')&&old.includes('Deutscher Satz')&&old.includes('Hallo')&&!old.includes('SECRET SOLUTION'),'packages without a direction stay German → Finnish');}
{const open=check(false,false,false,false,false,'cloze'),done=check(false,false,true,false,false,'cloze'),verbs=check(false,false,true,false,false,'verbs'),teacher=check(true,true,true,false,true,'verbs');
 assert(open.includes('EXACT FIELD')&&!open.includes('REVEALED')&&!open.includes('SECRET SOLUTION')&&open.includes('genau eine richtige Antwort'),'checked types render their own entry and keep the solution hidden');
 assert(done.includes('EXACT REVEALED')&&done.includes('1 von 1 richtig')&&done.includes('OFFER'),'cloze: score and review offer after the submission');
 assert(verbs.includes('1 von 1 richtig')&&!verbs.includes('OFFER'),'verbs: score, no review offer');
 assert(teacher.includes('VERDICT')&&!teacher.includes('AUTO'),'teacher sees right or wrong for checked types');}
console.log('PASS: assignment role/submission/release matrix, checked types, both directions, manage buttons, old API compatibility, static confirmed sentence and escaped text.');
