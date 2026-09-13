-- All fixtures and deletions are rolled back. No existing classroom is touched.
begin;
create temporary table delete_test_ids(k text primary key,v uuid default gen_random_uuid());
insert into delete_test_ids(k) values('owner'),('student'),('outsider'),('room'),('archived'),('other_room'),('assignment'),('submission');
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from delete_test_ids where k in ('owner','student','outsider');
insert into public.profiles(user_id,username,recovery_token_hash) select v,'del_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from delete_test_ids where k in ('owner','student','outsider');
insert into public.learning_state(user_id,state) select v,'{"daily":{"test":1}}'::jsonb from delete_test_ids where k in ('owner','student');
insert into classroom_private.rooms(id,owner_id,name,archived)
select v,(select v from delete_test_ids where k='owner'),'Delete test',k='archived' from delete_test_ids where k in ('room','archived');
insert into classroom_private.rooms(id,owner_id,name) select v,(select v from delete_test_ids where k='outsider'),'Other room' from delete_test_ids where k='other_room';
insert into classroom_private.members(room_id,user_id) values((select v from delete_test_ids where k='room'),(select v from delete_test_ids where k='student'));
insert into classroom_private.assignments(id,room_id,title,items) values((select v from delete_test_ids where k='assignment'),(select v from delete_test_ids where k='room'),'Delete test','[{"text":"Hei.","translations":[{"text":"Hallo."}]}]');
insert into classroom_private.submissions(id,assignment_id,user_id,answers) values((select v from delete_test_ids where k='submission'),(select v from delete_test_ids where k='assignment'),(select v from delete_test_ids where k='student'),'["Hei!"]');
insert into classroom_private.messages(assignment_id,user_id,item_index,body) values((select v from delete_test_ids where k='assignment'),(select v from delete_test_ids where k='student'),0,'Question');
insert into classroom_private.reactions(submission_id,user_id,kind) values((select v from delete_test_ids where k='submission'),(select v from delete_test_ids where k='owner'),'helpful');
grant select on delete_test_ids to authenticated;
set local role authenticated;
do $$
declare rid uuid; u uuid; result jsonb;
begin
 select v into rid from delete_test_ids where k='room';
 for u in select v from delete_test_ids where k in ('student','outsider') loop
  perform set_config('request.jwt.claim.sub',u::text,true);
  begin
   perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Delete test'));
   raise exception 'FAIL non-owner delete';
  exception when insufficient_privilege then null;end;
 end loop;
 perform set_config('request.jwt.claim.sub',(select v::text from delete_test_ids where k='owner'),true);
 begin
  perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','wrong'));
  raise exception 'FAIL wrong confirmation';
 exception when raise_exception then if sqlerrm<>'Bitte den Raumnamen exakt eingeben.' then raise;end if;end;
 begin
  perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid));
  raise exception 'FAIL missing confirmation';
 exception when raise_exception then if sqlerrm<>'Bitte den Raumnamen exakt eingeben.' then raise;end if;end;
 result:=public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Delete test'));
 assert (result->>'deleted')::boolean,'owner can delete active room';
 select v into rid from delete_test_ids where k='archived';
 result:=public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Delete test'));
 assert (result->>'deleted')::boolean,'owner can delete archived room';
 perform set_config('request.jwt.claim.sub','',true);
 begin
  perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Delete test'));raise exception 'FAIL missing auth';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$ begin
 assert not exists(select 1 from classroom_private.rooms where id in (select v from delete_test_ids where k in ('room','archived'))),'rooms deleted';
 assert not exists(select 1 from classroom_private.members where room_id=(select v from delete_test_ids where k='room')),'members cascade';
 assert not exists(select 1 from classroom_private.assignments where id=(select v from delete_test_ids where k='assignment')),'assignments cascade';
 assert not exists(select 1 from classroom_private.submissions where id=(select v from delete_test_ids where k='submission')),'submissions cascade';
 assert not exists(select 1 from classroom_private.messages where assignment_id=(select v from delete_test_ids where k='assignment')),'messages cascade';
 assert not exists(select 1 from classroom_private.reactions where submission_id=(select v from delete_test_ids where k='submission')),'reactions cascade';
 assert exists(select 1 from classroom_private.rooms where id=(select v from delete_test_ids where k='other_room')),'other room preserved';
 assert (select count(*) from public.profiles where user_id in (select v from delete_test_ids))=3,'profiles preserved';
 assert (select count(*) from public.learning_state where user_id in (select v from delete_test_ids))=2,'private progress preserved';
end $$;
set local role anon;
do $$ begin
 begin perform public.classroom_api('delete_room','{}');raise exception 'FAIL anonymous deletion';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: owner-only delete, exact confirmation, active/archived rooms, all cascades, other room and private progress preserved, anonymous denial' as result;
rollback;
