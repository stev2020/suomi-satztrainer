-- Run after classroom_avatars; all fixture data is rolled back.
begin;
create temporary table avatar_test_users(k text primary key,v uuid,meta jsonb);
insert into avatar_test_users values
 ('owner',gen_random_uuid(),'{"username":"o","avatar":"kurki","nickname":"Olli"}'),
 ('anna',gen_random_uuid(),'{"username":"a","avatar":"sinitiainen"}'),
 ('evil',gen_random_uuid(),'{"username":"e","avatar":"<svg onload=alert(1)>"}'),
 ('plain',gen_random_uuid(),null);
insert into auth.users(id,aud,role,raw_user_meta_data) select v,'authenticated','authenticated',meta from avatar_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'avatar_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from avatar_test_users;
grant all on avatar_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; a uuid; e uuid; p uuid; rid uuid; code text; v jsonb; aid uuid; pid uuid; m jsonb;
begin
 select i.v into o from avatar_test_users i where k='owner';
 select i.v into a from avatar_test_users i where k='anna';
 select i.v into e from avatar_test_users i where k='evil';
 select i.v into p from avatar_test_users i where k='plain';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Avatar test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 perform set_config('request.jwt.claim.sub',a::text,true);perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));
 perform set_config('request.jwt.claim.sub',e::text,true);perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Eve'));
 perform set_config('request.jwt.claim.sub',p::text,true);perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Paul'));

 -- Members: known birds are delivered, everything else is null (never the raw value).
 perform set_config('request.jwt.claim.sub',a::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert (select x->>'avatar' from jsonb_array_elements(v->'members') x where x->>'name'='Owner')='kurki','owner bird';
 assert (select x->>'avatar' from jsonb_array_elements(v->'members') x where x->>'name'='Anna')='sinitiainen','own bird';
 assert (select x->'avatar' from jsonb_array_elements(v->'members') x where x->>'name'='Eve')='null'::jsonb,'unknown value is dropped';
 assert (select x->'avatar' from jsonb_array_elements(v->'members') x where x->>'name'='Paul')='null'::jsonb,'no metadata, no bird';
 assert v::text not like '%onload%','raw metadata never leaves the database';
 assert v::text not like '%Olli%','nickname is not delivered to the room';

 -- Stream: posts and replies carry the author's bird.
 select public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','post','body','Hei kaikki'))->>'id' into pid;
 perform set_config('request.jwt.claim.sub',e::text,true);
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',pid,'body','Moi'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',pid,'body','Tervetuloa'));
 v:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert v->'posts'->0->>'avatar'='sinitiainen','post bird';
 assert (select x->'avatar' from jsonb_array_elements(v->'posts'->0->'replies') x where x->>'author'='Eve')='null'::jsonb,'reply without bird';
 assert (select x->>'avatar' from jsonb_array_elements(v->'posts'->0->'replies') x where x->>'author'='Owner')='kurki','reply bird';

 -- Assignments: discussion messages carry the bird; submissions stay anonymous for students.
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Avatar','items',jsonb_build_array(jsonb_build_object('text','Hei','translations',jsonb_build_array(jsonb_build_object('text','Hallo'))))));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',a::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers',jsonb_build_array('Hallo')));
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',aid,'item_index',0,'body','Frage'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform set_config('request.jwt.claim.sub',p::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->'messages'->0->>'avatar'='sinitiainen','message bird';
 m:=v->'assignments'->0->'submissions'->0;
 assert m is not null and not (m ? 'avatar') and m->'author'='null'::jsonb,'released submissions stay anonymous';
end $test$;
select 'PASS: birds for members, posts, replies and messages; unknown values dropped; submissions stay anonymous' as result;
rollback;
