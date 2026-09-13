create table classroom_private.stream_posts (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references classroom_private.rooms on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 parent_id uuid references classroom_private.stream_posts on delete cascade,
 kind text not null check(kind in ('question','post','announcement','reply')),
 body text not null check(length(body) between 1 and 3000),
 resolved boolean not null default false,
 pinned boolean not null default false,
 deleted boolean not null default false,
 created_at timestamptz not null default clock_timestamp(),
 check((parent_id is null) = (kind <> 'reply'))
);
create index stream_posts_room_idx on classroom_private.stream_posts(room_id,created_at desc,id);
create index stream_posts_parent_idx on classroom_private.stream_posts(parent_id);
create index stream_posts_user_idx on classroom_private.stream_posts(user_id);
alter table classroom_private.stream_posts enable row level security;
revoke all on classroom_private.stream_posts from public,anon,authenticated;
create policy "deny direct browser access" on classroom_private.stream_posts for all to anon,authenticated using(false) with check(false);

create table classroom_private.stream_files (
 id uuid primary key default gen_random_uuid(),
 room_id uuid not null references classroom_private.rooms on delete cascade,
 user_id uuid not null references auth.users on delete cascade,
 post_id uuid references classroom_private.stream_posts on delete cascade,
 name text not null check(length(name) between 1 and 180),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation')),
 size bigint not null check(size between 1 and 10485760),
 created_at timestamptz not null default now()
);
create index stream_files_room_idx on classroom_private.stream_files(room_id);
create index stream_files_user_idx on classroom_private.stream_files(user_id);
create index stream_files_post_idx on classroom_private.stream_files(post_id);
alter table classroom_private.stream_files enable row level security;
revoke all on classroom_private.stream_files from public,anon,authenticated;
create policy "deny direct browser access" on classroom_private.stream_files for all to anon,authenticated using(false) with check(false);

-- The browser never receives a public or signed attachment URL. Every download
-- rechecks current classroom membership; only reserved, immutable paths upload.
create function classroom_private.stream_file_access(object_name text, writing boolean default false)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
 select 1 from classroom_private.stream_files f join classroom_private.rooms r on r.id=f.room_id
 left join classroom_private.stream_posts p on p.id=f.post_id
 where f.id::text=object_name
 and (r.owner_id=auth.uid() or exists(select 1 from classroom_private.members m where m.room_id=r.id and m.user_id=auth.uid() and not m.blocked))
 and case when writing then f.user_id=auth.uid() and f.post_id is null and not r.archived
 else (f.post_id is null and f.user_id=auth.uid()) or (f.post_id is not null and not p.deleted) end);
