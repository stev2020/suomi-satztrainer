// Browser UI regression test. API responses are mocked; live SQL authorization
// is tested separately by supabase/tests/classrooms.sql inside ROLLBACK.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright/package.json');
const {chromium}=require('playwright');
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote','--single-process']});
const page=await browser.newPage({viewport:{width:1280,height:900}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const base=process.env.TEST_BASE_URL||'http://localhost:4173';
const id='11111111-1111-4111-a111-111111111111';
let teacher=true;
const room={id,name:'Finnisch am Mittwoch',teacher:true,owner:true,teacher_count:1,archived:false,code:'ABCD1234ABCD1234',member_count:1,members:[{id:'student',name:'learner',role:'student',owner:false,blocked:false}],assignments:[]};
await page.route('**/auth/v1/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test',refresh_token:'test',user:{id,user_metadata:{username:'teacher'}}})}));
await page.route('**/rest/v1/learning_state**',route=>route.fulfill({status:200,contentType:'application/json',body:'[]'}));
await page.route('**/rest/v1/rpc/classroom_api',async route=>{
 const {action,payload}=route.request().postDataJSON();let result={};
 if(action==='list')result=[{...room,teacher}];
 if(action==='create'||action==='join')result={id};
 if(action==='room')result={...room,teacher,members:teacher?room.members:[],code:teacher?room.code:null};
 if(action==='assign')room.assignments.push({id:'22222222-2222-4222-a222-222222222222',title:payload.title,items:payload.items,due_at:payload.due_at,released:false,submissions:[],messages:[],submitted_count:0});
 if(action==='submit'){room.assignments[0].submissions.push({id:'submission',own:true,answers:payload.answers,author:teacher?'learner':null,reactions:{}});room.assignments[0].submitted_count=1;}
 if(action==='release')room.assignments[0].released=true;
 if(action==='message')room.assignments[0].messages.push({id:'message',author:'learner',own:true,body:payload.body,item_index:Number(payload.item_index)});
 if(action==='delete_message')room.assignments[0].messages=[];
 await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
});
try{
 await page.goto(base);await page.locator('#classrooms-button').click();
 await page.getByText('Zum Beitreten und Speichern brauchst du ein Konto.').waitFor();
 assert.equal(await page.locator('#classrooms-close').count(),0);
 await page.evaluate(id=>localStorage.setItem('suomi-auth-session-v1',JSON.stringify({access_token:'test',refresh_token:'test',user:{id,user_metadata:{username:'teacher'}}})),id);
 await page.reload();await page.locator('#classrooms-button').click();
 await page.locator('[data-cr-form=create] input').fill('Finnisch am Mittwoch');
 await page.locator('[data-cr-form=create] button').click();
 await page.locator('[data-cr=new_assignment]').click();
 await page.locator('[data-cr-form=assign] input[name=title]').fill('Unsere erste Runde');
 await page.locator('[data-sentence]').first().check();
 await page.locator('[data-cr-form=assign] button.primary').click();
 await page.locator('[data-cr=assignment]').click();
 await page.getByRole('heading',{name:'Unsere erste Runde'}).waitFor();
 assert(await page.locator('[data-cr=release]').isVisible());
 await page.locator('#classrooms-button').click();teacher=false;
 await page.locator('[data-cr=open]').click();
 assert.equal(await page.locator('[data-cr=new_assignment]').count(),0);
 await page.locator('[data-cr=assignment]').click();
 await page.locator('[data-answer]').fill('<img src=x onerror=alert(1)> Hei!');
 await page.locator('[data-cr-form=submit] button.primary').click();
 await page.getByText('Deine Antworten sind gespeichert.').waitFor();
 assert.equal(await page.locator('#classrooms-content img').count(),0);
 await page.locator('[data-cr-form=message] textarea').fill('Warum steht hier diese Form?');
 await page.locator('[data-cr-form=message] button').click();await page.locator('.cr-message').waitFor();
 await page.locator('#classrooms-button').click();teacher=true;
 await page.locator('[data-cr=open]').click();await page.locator('[data-cr=assignment]').click();
 await page.locator('[data-cr=release]').click();await page.locator('[data-cr=react]').first().waitFor();
 await page.screenshot({path:'/workspace/scratch/a73c6d3205e6/classroom-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.locator('[data-cr=back]').click();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no mobile horizontal overflow');
 await page.screenshot({path:'/workspace/scratch/a73c6d3205e6/classroom-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: guest gate, create, assignment picker, submit, XSS escaping, questions, release, teacher/student UI, mobile layout');
}finally{await browser.close();}
