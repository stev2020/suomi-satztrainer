-- Keep parent_id as the root post for pagination and the shared reply limit.
-- reply_to_id records the direct target, within the same root conversation.
alter table classroom_private.stream_posts add column reply_to_id uuid;
alter table classroom_private.stream_posts add constraint stream_reply_root_unique unique(id,parent_id);
alter table classroom_private.stream_posts add constraint stream_reply_target_same_root foreign key(reply_to_id,parent_id) references classroom_private.stream_posts(id,parent_id) on delete set null (reply_to_id);
alter table classroom_private.stream_posts add constraint stream_reply_target_valid check(reply_to_id is null or (parent_id is not null and reply_to_id<>id));
create index stream_reply_target_idx on classroom_private.stream_posts(reply_to_id,parent_id);
create or replace function classroom_private.stream_api(action text,payload jsonb)
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
    (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'reply_to_id',v.reply_to_id,'body',v.body,'deleted',v.deleted,'created_at',v.created_at,'author',a.username,'own',v.user_id=uid,'teacher',v.user_id=r.owner_id) order by v.created_at,v.id),'[]') from classroom_private.stream_posts v join public.profiles a on a.user_id=v.user_id where v.parent_id=s.id) as replies
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
   pid:=coalesce(p.parent_id,p.id);
   if (select count(*) from classroom_private.stream_posts where parent_id=pid)>=100 then raise exception 'Maximal 100 Antworten pro Beitrag.';end if;
   insert into classroom_private.stream_posts(id,room_id,user_id,parent_id,reply_to_id,kind,body) values(coalesce((payload->>'request_id')::uuid,gen_random_uuid()),rid,uid,pid,case when p.parent_id is not null then p.id end,'reply',trim(payload->>'body'));
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
