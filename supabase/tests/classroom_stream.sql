begin;
create temporary table stream_test_users(k text primary key,id uuid default gen_random_uuid());
insert into stream_test_users(k) values('teacher'),('student'),('peer'),('outsider');
insert into auth.users(id,aud,role) select id,'authenticated','authenticated' from stream_test_users;
insert into public.profiles(user_id,username,recovery_token_hash) select id,'stream_'||substr(replace(id::text,'-',''),1,20),repeat('a',64) from stream_test_users;
grant select on stream_test_users to authenticated;
set local role authenticated;
do $$
declare t uuid;s uuid;peer uuid;o uuid;rid uuid;otherroom uuid;pid uuid;fid uuid;j jsonb;code text;request_id uuid:=gen_random_uuid();
begin
 select id into t from stream_test_users where k='teacher';select id into s from stream_test_users where k='student';select id into peer from stream_test_users where k='peer';select id into o from stream_test_users where k='outsider';
 perform set_config('request.jwt.claim.sub',t::text,true);
 j:=public.classroom_api('create','{"name":"Stream test"}');rid:=(j->>'id')::uuid;
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=j->>'code';
 j:=public.classroom_api('create','{"name":"Other stream"}');otherroom:=(j->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 j:=public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'request_id',request_id,'kind','question','body','Wie sagt man Hallo?'));pid:=(j->>'id')::uuid;
 perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'request_id',request_id,'kind','question','body','Wie sagt man Hallo?'));
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(j->'posts')=1,'retry creates only one post';
 assert (j->>'open_questions')::int=1,'open count';
 assert j->'posts'->0->>'author' is not null,'author visible';
 assert not (j->'posts'->0 ? 'user_id'),'no raw account ids';
 begin
  perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','announcement','body','bad'));raise exception 'TEST student announcement allowed';
 exception when insufficient_privilege then null;end;
 j:=public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','Hallo.txt','mime','text/plain','size',5));fid:=(j->>'id')::uuid;
 assert classroom_private.stream_file_access(fid::text,true),'author can upload reserved path';
 begin
  perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','post','body','missing upload','file_ids',jsonb_build_array(fid)));raise exception 'TEST missing file accepted';
 exception when raise_exception then if sqlerrm like 'TEST%' then raise;end if;end;
 perform set_config('request.jwt.claim.sub',peer::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code));
 assert not classroom_private.stream_file_access(fid::text,false),'peer cannot read unpublished file';
 assert not classroom_private.stream_file_access(fid::text,true),'peer cannot overwrite reservation';
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',pid,'body','Hei!'));
 begin
  perform public.classroom_api('stream_resolve',jsonb_build_object('room_id',rid,'post_id',pid,'resolved',true));raise exception 'TEST peer resolve allowed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.classroom_api('stream_pin',jsonb_build_object('room_id',rid,'post_id',pid,'pinned',true));raise exception 'TEST peer pin allowed';
 exception when insufficient_privilege then null;end;
 begin
  perform public.classroom_api('stream_delete',jsonb_build_object('room_id',rid,'post_id',pid));raise exception 'TEST peer delete allowed';
 exception when insufficient_privilege then null;end;
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',j->'posts'->0->'replies'->0->>'id','body','Danke!'));
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert j->'posts'->0->'replies'->1->>'reply_to_id'=j->'posts'->0->'replies'->0->>'id','direct reply target preserved';
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',j->'posts'->0->'replies'->1->>'id','body','Gern!'));
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert j->'posts'->0->'replies'->2->>'reply_to_id'=j->'posts'->0->'replies'->1->>'id','deeper reply target preserved';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('stream_resolve',jsonb_build_object('room_id',rid,'post_id',pid,'resolved',true));
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));assert (j->>'open_questions')::int=0,'author resolves';assert jsonb_array_length(j->'posts'->0->'replies')=3,'all may answer';
 perform set_config('request.jwt.claim.sub',o::text,true);
 begin
  perform public.classroom_api('stream_list',jsonb_build_object('room_id',rid));raise exception 'TEST outsider access';
 exception when insufficient_privilege then null;end;
 assert not classroom_private.stream_file_access(fid::text,false),'outsider file denied';
 perform set_config('request.jwt.claim.sub',s::text,true);
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('classroom-stream',fid::text,s::text,'{"size":5,"mimetype":"text/plain"}');
 perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','post','body','Datei','file_ids',jsonb_build_array(fid)));
 assert not classroom_private.stream_file_access(fid::text,true),'published uploads immutable';
 perform set_config('request.jwt.claim.sub',peer::text,true);
 assert classroom_private.stream_file_access(fid::text,false),'peer reads published file';
 assert (select count(*)=1 from storage.objects where bucket_id='classroom-stream' and name=fid::text),'storage read policy permits member';
 perform set_config('request.jwt.claim.sub',o::text,true);
 assert (select count(*)=0 from storage.objects where bucket_id='classroom-stream' and name=fid::text),'storage read policy rejects outsider';
 perform set_config('request.jwt.claim.sub',t::text,true);
 begin
  perform public.classroom_api('stream_reply',jsonb_build_object('room_id',otherroom,'post_id',pid,'body','cross room'));raise exception 'TEST cross-room reply';
 exception when raise_exception then if sqlerrm like 'TEST%' then raise;end if;end;
 perform public.classroom_api('stream_resolve',jsonb_build_object('room_id',rid,'post_id',pid,'resolved',false));
 perform public.classroom_api('stream_pin',jsonb_build_object('room_id',rid,'post_id',pid,'pinned',true));
 perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','announcement','body','Willkommen!'));
 perform public.classroom_api('remove',jsonb_build_object('room_id',rid,'user_id',s));
 perform set_config('request.jwt.claim.sub',s::text,true);
 assert not classroom_private.stream_file_access(fid::text,false),'blocked author loses attachment access';
 begin
  perform public.classroom_api('stream_list',jsonb_build_object('room_id',rid));raise exception 'TEST blocked read';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('stream_delete',jsonb_build_object('room_id',rid,'post_id',pid));
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));assert exists(select 1 from jsonb_array_elements(j->'posts') x where (x->>'deleted')::boolean and jsonb_array_length(x->'replies')=3),'delete preserves replies';
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 begin
  perform public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'kind','post','body','closed'));raise exception 'TEST archived write';
 exception when raise_exception then if sqlerrm like 'TEST%' then raise;end if;end;
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));assert jsonb_array_length(j->'posts')=3,'archive readable';
 perform public.classroom_api('delete_room',jsonb_build_object('room_id',rid,'confirm_name','Stream test'));
 assert not classroom_private.stream_file_access(fid::text,false),'deleted room file denied';
end $$;
rollback;
