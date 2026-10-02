-- Run after classroom_seen; all fixture data is rolled back.
begin;
create temporary table seen_test_users(k text primary key,v uuid);
insert into seen_test_users values('owner',gen_random_uuid()),('anna',gen_random_uuid()),('outsider',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from seen_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'seen_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from seen_test_users;
grant all on seen_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; s uuid; x uuid; rid uuid; code text; v jsonb; n integer;
begin
 select i.v into o from seen_test_users i where k='owner';
 select i.v into s from seen_test_users i where k='anna';
 select i.v into x from seen_test_users i where k='outsider';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Seen test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));
 v:=public.classroom_api('list','{}');
 assert v->0 ? 'seen' and v->0->>'seen' is null,'nothing seen yet';
 -- The stamp is stored per account, moves forward only and never into the future.
 perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2026-01-02T10:00:00Z'));
 v:=public.classroom_api('list','{}');
 assert (v->0->>'seen')::timestamptz='2026-01-02T10:00:00Z','stamp is returned';
 perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2026-01-01T10:00:00Z'));
 v:=public.classroom_api('list','{}');
 assert (v->0->>'seen')::timestamptz='2026-01-02T10:00:00Z','an older stamp changes nothing';
 perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2999-01-01T00:00:00Z'));
 v:=public.classroom_api('list','{}');
 assert (v->0->>'seen')::timestamptz<=now(),'a stamp from the future is cut to now';
 -- Every account has its own stamp; many calls do not hit the limit for changes.
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('list','{}');
 assert v->0->>'seen' is null,'the owner has an own stamp';
 for n in 1..40 loop perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2026-01-03T10:00:00Z')); end loop;
 v:=public.classroom_api('rename',jsonb_build_object('room_id',rid,'display_name','Owner'));
 assert v->>'error' is null,'seen does not use up the limit for changes';
 -- Works in an archived room; outsiders are refused.
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2026-01-04T10:00:00Z'));
 v:=public.classroom_api('list','{}');
 assert (v->0->>'seen')::timestamptz='2026-01-04T10:00:00Z','archived rooms can be marked as seen';
 perform set_config('request.jwt.claim.sub',x::text,true);
 begin perform public.classroom_api('seen',jsonb_build_object('room_id',rid,'at','2026-01-04T10:00:00Z'));raise exception 'FAIL outsider';
 exception when insufficient_privilege then null;end;
end $test$;
reset role;
do $$ begin
 assert not has_table_privilege('authenticated','classroom_private.seen','select') and (select relrowsecurity from pg_class where oid='classroom_private.seen'::regclass),'no direct table access';
end $$;
select 'PASS: stamp per account, forward only, not in the future, no change limit, archived rooms, outsiders refused' as result;
rollback;
