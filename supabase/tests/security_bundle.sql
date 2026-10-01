-- Security bundle (20261001200000): read limit, package size, attachment names,
-- discard order, orphan list, session revocation, learning-state limits and
-- display names in the deletion manifest. All fixture records are rolled back.
begin;
create temporary table sb_ids(k text primary key, v uuid);
insert into sb_ids values('owner',gen_random_uuid()),('teacher',gen_random_uuid()),('student',gen_random_uuid()),('noprofile',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from sb_ids;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'sb_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from sb_ids where k<>'noprofile';
grant all on sb_ids to authenticated;

-- Only the service role may list orphans or end sessions.
set local role authenticated;
do $$ begin
 begin perform public.stream_orphan_objects(10); raise exception 'FAIL orphan list for authenticated';
 exception when insufficient_privilege then null; end;
 begin perform public.revoke_user_sessions(gen_random_uuid()); raise exception 'FAIL session revoke for authenticated';
 exception when insufficient_privilege then null; end;
end $$;

do $$
declare o uuid; t uuid; s uuid; rid uuid; fid uuid; j jsonb; code text; i integer; big jsonb;
begin
 select v into o from sb_ids where k='owner';
 select v into t from sb_ids where k='teacher';
 select v into s from sb_ids where k='student';
 perform set_config('request.jwt.claim.sub',o::text,true);
 j:=public.classroom_api('create','{"name":"Sicherheit","display_name":"Frau Lehrerin"}');rid:=(j->>'id')::uuid;
 code:=public.classroom_api('room',jsonb_build_object('room_id',rid))->>'code';
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Herr Kollege'));
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Schülerin'));
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));

 -- M8: co-teacher appears with the room display name, not the login name.
 j:=public.account_deletion_manifest();
 assert j->'rooms'->0->'teachers'->0->>'name'='Herr Kollege','manifest shows the display name';

 -- S4: assignment packages are limited to 40 KB.
 big:=jsonb_build_array(jsonb_build_object('id',1,'text',repeat('a',41000),'translations',jsonb_build_array(jsonb_build_object('text','b'))));
 begin perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Zu groß','items',big)); raise exception 'FAIL oversized package';
 exception when raise_exception then assert sqlerrm like '%zu groß%', sqlerrm; end;
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Passt','items','[{"id":1,"text":"Hei.","translations":[{"text":"Hallo."}]}]'::jsonb));

 -- M4: attachment name must match the MIME type and contain no path characters.
 perform set_config('request.jwt.claim.sub',s::text,true);
 begin perform public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','Arbeitsblatt.pdf.exe','mime','application/pdf','size',5)); raise exception 'FAIL wrong extension';
 exception when raise_exception then assert sqlerrm like '%passen nicht%', sqlerrm; end;
 begin perform public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','Lösung.html','mime','text/plain','size',5)); raise exception 'FAIL html as text';
 exception when raise_exception then assert sqlerrm like '%passen nicht%', sqlerrm; end;
 begin perform public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','../x.txt','mime','text/plain','size',5)); raise exception 'FAIL path in name';
 exception when raise_exception then assert sqlerrm like '%Dateiname%', sqlerrm; end;
 j:=public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','Foto.JPG','mime','image/jpeg','size',5));
 assert j ? 'id','upper-case matching extension accepted';
 j:=public.classroom_api('stream_reserve',jsonb_build_object('room_id',rid,'name','Notizen.txt','mime','text/plain','size',5));fid:=(j->>'id')::uuid;

 -- S3: a draft can only be discarded after its upload was removed.
 insert into storage.objects(bucket_id,name,owner_id,metadata) values('classroom-stream',fid::text,s::text,'{"size":5,"mimetype":"text/plain"}');
 begin perform public.classroom_api('stream_discard',jsonb_build_object('room_id',rid,'file_id',fid)); raise exception 'FAIL discard with object';
 exception when raise_exception then assert sqlerrm like '%zuerst%', sqlerrm; end;
 reset role; assert exists(select 1 from classroom_private.stream_files where id=fid),'row kept while object exists';
 delete from storage.objects where bucket_id='classroom-stream' and name=fid::text; set local role authenticated;
 perform public.classroom_api('stream_discard',jsonb_build_object('room_id',rid,'file_id',fid));
 reset role; assert not exists(select 1 from classroom_private.stream_files where id=fid),'discard after removal works'; set local role authenticated;

 -- S4: reads are limited to 120 per minute per account (the first room read above counted too).
 perform set_config('request.jwt.claim.sub',t::text,true);
 for i in 1..120 loop j:=public.classroom_api('room',jsonb_build_object('room_id',rid)); assert not j ? 'error','read '||i||' allowed'; end loop;
 j:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert j ? 'error','121st read in a minute is throttled';
 j:=public.classroom_api('stream_list',jsonb_build_object('room_id',rid));
 assert j ? 'error','stream reads share the read limit';
 perform set_config('request.jwt.claim.sub',s::text,true);
 assert not public.classroom_api('room',jsonb_build_object('room_id',rid)) ? 'error','other members are not affected';
