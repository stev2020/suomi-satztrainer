-- Run after classroom_direction; all fixture data is rolled back.
begin;
create temporary table direction_test_users(k text primary key,v uuid);
insert into direction_test_users values('owner',gen_random_uuid()),('anna',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from direction_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'dir_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from direction_test_users;
grant all on direction_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; s uuid; rid uuid; aid uuid; bid uuid; code text; v jsonb;
 one jsonb:='[{"text":"Hei","translations":[{"text":"Hallo"}]}]';
begin
 select i.v into o from direction_test_users i where k='owner';
 select i.v into s from direction_test_users i where k='anna';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Direction test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 -- Without a direction a package is German → Finnish as before.
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Alt','items',one));
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Neu','items',one,'direction','fi-de'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select (x->>'id')::uuid into aid from jsonb_array_elements(v->'assignments') x where x->>'title'='Alt' and x->>'direction'='de-fi';
 select (x->>'id')::uuid into bid from jsonb_array_elements(v->'assignments') x where x->>'title'='Neu' and x->>'direction'='fi-de';
 assert aid is not null and bid is not null,'default and chosen direction are returned';
 begin perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Falsch','items',one,'direction','sv-de'));raise exception 'FAIL unknown direction';
 exception when raise_exception then if sqlerrm<>'Unbekannte Übersetzungsrichtung.' then raise;end if;end;
 -- The direction changes while nobody answered; the title alone keeps it.
 perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Alt','direction','fi-de'));
 perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Alt, neu benannt'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert (select x->>'direction' from jsonb_array_elements(v->'assignments') x where x->>'id'=aid::text)='fi-de','direction changed and kept';
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Alt','direction','xx'));raise exception 'FAIL unknown direction on update';
 exception when raise_exception then if sqlerrm<>'Unbekannte Übersetzungsrichtung.' then raise;end if;end;
 -- After a submission the direction is fixed.
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',bid,'answers','["Hallo"]'::jsonb));
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',bid,'title','Neu','direction','de-fi'));raise exception 'FAIL direction after submission';
 exception when raise_exception then if sqlerrm<>'Die Richtung lässt sich nur ändern, solange es keine Abgaben und keine Fragen gibt.' then raise;end if;end;
 perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',bid,'title','Neu, umbenannt','direction','fi-de'));
end $test$;
reset role;
select 'PASS: default direction, chosen direction, validation, change before answers, fixed after a submission' as result;
rollback;
