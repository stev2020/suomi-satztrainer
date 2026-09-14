-- Integration tests use temporary users and roll back every change.
begin;
create temporary table role_test_ids(k text primary key,v uuid);
insert into role_test_ids values('owner',gen_random_uuid()),('teacher',gen_random_uuid()),('student',gen_random_uuid()),('outsider',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from role_test_ids;
insert into public.profiles(user_id,username,recovery_token_hash) select v,'role_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from role_test_ids;
grant all on role_test_ids to authenticated;
set local role authenticated;
do $$
declare o uuid; t uuid; s uuid; x uuid; rid uuid; other_room uuid; aid uuid; code text; v jsonb; op text;
begin
 select i.v into o from role_test_ids i where k='owner';
 select i.v into t from role_test_ids i where k='teacher';
 select i.v into s from role_test_ids i where k='student';
 select i.v into x from role_test_ids i where k='outsider';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create','{"name":"Role test"}'); rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid)); code:=v->>'code';
 assert v->>'owner'='true' and v->>'teacher'='true','owner retains teacher rights';
 v:=public.classroom_api('create','{"name":"Other room"}'); other_room:=(v->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher')); raise exception 'FAIL self promotion';
 exception when insufficient_privilege then null; end;
 begin
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Forbidden','items','[{"text":"Hei","translations":[{"text":"Hallo"}]}]'::jsonb)); raise exception 'FAIL student assignment';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',o,'role','student')); raise exception 'FAIL owner demotion';
 exception when insufficient_privilege then null; end;
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',x,'role','teacher')); raise exception 'FAIL nonmember';
 exception when raise_exception then if sqlerrm<>'Aktives Mitglied nicht gefunden.' then raise; end if; end;
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','admin')); raise exception 'FAIL invalid role';
 exception when raise_exception then if sqlerrm<>'Ungültige Rolle.' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->>'teacher'='true' and v->>'owner'='false' and v->>'code' is null,'teacher gets teaching rights only';
 assert v->>'teacher_count'='2' and v->>'member_count'='1','counts exclude teacher from expected submissions';
 assert exists(select 1 from jsonb_array_elements(public.classroom_api('list')) r where r->>'id'=rid::text and r->>'teacher'='true'),'list shows teacher';
 foreach op in array array['set_role','rotate','archive','remove','delete_room'] loop
 begin
 perform public.classroom_api(op,jsonb_build_object('room_id',rid,'user_id',s,'role','teacher','confirm_name','Role test')); raise exception 'FAIL teacher management: %',op;
 exception when insufficient_privilege then null; end;
 end loop;
 begin
 perform public.classroom_api('assign',jsonb_build_object('room_id',other_room,'title','Forbidden')); raise exception 'FAIL cross-room';
 exception when insufficient_privilege then null; end;
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Teacher task','items','[{"text":"Hei","translations":[{"text":"Hallo"}]}]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid)); aid:=(v->'assignments'->0->>'id')::uuid;
 perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','announcement','body','Hello class','request_id',gen_random_uuid(),'file_ids','[]'::jsonb));
 v:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid)); assert v->'posts'->0->>'teacher'='true','teacher stream badge';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->'submissions'->0->>'author' is not null,'teacher sees submissions';
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','student'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->>'teacher'='false' and jsonb_array_length(v->'assignments'->0->'submissions')=0,'demotion immediately removes private submission access';
 begin
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid)); raise exception 'FAIL demoted release';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform public.classroom_api('leave',jsonb_build_object('room_id',rid));
 perform public.classroom_api('join',jsonb_build_object('code',code));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid)); assert v->>'teacher'='false','rejoin does not restore teacher';
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 perform public.classroom_api('remove',jsonb_build_object('room_id',rid,'user_id',t));
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher')); raise exception 'FAIL blocked promotion';
 exception when raise_exception then if sqlerrm<>'Aktives Mitglied nicht gefunden.' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',t::text,true);
 begin
 perform public.classroom_api('room',jsonb_build_object('room_id',rid)); raise exception 'FAIL blocked teacher';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',x::text,true);
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',s,'role','teacher')); raise exception 'FAIL outsider promotion';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 begin
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',s,'role','teacher')); raise exception 'FAIL archived promotion';
 exception when raise_exception then if sqlerrm<>'Dieser Klassenraum ist archiviert.' then raise; end if; end;
end $$;
reset role;
select 'PASS: teacher assignment, role boundaries, room isolation, counts, privacy, revocation, removal, leave and archive' as result;
rollback;