end $$;

-- S5: learning state limits.
do $$
declare s uuid; np uuid; i integer;
begin
 select v into s from sb_ids where k='student';
 select v into np from sb_ids where k='noprofile';
 perform set_config('request.jwt.claim.sub',np::text,true);
 begin insert into public.learning_state(user_id,state) values(np,'{}'); raise exception 'FAIL learning state without profile';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub',s::text,true);
 begin insert into public.learning_state(user_id,state) values(s,jsonb_build_object('x',repeat('a',2000001))); raise exception 'FAIL oversized learning state';
 exception when check_violation then null; end;
 insert into public.learning_state(user_id,state) values(s,'{"n":0}');
 for i in 1..149 loop
  insert into public.learning_state(user_id,state,write_count) values(s,jsonb_build_object('n',i),0)
  on conflict(user_id) do update set state=excluded.state,updated_at=now(),write_count=excluded.write_count;
 end loop;
 assert (select write_count from public.learning_state where user_id=s)=150,'browser cannot reset the write counter';
 begin update public.learning_state set state='{"n":"too many"}' where user_id=s; raise exception 'FAIL 151st write';
 exception when raise_exception then assert sqlerrm like '%Zu viele Synchronisierungen%', sqlerrm; end;
 assert (select state->>'n' from public.learning_state where user_id=s)='149','rejected write changes nothing';
end $$;

-- Service role: orphan list and session revocation.
reset role;
do $$
declare s uuid; rid uuid; fid uuid; orphan text:=gen_random_uuid()::text; fresh text:=gen_random_uuid()::text; n integer;
begin
 select v into s from sb_ids where k='student';
 select room_id,id into rid,fid from classroom_private.stream_files where user_id=s limit 1;
 insert into storage.objects(bucket_id,name,owner_id,metadata,created_at) values
  ('classroom-stream',orphan,s::text,'{"size":1}',now()-interval '1 hour'),
  ('classroom-stream',fresh,s::text,'{"size":1}',now()),
  ('classroom-stream',fid::text,s::text,'{"size":5}',now()-interval '1 hour');
 set local role service_role;
 assert orphan = any(array(select public.stream_orphan_objects(100))),'old object without row is listed';
 assert not fresh = any(array(select public.stream_orphan_objects(100))),'recent uploads are left alone';
 assert not fid::text = any(array(select public.stream_orphan_objects(100))),'objects with a row are kept';
 reset role;
 insert into auth.sessions(id,user_id) values(gen_random_uuid(),s),(gen_random_uuid(),s);
 set local role service_role;
 n:=public.revoke_user_sessions(s);
 reset role;
 assert n=2 and not exists(select 1 from auth.sessions where user_id=s),'all sessions of the account end';
end $$;
select 'PASS: security bundle' as result;
rollback;
