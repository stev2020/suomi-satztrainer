import assert from 'node:assert/strict';
import fs from 'node:fs';
const {Window}=await import(process.env.HAPPY_DOM_MODULE||'happy-dom');
const window=new Window({url:'http://localhost:4173',settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true}});
window.document.body.innerHTML='<header><button id="account-button">Konto</button></header><main></main>';
let teacher=false,failUpload=false;
let objectURL=0;window.URL.createObjectURL=()=>`blob:test-${++objectURL}`;window.URL.revokeObjectURL=()=>{};
const id='11111111-1111-4111-a111-111111111111';
const room={id,name:'Finnisch am Mittwoch',teacher:false,owner:false,teacher_count:1,archived:false,member_count:2,members:[{name:'lehrkraft',role:'teacher',owner:true},{name:'anna',role:'student'},{name:'mika',role:'student'}],assignments:[{id:'task',title:'Unsere erste Aufgabe',items:[{text:'Hei',translations:[{text:'Hallo'}]}],due_at:null,released:false,submissions:[],submitted_count:0,messages:[]}]};
let posts=[],counter=0,files=new Map();
window.accountUser=()=>({id:'user',user_metadata:{username:'anna'}});
window.confirm=()=>true;
window.accountRequest=async(path,options={})=>{
 if(path.startsWith('/storage/')){
  const fileId=path.split('/').at(-1);
  if(options.method==='POST'){if(failUpload)return {ok:false};files.set(fileId,options.body);return {ok:true};}
  if(options.method==='DELETE'){for(const f of JSON.parse(options.body).prefixes)files.delete(f);return {ok:true};}
  return {ok:files.has(fileId),blob:async()=>files.get(fileId)};
 }
 const {action,payload}=JSON.parse(options.body);let result={};
 if(action==='list')result=[{...room,teacher}];
 if(action==='room')result={...room,teacher,owner:teacher};
 if(action==='stream_list')result={posts,has_more:false,open_questions:posts.filter(p=>p.kind==='question'&&!p.resolved&&!p.deleted).length,assignment_dates:{task:'2026-09-13T08:00:00Z'}};
 if(action==='stream_post'){
  const p={id:payload.request_id,kind:payload.kind,body:payload.body,author:'anna',own:true,teacher,resolved:false,created_at:'2026-09-13T12:00:00Z',files:payload.file_ids.map(id=>({id,name:'Hallo.txt',mime:'text/plain',size:5})),replies:[]};posts.unshift(p);result={id:p.id};
 }
 if(action==='stream_reply'){const root=posts.find(p=>p.id===payload.post_id||p.replies.some(m=>m.id===payload.post_id));root.replies.push({id:'reply-'+(++counter),reply_to_id:root.id===payload.post_id?null:payload.post_id,body:payload.body,author:'mika',own:false,created_at:'2026-09-13T12:01:00Z'});}
 if(action==='stream_resolve')posts.find(p=>p.id===payload.post_id).resolved=payload.resolved;
 if(action==='stream_pin')posts.find(p=>p.id===payload.post_id).pinned=payload.pinned;
 if(action==='stream_delete')posts.find(p=>p.id===payload.post_id).deleted=true;
 if(action==='stream_reserve')result={id:'file-'+(++counter)};
 return {ok:true,json:async()=>JSON.parse(JSON.stringify(result))};
};
window.eval(fs.readFileSync('./dist/classrooms.js','utf8').replace(/^import .*\n/gm,''));
const $=s=>window.document.querySelector(s);
const settle=async(error=false)=>{for(let i=0;i<20;i++)await new Promise(r=>setTimeout(r,0));assert(!$('[aria-busy]'));if(!error)assert(!$('#classrooms-status').classList.contains('error'),$('#classrooms-status').textContent);};
const click=async s=>{assert($(s),s);$(s).click();await settle();};
const submit=async(s,error=false)=>{$(s).dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));await settle(error);};
const input=(s,value)=>{$(s).value=value;$(s).dispatchEvent(new window.Event('input',{bubbles:true}));};
try{
 await click('#classrooms-button');await click('[data-cr=open]');
 assert($('.cr-stream-layout'));assert($('.cr-stream-sidebar'));assert($('.cr-feed-assignment'));
 assert(!$('#cr-stream-compose').open,'composer starts collapsed');
 assert($('#cr-stream-compose summary').textContent.includes('Aufklappen'));
 await click('#cr-stream-compose summary');assert($('#cr-stream-compose').open);
 assert(!$('option[value=announcement]'));assert(!$('[data-cr=new_assignment]'));
 input('[data-cr-form=stream_post] textarea','Wie sagt man <img src=x onerror=alert(1)>? https://example.org/test');
 await submit('[data-cr-form=stream_post]');assert.equal(posts.length,1);assert.equal($('.cr-post-body img'),null);assert($('.cr-post-body a').rel.includes('noopener'));
 await click('[data-cr=stream_reply]');input('[data-cr-form=stream_reply] textarea','Hei!');await submit('[data-cr-form=stream_reply]');assert($('.cr-feed-replies').open);assert($('.cr-feed-replies').textContent.includes('Hei!'));
 await click('#cr-stream-message-reply-1 [data-cr=stream_reply]');assert($('[data-cr-form=stream_reply]').textContent.includes('Antwort an mika'));input('[data-cr-form=stream_reply] textarea','Danke!');await submit('[data-cr-form=stream_reply]');
 assert.equal(posts[0].replies[1].reply_to_id,'reply-1');assert($('.cr-stream-children #cr-stream-message-reply-2'));assert($('.cr-feed-replies').open);
 await click('#cr-stream-message-reply-2 [data-cr=stream_reply]');input('[data-cr-form=stream_reply] textarea','Gern!');await submit('[data-cr-form=stream_reply]');assert.equal(posts[0].replies[2].reply_to_id,'reply-2');assert($('#cr-stream-message-reply-3').textContent.includes('Antwort an mika'));
 await click('[data-cr=stream_resolve]');assert($('.cr-resolved').textContent.includes('Beantwortet'));
 await click('[data-cr=stream_filter][data-filter=assignment]');assert(!$('.cr-feed-question'));assert($('.cr-feed-assignment'));
 await click('[data-cr=stream_filter][data-filter=all]');
 input('[data-cr-form=stream_post] textarea','Entwurf bleibt erhalten');
 $('#cr-stream-compose').open=true;await click('#cr-stream-compose summary');assert(!$('#cr-stream-compose').open);assert.equal($('[data-cr-form=stream_post] textarea').value,'Entwurf bleibt erhalten');
 await click('[data-cr=refresh]');assert.equal($('[data-cr-form=stream_post] textarea').value,'Entwurf bleibt erhalten');
 const upload=$('[name=files]');Object.defineProperty(upload,'files',{configurable:true,value:[new window.File(['Hallo'],'Hallo.txt',{type:'text/plain'})]});upload.dispatchEvent(new window.Event('change',{bubbles:true}));Object.defineProperty(upload,'files',{configurable:true,value:[]});
 assert($('#cr-draft-files').textContent.includes('Hallo.txt'));
 failUpload=true;await submit('[data-cr-form=stream_post]',true);assert($('#classrooms-status').classList.contains('error'));assert.equal(posts.length,1);assert.equal($('[data-cr-form=stream_post] textarea').value,'Entwurf bleibt erhalten');
 failUpload=false;await submit('[data-cr-form=stream_post]');assert.equal(posts.length,2);assert.equal(posts[0].files.length,1);assert.equal(files.size,1);assert.equal($('[data-cr-form=stream_post] textarea').value,'');
 files.set('image-file',new window.File(['image'],'Foto.png',{type:'image/png'}));posts.unshift({id:'image-post',kind:'post',body:'Ein Bild',author:'anna',own:true,teacher:false,resolved:false,created_at:'2026-09-13T12:02:00Z',files:[{id:'image-file',name:'Foto.png',mime:'image/png',size:5}],replies:[]});
 await click('[data-cr=refresh]');assert($('.cr-image-thumb img'));assert(!$('.cr-image-attachment').textContent.includes('Foto.png'));assert(!$('.cr-image-attachment').textContent.includes('Bild ansehen'));
 await click('.cr-image-thumb');assert($('#cr-image-dialog').open);assert($('#cr-image-dialog img').src.startsWith('blob:test-'));$('#cr-image-dialog button').click();
 const question=posts.find(p=>p.kind==='question');question.own=false;await click('[data-cr=refresh]');assert(!$('#cr-post-'+question.id+' [data-cr=stream_resolve]'));
 teacher=true;await click('[data-cr=refresh]');assert($('option[value=announcement]'));assert($('#cr-post-'+question.id+' [data-cr=stream_resolve]'));assert($('[data-cr=stream_pin]'));
 await click('[data-cr=stream_pin]');assert($('.cr-feed-type').textContent.includes('ANGEHEFTET'));
 const deletedQuestionId=question.id;await click(`#cr-post-${deletedQuestionId} [data-cr=stream_delete]`);assert(!$('#cr-post-'+deletedQuestionId));assert(!$('#cr-stream-feed').textContent.includes('Beitrag entfernt'));
 room.archived=true;await click('[data-cr=refresh]');assert(!$('[data-cr-form=stream_post]'));assert(!$('[data-cr=stream_reply]'));assert(!$('[data-cr=stream_resolve]'));assert($('.cr-feed-card'));
 console.log('PASS stream: layout, task events, questions, links/XSS, replies, resolution rights, filters, drafts, failed upload retry, attachments, teacher pinning and archive');
}finally{await window.happyDOM.close();}