$$;
revoke all on function classroom_private.stream_file_access(text,boolean) from public,anon,authenticated;
grant execute on function classroom_private.stream_file_access(text,boolean) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('classroom-stream','classroom-stream',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.openxmlformats-officedocument.presentationml.presentation']);
create policy "classroom stream upload" on storage.objects for insert to authenticated
with check(bucket_id='classroom-stream' and classroom_private.stream_file_access(name,true));
create policy "classroom stream read" on storage.objects for select to authenticated
using(bucket_id='classroom-stream' and classroom_private.stream_file_access(name,false));
create policy "classroom stream discard draft" on storage.objects for delete to authenticated
using(bucket_id='classroom-stream' and classroom_private.stream_file_access(name,true));

create function classroom_private.stream_api(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();r classroom_private.rooms;p classroom_private.stream_posts;
 rid uuid;pid uuid;fid uuid;teacher boolean;j jsonb;n integer;stamp timestamptz;ids uuid[];page_offset integer;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000 then raise exception 'Ungültige Anfrage.'; end if;
 rid:=(payload->>'room_id')::uuid;
 select * into r from classroom_private.rooms where id=rid for update;
 teacher:=r.owner_id=uid;
 if r.id is null or not(teacher or exists(select 1 from classroom_private.members where room_id=rid and user_id=uid and not blocked)) then raise exception 'Kein Zugriff auf diesen Klassenraum.' using errcode='42501'; end if;
 if action='stream_list' then
  page_offset:=greatest(0,least(coalesce((payload->>'offset')::integer,0),10000));
  return jsonb_build_object(
   'posts',(select coalesce(jsonb_agg(to_jsonb(q) order by q.pinned desc,q.created_at desc,q.id),'[]') from (
    select s.id,s.kind,s.body,s.resolved,s.pinned,s.deleted,s.created_at,u.username as author,s.user_id=uid as own,s.user_id=r.owner_id as teacher,
    (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.created_at,f.id),'[]') from classroom_private.stream_files f where f.post_id=s.id and not s.deleted) as files,
    (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'body',v.body,'deleted',v.deleted,'created_at',v.created_at,'author',a.username,'own',v.user_id=uid,'teacher',v.user_id=r.owner_id) order by v.created_at,v.id),'[]') from classroom_private.stream_posts v join public.profiles a on a.user_id=v.user_id where v.parent_id=s.id) as replies
    from classroom_private.stream_posts s join public.profiles u on u.user_id=s.user_id
    where s.room_id=rid and s.parent_id is null
    order by s.pinned desc,s.created_at desc,s.id limit 30 offset page_offset) q),
   'has_more',(select count(*)>page_offset+30 from classroom_private.stream_posts where room_id=rid and parent_id is null),
   'open_questions',(select count(*) from classroom_private.stream_posts where room_id=rid and kind='question' and not resolved and not deleted),
   'assignment_dates',(select coalesce(jsonb_object_agg(id,created_at),'{}') from classroom_private.assignments where room_id=rid));
 end if;
 if r.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 insert into classroom_private.throttle(user_id) values(uid) on conflict do nothing;
 select hits,started_at into n,stamp from classroom_private.throttle where user_id=uid for update;
 if stamp<now()-interval '1 minute' then n:=0;stamp:=now();end if;
 update classroom_private.throttle set hits=n+1,started_at=stamp where user_id=uid;
 if n>=30 then return jsonb_build_object('error','Zu viele Aktionen. Bitte eine Minute warten.');end if;
 if action in ('stream_post','stream_reply') and payload->>'request_id' is not null then
  select id into pid from classroom_private.stream_posts where id=(payload->>'request_id')::uuid and room_id=rid and user_id=uid;
  if pid is not null then return jsonb_build_object('id',pid);end if;
 end if;
 if action='stream_reserve' then
  if (select count(*) from classroom_private.stream_files where user_id=uid and post_id is null)>=30 then raise exception 'Zu viele unveröffentlichte Anhänge. Bitte vorhandene Entwürfe senden oder Anhänge entfernen.';end if;
  if (select coalesce(sum(size),0) from classroom_private.stream_files where room_id=rid)+coalesce((payload->>'size')::bigint,0)>1073741824 then raise exception 'Der Dateispeicher dieses Klassenraums ist voll.';end if;
  insert into classroom_private.stream_files(room_id,user_id,name,mime,size) values(rid,uid,trim(payload->>'name'),payload->>'mime',(payload->>'size')::bigint) returning id into fid;
  return jsonb_build_object('id',fid);
 elsif action='stream_discard' then
  delete from classroom_private.stream_files where id=(payload->>'file_id')::uuid and room_id=rid and user_id=uid and post_id is null;
 elsif action='stream_post' then
  if payload->>'kind' not in ('question','post','announcement') or payload->>'kind' is null then raise exception 'Ungültige Beitragsart.';end if;
  if payload->>'kind'='announcement' and not teacher then raise exception 'Nur die Lehrkraft darf Ankündigungen veröffentlichen.' using errcode='42501';end if;
  if (select count(*) from classroom_private.stream_posts where room_id=rid and parent_id is null)>=2000 then raise exception 'Dieser Klassenstream ist voll.';end if;
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into ids from jsonb_array_elements_text(coalesce(payload->'file_ids','[]'));
  if cardinality(ids)>3 or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Maximal drei verschiedene Anhänge.';end if;
  if cardinality(ids)<>(select count(*) from classroom_private.stream_files f join storage.objects o on o.bucket_id='classroom-stream' and o.name=f.id::text where f.id=any(ids) and f.room_id=rid and f.user_id=uid and f.post_id is null and (o.metadata->>'size')::bigint=f.size) then raise exception 'Anhänge sind noch nicht vollständig hochgeladen.';end if;
  insert into classroom_private.stream_posts(id,room_id,user_id,kind,body) values(coalesce((payload->>'request_id')::uuid,gen_random_uuid()),rid,uid,payload->>'kind',trim(payload->>'body')) returning id into pid;
  update classroom_private.stream_files set post_id=pid where id=any(ids);
  return jsonb_build_object('id',pid);
 else
  pid:=(payload->>'post_id')::uuid;
  select * into p from classroom_private.stream_posts where id=pid and room_id=rid for update;
  if p.id is null or p.deleted then raise exception 'Beitrag nicht mehr verfügbar.';end if;
  if action='stream_reply' then
   if p.parent_id is not null then raise exception 'Bitte auf den ursprünglichen Beitrag antworten.';end if;
   if (select count(*) from classroom_private.stream_posts where parent_id=pid)>=100 then raise exception 'Maximal 100 Antworten pro Beitrag.';end if;
   insert into classroom_private.stream_posts(id,room_id,user_id,parent_id,kind,body) values(coalesce((payload->>'request_id')::uuid,gen_random_uuid()),rid,uid,pid,'reply',trim(payload->>'body'));
  elsif action='stream_resolve' then
   if p.kind<>'question' or not(teacher or p.user_id=uid) then raise exception 'Nur Fragesteller und Lehrkraft dürfen diese Frage markieren.' using errcode='42501';end if;
   update classroom_private.stream_posts set resolved=coalesce((payload->>'resolved')::boolean,false) where id=pid;
  elsif action='stream_pin' then
   if not teacher or p.parent_id is not null then raise exception 'Nur die Lehrkraft darf Beiträge anpinnen.' using errcode='42501';end if;
   update classroom_private.stream_posts set pinned=coalesce((payload->>'pinned')::boolean,false) where id=pid;
  elsif action='stream_delete' then
   if not(teacher or p.user_id=uid) then raise exception 'Nur Verfasser und Lehrkraft dürfen Beiträge entfernen.' using errcode='42501';end if;
   update classroom_private.stream_posts set body='[Beitrag entfernt]',deleted=true,pinned=false where id=pid;
  else raise exception 'Unbekannte Aktion.';end if;
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function classroom_private.stream_api(text,jsonb) from public,anon,authenticated;
grant execute on function classroom_private.stream_api(text,jsonb) to authenticated;
create or replace function public.classroom_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select case when action='delete_room' then classroom_private.delete_room(payload)
 when action like 'stream_%' then classroom_private.stream_api(action,payload)
 else classroom_private.api(action,payload) end;
$$;
revoke all on function public.classroom_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.classroom_api(text,jsonb) to authenticated;
