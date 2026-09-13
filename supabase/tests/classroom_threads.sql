begin;
create temporary table thread_test_users(k text primary key,id uuid default gen_random_uuid());
insert into thread_test_users(k) values('teacher'),('student'),('outsider');
insert into auth.users(id,aud,role) select id,'authenticated','authenticated' from thread_test_users;
insert into public.profiles(user_id,username,recovery_token_hash) select id,'thread_'||substr(replace(id::text,'-',''),1,20),repeat('a',64) from thread_test_users;
grant select on thread_test_users to authenticated;
set local role authenticated;
do $$
declare t uuid;s uuid;o uuid;rid uuid;aid uuid;otheraid uuid;rootid uuid;replyid uuid;j jsonb;m jsonb;code text;
begin
 select id into t from thread_test_users where k='teacher';select id into s from thread_test_users where k='student';select id into o from thread_test_users where k='outsider';
 perform set_config('request.jwt.claim.sub',t::text,true);
 j:=public.classroom_api('create','{"name":"Thread test"}');rid:=(j->>'id')::uuid;
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=j->>'code';
 assert jsonb_array_length(j->'members')=1 and j->'members'->0->>'role'='teacher','creator listed';
 assert (j->>'member_count')::integer=0,'creator not counted as missing student';
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','First','items','[{"text":"Hei","translations":[{"text":"Hallo"}]},{"text":"Moi","translations":[{"text":"Hi"}]}]'::jsonb));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(j->'assignments'->0->>'id')::uuid;
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Other','items','[{"text":"Hei","translations":[{"text":"Hallo"}]}]'::jsonb));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));select (x->>'id')::uuid into otheraid from jsonb_array_elements(j->'assignments') x where x->>'title'='Other';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));assert jsonb_array_length(j->'members')=2,'student sees teacher and student';assert j->'members'->0->>'id' is null,'no account ids for student';
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','root'));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));select x into m from jsonb_array_elements(j->'assignments') x where x->>'id'=aid::text;rootid:=(m->'messages'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','teacher reply','parent_id',rootid));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));select x into m from jsonb_array_elements(j->'assignments') x where x->>'id'=aid::text;
 select (x->>'id')::uuid into replyid from jsonb_array_elements(m->'messages') x where x->>'body'='teacher reply';
 assert exists(select 1 from jsonb_array_elements(m->'messages') x where x->>'id'=replyid::text and x->>'parent_id'=rootid::text and (x->>'teacher')::boolean),'teacher reply linked';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','nested','parent_id',replyid));
 begin
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',otheraid,'item_index',0,'body','bad assignment','parent_id',rootid));raise exception 'FAIL cross assignment';
 exception when insufficient_privilege then null;end;
 begin
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',1,'body','bad sentence','parent_id',rootid));raise exception 'FAIL cross sentence';
 exception when insufficient_privilege then null;end;
 begin
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','bad parent','parent_id',gen_random_uuid()));raise exception 'FAIL unknown parent';
 exception when insufficient_privilege then null;end;
 perform public.classroom_api('delete_message',jsonb_build_object('room_id',rid,'assignment_id',aid,'message_id',replyid));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));select x into m from jsonb_array_elements(j->'assignments') x where x->>'id'=aid::text;
 assert exists(select 1 from jsonb_array_elements(m->'messages') x where x->>'id'=replyid::text and not (x->>'deleted')::boolean),'student cannot remove teacher reply';
 perform public.classroom_api('delete_message',jsonb_build_object('room_id',rid,'assignment_id',aid,'message_id',rootid));
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));select x into m from jsonb_array_elements(j->'assignments') x where x->>'id'=aid::text;
 assert jsonb_array_length(m->'messages')=3,'children preserved after removal';
 assert exists(select 1 from jsonb_array_elements(m->'messages') x where x->>'id'=rootid::text and (x->>'deleted')::boolean and x->>'body'='[Beitrag entfernt]'),'root redacted';
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','intruder','parent_id',rootid));raise exception 'FAIL outsider';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 begin
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','archived','parent_id',rootid));raise exception 'FAIL archive';
 exception when raise_exception then if sqlerrm<>'Dieser Klassenraum ist archiviert.' then raise;end if;end;
 -- Existing owner deletion must still cascade across the new self-reference.
 perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Thread test'));
end $$;
reset role;
select 'PASS: creator roster, teacher/student/nested replies, wrong assignment/sentence/parent blocked, outsider denied, removed-parent preservation, author moderation, archive, room deletion' as result;
rollback;
