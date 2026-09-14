begin;
create temporary table name_test_ids(k text primary key,v uuid);
insert into name_test_ids values('owner',gen_random_uuid()),('student',gen_random_uuid()),('other',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from name_test_ids;
insert into public.profiles(user_id,username,recovery_token_hash) select v,'name_'||k,repeat('a',64) from name_test_ids;
grant all on name_test_ids to authenticated;
set local role authenticated;
do $$
declare o uuid; s uuid; x uuid; rid uuid; second uuid; code text; v jsonb; post uuid; aid uuid; bad jsonb;
begin
 select i.v into o from name_test_ids i where k='owner';
 select i.v into s from name_test_ids i where k='student';
 select i.v into x from name_test_ids i where k='other';
 perform set_config('request.jwt.claim.sub',o::text,true);
 foreach bad in array array['{}'::jsonb,'{"display_name":"   "}','{"display_name":null}','{"display_name":42}',jsonb_build_object('display_name',repeat('x',81))] loop
   begin
     perform public.classroom_api('create',bad||'{"name":"Invalid name"}'::jsonb);
     raise exception 'FAIL invalid name accepted';
   exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
 end loop;
 v:=public.classroom_api('create','{"name":"First room","display_name":"  Anna Müller  "}');rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 assert v->'members'->0->>'name'='Anna Müller','owner name trimmed';
 assert v->'members'->0->>'own'='true','owner can edit self';
 v:=public.classroom_api('create','{"name":"Second room","display_name":"Frau Müller"}');second:=(v->>'id')::uuid;
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Namensprüfung','items','[{"text":"Hei","translations":[{"text":"Hallo"}]}]'::jsonb));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',s::text,true);
 begin
   perform public.classroom_api('join',jsonb_build_object('code',code));raise exception 'FAIL missing join name';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Leo'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'members'->1->>'own'='true','student can edit self';
 assert v->'members'->0->>'own'='false','student cannot edit owner';
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','Frage'));
 v:=public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','post','body','Hallo!'));post:=(v->>'id')::uuid;
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',post,'body','Antwort'));
 -- Supplied foreign user ID cannot select whose name is edited.
 perform public.classroom_api('rename',jsonb_build_object('room_id',rid,'user_id',o,'display_name','Léonie <3'));
 v:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert v->'posts'->0->>'author'='Léonie <3','post name updates';
 assert v->'posts'->0->'replies'->0->>'author'='Léonie <3','reply name updates';
 perform set_config('request.jwt.claim.sub',x::text,true);
 begin
   perform public.classroom_api('rename',jsonb_build_object('room_id',rid,'display_name','Intruder'));raise exception 'FAIL outsider rename';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'members'->0->>'name'='Anna Müller','foreign user_id ignored';
 assert v->'assignments'->0->'submissions'->0->>'author'='Léonie <3','submission name updates';
 assert v->'assignments'->0->'submissions'->0->>'author_id'=s::text,'submission matched by ID';
 assert v->'assignments'->0->'messages'->0->>'author'='Léonie <3','assignment message name updates';
 perform public.classroom_api('rename',jsonb_build_object('room_id',rid,'display_name','Anna'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',second));
 assert v->'members'->0->>'name'='Frau Müller','other room unchanged';

 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 perform public.classroom_api('rename',jsonb_build_object('room_id',rid,'display_name','Anna Neu'));
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('leave',jsonb_build_object('room_id',rid));
 begin
   perform public.classroom_api('rename',jsonb_build_object('room_id',rid,'display_name','Gone'));raise exception 'FAIL former member rename';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert v->'posts'->0->>'author'='Léonie <3','former author retains room name';
end $$;
reset role;
do $$ begin assert (select username from public.profiles where user_id=(select v from name_test_ids where k='owner'))='name_owner','login unchanged'; end $$;
rollback;
