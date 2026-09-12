-- Integration and authorization test. All fixture records are rolled back.
begin;
create temporary table classroom_test_ids(k text primary key, v uuid);
insert into classroom_test_ids values('teacher',gen_random_uuid()),('student',gen_random_uuid()),('outsider',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from classroom_test_ids;
insert into public.profiles(user_id,username,recovery_token_hash) select v,'test_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from classroom_test_ids;
grant all on classroom_test_ids to authenticated;
set local role authenticated;
do $$
declare t uuid; s uuid; o uuid; rid uuid; aid uuid; sid uuid; code text; v jsonb;
begin
 select x.v into t from classroom_test_ids x where k='teacher';
 select x.v into s from classroom_test_ids x where k='student';
 select x.v into o from classroom_test_ids x where k='outsider';
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('create','{"name":"Testklasse"}');rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 assert v->>'teacher'='true','creator is teacher';
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Testaufgabe','items','[{"id":1,"text":"Hei.","translations":[{"text":"Hallo."}]}]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin
   perform public.classroom_api('room',jsonb_build_object('room_id',rid));raise exception 'FAIL outsider read';
 exception when insufficient_privilege then null;end;
 begin
   perform * from classroom_private.rooms;raise exception 'FAIL direct table access';
 exception when insufficient_privilege then null;end;
 v:=public.classroom_api('join','{"code":"invalid"}');assert v?'error','invalid code rejected';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->>'teacher'='false' and v->>'code' is null,'student cannot see invitation code';
 begin
   perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));raise exception 'FAIL student release';
 exception when insufficient_privilege then null;end;
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei!"]'::jsonb));
 begin
   perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["changed"]'::jsonb));raise exception 'FAIL duplicate submit';
 exception when unique_violation then null;end;
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','Warum diese Form?'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'assignments'->0->'submissions')=0,'other submissions hidden before release';
 assert jsonb_array_length(v->'assignments'->0->'messages')=1,'members can read questions';
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->'submissions'->0->>'author' is not null,'teacher sees author';
 assert (v->'assignments'->0->>'submitted_count')::integer=1,'progress counts submissions';
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'assignments'->0->'submissions')=1,'released comparison visible';
 assert v->'assignments'->0->'submissions'->0->>'author' is null,'student author anonymized';
 sid:=(v->'assignments'->0->'submissions'->0->>'id')::uuid;
 perform public.classroom_api('react',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sid,'kind','helpful'));
 perform public.classroom_api('react',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sid,'kind','helpful'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert (v->'assignments'->0->'submissions'->0->'reactions'->>'helpful')::integer=1,'reaction not duplicated';
 begin
   perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["late"]'::jsonb));raise exception 'FAIL late submission';
 exception when raise_exception then if sqlerrm<>'Abgabe geschlossen.' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('remove',jsonb_build_object('room_id',rid,'user_id',s));
 perform set_config('request.jwt.claim.sub',s::text,true);
 begin
   perform public.classroom_api('room',jsonb_build_object('room_id',rid));raise exception 'FAIL blocked read';
 exception when insufficient_privilege then null;end;
 v:=public.classroom_api('join',jsonb_build_object('code',code));assert v?'error','blocked cannot rejoin';
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('rotate',jsonb_build_object('room_id',rid));
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('join',jsonb_build_object('code',code));assert v?'error','old code invalid';
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));assert v->>'archived'='true','archive readable';
 perform set_config('request.jwt.claim.sub','',true);
 begin
   perform public.classroom_api('list');raise exception 'FAIL no JWT';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.classroom_api('list');raise exception 'FAIL anonymous RPC';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: classroom workflow, role boundaries, privacy, release, reactions, removal, rotation, archive, anonymous denial' as result;
rollback;
