-- Temporary fixtures only; every change is rolled back.
begin;
create temporary table account_delete_test(k text primary key,v uuid default gen_random_uuid());
insert into account_delete_test(k) values('owner'),('teacher'),('transfer_room'),('delete_room');
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from account_delete_test where k in ('owner','teacher');
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'acct_'||k,repeat('a',64) from account_delete_test where k in ('owner','teacher');
insert into public.learning_state(user_id,state)
 select v,'{"reviews":{"test":true}}'::jsonb from account_delete_test where k='owner';
insert into classroom_private.rooms(id,owner_id,name) values
 ((select v from account_delete_test where k='transfer_room'),(select v from account_delete_test where k='owner'),'Transfer room'),
 ((select v from account_delete_test where k='delete_room'),(select v from account_delete_test where k='owner'),'Delete room');
insert into classroom_private.members(room_id,user_id,role)
 values((select v from account_delete_test where k='transfer_room'),(select v from account_delete_test where k='teacher'),'teacher');
grant select on account_delete_test to authenticated;
set local role authenticated;
do $$
declare o uuid;t uuid;tr uuid;dr uuid;m jsonb;p jsonb;
begin
 select v into o from account_delete_test where k='owner';
 select v into t from account_delete_test where k='teacher';
 select v into tr from account_delete_test where k='transfer_room';
 select v into dr from account_delete_test where k='delete_room';
 perform set_config('request.jwt.claim.sub',o::text,true);
 m:=public.account_deletion_manifest();
 assert jsonb_array_length(m->'rooms')=2,'manifest lists every owned room';
 assert exists(select 1 from jsonb_array_elements(m->'rooms') r where r->>'id'=tr::text and jsonb_array_length(r->'teachers')=1),'active teacher offered';
 p:=public.account_prepare_deletion(jsonb_build_array(
   jsonb_build_object('room_id',tr,'new_owner_id',t),
   jsonb_build_object('room_id',dr,'new_owner_id',null)));
 assert jsonb_typeof(p->'storage_objects')='array','storage plan returned';
end $$;
reset role;
delete from auth.users where id=(select v from account_delete_test where k='owner');
do $$
declare t uuid;tr uuid;dr uuid;o uuid;
begin
 select v into o from account_delete_test where k='owner';
 select v into t from account_delete_test where k='teacher';
 select v into tr from account_delete_test where k='transfer_room';
 select v into dr from account_delete_test where k='delete_room';
 assert exists(select 1 from classroom_private.rooms where id=tr and owner_id=t),'room transferred atomically';
 assert not exists(select 1 from classroom_private.members where room_id=tr and user_id=t),'new owner membership normalized';
 assert not exists(select 1 from classroom_private.rooms where id=dr),'room without successor deleted';
 assert not exists(select 1 from public.profiles where user_id=o),'profile deleted';
 assert not exists(select 1 from public.learning_state where user_id=o),'learning state deleted';
 assert not exists(select 1 from account_private.deletion_transfers where user_id=o),'temporary plan deleted';
end $$;
select 'PASS: complete deletion with classroom transfer' as result;
rollback;
