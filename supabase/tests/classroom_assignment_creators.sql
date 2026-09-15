-- Run after classroom_assignment_creators; all fixture data is rolled back.
begin;
create temporary table assignment_test_users(k text primary key,v uuid);
insert into assignment_test_users values('owner',gen_random_uuid()),('teacher',gen_random_uuid()),('student',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from assignment_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'task_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from assignment_test_users;
grant all on assignment_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; t uuid; s uuid; rid uuid; aid uuid; second_id uuid; code text; v jsonb;
begin
 select i.v into o from assignment_test_users i where k='owner';
 select i.v into t from assignment_test_users i where k='teacher';
 select i.v into s from assignment_test_users i where k='student';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Assignment test','display_name','Owner'));
 rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Teacher'));
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Student'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Owner task','created_by',t,'items','[{"text":"Hei","translations":[{"text":"Hallo"}]}]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 aid:=(v->'assignments'->0->>'id')::uuid;
 assert v->'assignments'->0->>'own_assignment'='true','creator derives from auth, not payload';
 begin
  perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
  raise exception 'FAIL creator submission';
 exception when raise_exception then
  if sqlerrm<>'Der Ersteller reicht für die eigene Aufgabe keine Abgabe ein.' then raise;end if;
 end;
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'own_assignment'='false','other teacher is participant';
 assert jsonb_array_length(v->'assignments'->0->'submissions')=0,'no answers before own submission';
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'assignments'->0->'submissions')=2,'overview after own submission';
 assert v->'assignments'->0->>'submitted_count'='1','optional teacher work does not inflate student progress';
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Teacher task','items','[{"text":"Moi","translations":[{"text":"Hallo"}]}]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select (a->>'id')::uuid into second_id from jsonb_array_elements(v->'assignments') a where a->>'title'='Teacher task';
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',second_id,'answers','["Moi"]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert exists(select 1 from jsonb_array_elements(v->'assignments') a,jsonb_array_elements(a->'submissions') sub where a->>'id'=second_id::text and sub->>'own'='true'),'room owner can solve other teacher task';
end $test$;
reset role;
select 'PASS: creator identity, author rejection, teacher and owner participation, solution overview and student counts' as result;
rollback;
