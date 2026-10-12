begin;
create temporary table invite_ids(k text primary key,v uuid);
insert into invite_ids values('owner',gen_random_uuid()),('helper',gen_random_uuid()),('anna',gen_random_uuid()),('ben',gen_random_uuid()),('cleo',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from invite_ids;
insert into public.profiles(user_id,username,recovery_token_hash) select v,'invite_'||k,repeat('a',64) from invite_ids;
grant all on invite_ids to authenticated;
set local role authenticated;
do $test$
declare o uuid; h uuid; a uuid; b uuid; c uuid; rid uuid; open_room uuid; code text; open_code text; v jsonb;
begin
 select i.v into o from invite_ids i where k='owner';select i.v into h from invite_ids i where k='helper';
 select i.v into a from invite_ids i where k='anna';select i.v into b from invite_ids i where k='ben';select i.v into c from invite_ids i where k='cleo';
 perform set_config('request.jwt.claim.sub',o::text,true);
 -- Without 'approval' a room stays open as before (old clients, existing rooms).
 v:=public.classroom_api('create','{"name":"Offener Raum","display_name":"Owner"}');open_room:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',open_room));open_code:=v->>'code';
 assert v->>'approval'='false','default: no approval';
 v:=public.classroom_api('create','{"name":"Freigaberaum","display_name":"Owner","approval":true}');rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 assert v->>'approval'='true' and v->'requests'='[]'::jsonb,'approval room';
 v:=public.classroom_api('invite_info',jsonb_build_object('code',lower(code)));
 assert v->>'member'='true' and (v->>'id')::uuid=rid,'owner sees own room via link';

 -- Helper joins the open room immediately, becomes teacher in the approval room later.
 perform set_config('request.jwt.claim.sub',h::text,true);
 v:=public.classroom_api('join',jsonb_build_object('code',open_code,'display_name','Helper'));
 assert (v->>'id')::uuid=open_room and v->>'pending' is null,'open room: joined directly';

 -- Anna follows the link: preview, then request.
 perform set_config('request.jwt.claim.sub',a::text,true);
 v:=public.classroom_api('invite_info',jsonb_build_object('code',code));
 assert v->>'name'='Freigaberaum' and v->>'teacher'='Owner' and v->>'approval'='true' and v->>'member'='false' and v->'id'='null'::jsonb and v->>'pending'='false','preview';
 v:=public.classroom_api('invite_info','{"code":"FFFFFFFFFFFFFFFF"}');
 assert v->>'error' like 'Dieser Einladungslink%','unknown code';
 v:=public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));
 assert v->>'pending'='true' and v->>'name'='Freigaberaum' and v->'id' is null,'request instead of membership';
 v:=public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna K.'));
 assert v->>'pending'='true','second click keeps one request';
 v:=public.classroom_api('invite_info',jsonb_build_object('code',code));assert v->>'pending'='true','preview knows the request';
 v:=public.classroom_api('list','{}');
 assert jsonb_array_length(v)=1 and v->0->>'pending'='true' and v->0->>'name'='Freigaberaum','pending room in list';
 begin perform public.classroom_api('room',jsonb_build_object('room_id',rid));raise exception 'FAIL pending read room';
 exception when insufficient_privilege then null; end;
 begin perform public.classroom_api('stream_list',jsonb_build_object('room_id',rid));raise exception 'FAIL pending read stream';
 exception when insufficient_privilege then null; when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;

 perform set_config('request.jwt.claim.sub',b::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Ben'));
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Cleo'));
 perform public.classroom_api('cancel_request',jsonb_build_object('room_id',rid));
 v:=public.classroom_api('list','{}');assert v='[]'::jsonb,'cancelled request gone';

 -- Owner sees the requests (with activity) and makes the helper a teacher.
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('list','{}');
 assert (select (x->>'requests')::int from jsonb_array_elements(v) x where (x->>'id')::uuid=rid)=2,'request count for teachers';
 assert (select x->>'activity' from jsonb_array_elements(v) x where (x->>'id')::uuid=rid) is not null,'requests count as activity';
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'requests')=2 and v->'requests'->0->>'name'='Anna K.' and (v->'requests'->0->>'id')::uuid=a,'requests in room';
 -- Helper becomes member + teacher through the open-room flow: request in approval room, owner approves, set_role.
 perform set_config('request.jwt.claim.sub',h::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Helper'));
 begin perform public.classroom_api('approve',jsonb_build_object('room_id',rid,'user_id',a));raise exception 'FAIL non-member approves';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('approve',jsonb_build_object('room_id',rid,'user_id',h));
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',h,'role','teacher'));
 perform set_config('request.jwt.claim.sub',h::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'requests')=2 and v->'code'='null'::jsonb,'teacher sees requests, not the code';
 begin perform public.classroom_api('set_approval',jsonb_build_object('room_id',rid,'approval',false));raise exception 'FAIL teacher toggles';
 exception when insufficient_privilege then null; end;
 perform public.classroom_api('approve',jsonb_build_object('room_id',rid,'user_id',a));
 perform public.classroom_api('decline',jsonb_build_object('room_id',rid,'user_id',b));
 begin perform public.classroom_api('approve',jsonb_build_object('room_id',rid,'user_id',b));raise exception 'FAIL approve twice';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'requests'='[]'::jsonb,'requests handled';
 assert exists(select 1 from jsonb_array_elements(v->'members') x where x->>'name'='Anna K.' and x->>'role'='student'),'approved with requested name';
 -- A student sees no requests.
 perform set_config('request.jwt.claim.sub',a::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));assert v->'requests'='[]'::jsonb and v->>'approval'='true','students see no requests';
 v:=public.classroom_api('list','{}');assert v->0->>'pending' is null and (v->0->>'requests')::int=0,'anna now member';

 -- Removed members can neither request nor be approved; owner turns approval off -> direct join.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('remove',jsonb_build_object('room_id',rid,'user_id',a));
 perform set_config('request.jwt.claim.sub',a::text,true);
 v:=public.classroom_api('join',jsonb_build_object('code',code,'display_name','Anna'));assert v->>'error' like 'Beitritt nicht möglich%','blocked';
 v:=public.classroom_api('invite_info',jsonb_build_object('code',code));assert v->>'error' like 'Beitritt nicht möglich%','blocked preview';
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin perform public.classroom_api('set_approval',jsonb_build_object('room_id',rid,'approval','nein'));raise exception 'FAIL bad value';
 exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; end;
 perform public.classroom_api('set_approval',jsonb_build_object('room_id',rid,'approval',false));
 perform set_config('request.jwt.claim.sub',b::text,true);
 v:=public.classroom_api('join',jsonb_build_object('code',code,'display_name','Ben'));
 assert (v->>'id')::uuid=rid,'approval off: direct join';
 -- Archived rooms: no preview, pending requests disappear from the list.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_approval',jsonb_build_object('room_id',rid,'approval',true));
 perform set_config('request.jwt.claim.sub',c::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Cleo'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 perform set_config('request.jwt.claim.sub',c::text,true);
 v:=public.classroom_api('list','{}');assert v='[]'::jsonb,'archived: request hidden';
 v:=public.classroom_api('invite_info',jsonb_build_object('code',code));assert v->>'error' is not null,'archived: no preview';
end $test$;
select 'PASS: invitation preview, join requests, approve/decline by teachers, approval switch for the owner' as result;
rollback;
