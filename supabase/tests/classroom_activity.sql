-- Run after classroom_activity; all fixture data is rolled back.
begin;
create temporary table activity_test_users(k text primary key,v uuid);
insert into activity_test_users values('owner',gen_random_uuid()),('anna',gen_random_uuid()),('mika',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from activity_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'act_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from activity_test_users;
grant all on activity_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; s1 uuid; s2 uuid; rid uuid; other uuid; aid uuid; sid uuid; code text; v jsonb; r jsonb; before timestamptz;
 one jsonb:='[{"text":"Hei","translations":[{"text":"Hallo"}]}]';
begin
 select i.v into o from activity_test_users i where k='owner';
 select i.v into s1 from activity_test_users i where k='anna';
 select i.v into s2 from activity_test_users i where k='mika';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Activity test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('create',jsonb_build_object('name','Quiet room','display_name','Owner'));other:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 perform set_config('request.jwt.claim.sub',s1::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));
 perform set_config('request.jwt.claim.sub',s2::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Mika'));
 -- An empty room has no activity and no open tasks.
 v:=public.classroom_api('list','{}');
 assert jsonb_array_length(v)=1 and v->0->>'activity' is null and v->0->>'open_tasks'='0','empty room';
 -- A new package: activity and an open task for the students, neither for its creator.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Runde','items',one));
 v:=public.classroom_api('list','{}');
 select x into r from jsonb_array_elements(v) x where x->>'id'=rid::text;
 assert r->>'activity' is null and r->>'open_tasks'='0','own package is no news for the creator';
 assert (select x->>'activity' from jsonb_array_elements(v) x where x->>'id'=other::text) is null,'other rooms stay quiet';
 perform set_config('request.jwt.claim.sub',s1::text,true);
 v:=public.classroom_api('list','{}');
 assert v->0->>'activity' is not null and v->0->>'open_tasks'='1','new package is news and an open task';
 before:=(v->0->>'activity')::timestamptz;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 -- Handing in closes the task; the creator sees the submission as news, Mika does not.
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 v:=public.classroom_api('list','{}');
 assert v->0->>'open_tasks'='0' and (v->0->>'activity')::timestamptz=before,'own submission closes the task and is no news';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('list','{}');
 select x into r from jsonb_array_elements(v) x where x->>'id'=rid::text;
 assert r->>'activity' is not null,'creator is told about a submission';
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));sid:=(v->'assignments'->0->'submissions'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',s2::text,true);
 v:=public.classroom_api('list','{}');
 assert (v->0->>'activity')::timestamptz=before and v->0->>'open_tasks'='1','another student is not told about a submission';
 -- A comment and a post by somebody else are news; the own post is not.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sid,'item_index',0,'body','Gut!'));
 perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'request_id',gen_random_uuid(),'kind','post','body','Hallo zusammen','file_ids','[]'::jsonb));
 v:=public.classroom_api('list','{}');
 select x into r from jsonb_array_elements(v) x where x->>'id'=rid::text;
 assert (r->>'activity')::timestamptz=before,'own comment and own post are no news for their author';
 perform set_config('request.jwt.claim.sub',s1::text,true);
 v:=public.classroom_api('list','{}');
 assert (v->0->>'activity')::timestamptz>before,'a post by somebody else is news';
 -- Teachers have no open tasks; released and archived packages are not open.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',s2,'role','teacher'));
 perform set_config('request.jwt.claim.sub',s2::text,true);
 v:=public.classroom_api('list','{}');
 assert v->0->>'open_tasks'='0','teachers have no open tasks';
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',s2,'role','student'));
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform set_config('request.jwt.claim.sub',s2::text,true);
 v:=public.classroom_api('list','{}');
 assert v->0->>'open_tasks'='0','a released package is not open';
end $test$;
reset role;
select 'PASS: open tasks, activity from packages, submissions, comments and posts of others, nothing from own actions, teachers and released packages' as result;
rollback;
