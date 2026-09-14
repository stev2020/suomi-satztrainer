-- Roles are room-specific; only the owner can change active memberships.
alter table classroom_private.members add column role text not null default 'student'
 check (role in ('student','teacher'));

-- Called only inside the authorized private APIs, never exposed directly.
create function classroom_private.is_teacher(room uuid, member uuid)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from classroom_private.rooms r where r.id=room and
   (r.owner_id=member or exists(select 1 from classroom_private.members m
     where m.room_id=r.id and m.user_id=member and not m.blocked and m.role='teacher')));
$$;
revoke all on function classroom_private.is_teacher(uuid,uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION classroom_private.api(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid := auth.uid(); rid uuid; aid uuid; sid uuid; mid uuid;
 r classroom_private.rooms; a classroom_private.assignments;
 teacher boolean; owner boolean; result jsonb; n integer; stamp timestamptz;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>250000 then raise exception 'Ungültige Anfrage.'; end if;
 -- Return errors for throttled/invalid invitations so attempts remain counted.
 if action not in ('list','room') then
   insert into classroom_private.throttle(user_id) values(uid) on conflict do nothing;
   select hits,started_at into n,stamp from classroom_private.throttle where user_id=uid for update;
   if stamp < now()-interval '1 minute' then n:=0; stamp:=now(); end if;
   update classroom_private.throttle set hits=n+1,started_at=stamp where user_id=uid;
   if n>=30 then return jsonb_build_object('error','Zu viele Aktionen. Bitte eine Minute warten.'); end if;
 end if;
 if action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'owner',q.owner_id=uid,'teacher',classroom_private.is_teacher(q.id,uid),'archived',q.archived) order by q.created_at desc),'[]') into result
   from classroom_private.rooms q where q.owner_id=uid or exists(select 1 from classroom_private.members m where m.room_id=q.id and m.user_id=uid and not m.blocked);
   return result;
 elsif action='create' then
   perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
   if (select count(*) from classroom_private.rooms where owner_id=uid)>=10 then raise exception 'Maximal 10 Klassenräume pro Konto.'; end if;
   insert into classroom_private.rooms(owner_id,name) values(uid,trim(payload->>'name')) returning id into rid;
   return jsonb_build_object('id',rid);
 elsif action='join' then
   select * into r from classroom_private.rooms where code=upper(regexp_replace(payload->>'code','[[:space:]-]','','g')) and not archived for update;
   if r.id is null then return jsonb_build_object('error','Code ungültig oder Raum geschlossen.'); end if;
   if exists(select 1 from classroom_private.members where room_id=r.id and user_id=uid and blocked) then return jsonb_build_object('error','Beitritt nicht möglich. Bitte die Lehrkraft kontaktieren.'); end if;
   if r.owner_id=uid then return jsonb_build_object('id',r.id); end if;
   if (select count(*) from classroom_private.members where room_id=r.id and not blocked)>=100 then return jsonb_build_object('error','Dieser Raum ist voll (100 Teilnehmer).'); end if;
   if (select count(*) from classroom_private.members where user_id=uid and not blocked)>=30 then return jsonb_build_object('error','Maximal 30 Mitgliedschaften pro Konto.'); end if;
   insert into classroom_private.members(room_id,user_id) values(r.id,uid) on conflict do nothing;
   return jsonb_build_object('id',r.id);
 end if;
 rid:=(payload->>'room_id')::uuid;
 select * into r from classroom_private.rooms where id=rid for update;
 owner:=r.owner_id=uid;
 teacher:=classroom_private.is_teacher(rid,uid);
 if r.id is null or not (teacher or exists(select 1 from classroom_private.members where room_id=rid and user_id=uid and not blocked)) then
   raise exception 'Kein Zugriff auf diesen Klassenraum.' using errcode='42501';
 end if;
 if action='room' then
   return jsonb_build_object('id',r.id,'name',r.name,'owner',owner,'teacher',teacher,'archived',r.archived,'code',case when owner then r.code else null end,
   'teacher_count',1+(select count(*) from classroom_private.members where room_id=rid and not blocked and role='teacher'),
   'member_count',(select count(*) from classroom_private.members where room_id=rid and not blocked and role='student'),
   'members',jsonb_build_array(jsonb_build_object('id',case when owner then r.owner_id else null end,'name',(select username from public.profiles where user_id=r.owner_id),'role','teacher','owner',true,'blocked',false)) ||
     (select coalesce(jsonb_agg(jsonb_build_object('id',case when owner then m.user_id else null end,'name',p.username,'role',m.role,'owner',false,'blocked',m.blocked) order by p.username),'[]') from classroom_private.members m join public.profiles p on p.user_id=m.user_id where m.room_id=rid and m.user_id<>r.owner_id and (owner or not m.blocked)),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'items',q.items,'due_at',q.due_at,'released',q.released,
     'submissions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'own',s.user_id=uid,'author',case when teacher then p.username else null end,'answers',s.answers,'created_at',s.created_at,
       'reactions',(select jsonb_build_object('helpful',count(*) filter(where kind='helpful'),'interesting',count(*) filter(where kind='interesting'),'encouraging',count(*) filter(where kind='encouraging')) from classroom_private.reactions z where z.submission_id=s.id)) order by s.id),'[]') from classroom_private.submissions s join public.profiles p on p.user_id=s.user_id where s.assignment_id=q.id and (teacher or s.user_id=uid or q.released)),
     'submitted_count',(select count(*) from classroom_private.submissions s join classroom_private.members m on m.room_id=rid and m.user_id=s.user_id and not m.blocked and m.role='student' where s.assignment_id=q.id),
     'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'author',p.username,'own',v.user_id=uid,'item_index',v.item_index,'body',v.body,'parent_id',v.parent_id,'deleted',v.deleted,'teacher',classroom_private.is_teacher(rid,v.user_id),'created_at',v.created_at) order by v.created_at,v.id),'[]') from classroom_private.messages v join public.profiles p on p.user_id=v.user_id where v.assignment_id=q.id)
   ) order by q.created_at desc),'[]') from classroom_private.assignments q where q.room_id=rid));
 end if;
 if action='leave' and not owner then
   delete from classroom_private.members where room_id=rid and user_id=uid;
   return '{}'::jsonb;
 end if;
 if r.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 if action in ('rotate','archive','remove','set_role') and not owner then raise exception 'Nur der Ersteller darf das.' using errcode='42501'; end if;
 if action in ('assign','release') and not teacher then raise exception 'Nur die Lehrkraft darf das.' using errcode='42501'; end if;
 if action='set_role' then
   if payload->>'role' is null or payload->>'role' not in ('student','teacher') then raise exception 'Ungültige Rolle.'; end if;
   if (payload->>'user_id')::uuid=r.owner_id then raise exception 'Die Rolle des Erstellers kann nicht geändert werden.' using errcode='42501'; end if;
   update classroom_private.members set role=payload->>'role'
     where room_id=rid and user_id=(payload->>'user_id')::uuid and not blocked;
   if not found then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
 elsif action='rotate' then
   update classroom_private.rooms set code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) where id=rid;
 elsif action='archive' then
   update classroom_private.rooms set archived=true where id=rid;
 elsif action='remove' then
   update classroom_private.members set blocked=true where room_id=rid and user_id=(payload->>'user_id')::uuid;
 elsif action='assign' then
   if (select count(*) from classroom_private.assignments where room_id=rid)>=100 then raise exception 'Maximal 100 Aufgabenpakete pro Raum.'; end if;
   if exists(select 1 from jsonb_array_elements(payload->'items') x where jsonb_typeof(x)<>'object' or coalesce(length(x->>'text'),0)=0 or coalesce(length(x->'translations'->0->>'text'),0)=0) then raise exception 'Satzdaten unvollständig.'; end if;
   insert into classroom_private.assignments(room_id,title,items,due_at) values(rid,trim(payload->>'title'),payload->'items',nullif(payload->>'due_at','')::timestamptz);
 else
   aid:=(payload->>'assignment_id')::uuid;
   select * into a from classroom_private.assignments where id=aid and room_id=rid for update;
   if a.id is null then raise exception 'Aufgabe nicht gefunden.'; end if;
   if action='release' then
     update classroom_private.assignments set released=true where id=aid;
   elsif action='submit' then
     if teacher then raise exception 'Die Lehrkraft reicht keine Teilnehmerabgabe ein.'; end if;
     if a.released or (a.due_at is not null and a.due_at<now()) then raise exception 'Abgabe geschlossen.'; end if;
     if jsonb_typeof(payload->'answers') is distinct from 'array' then raise exception 'Antworten fehlen.'; end if;
     if jsonb_array_length(payload->'answers')<>jsonb_array_length(a.items) or exists(select 1 from jsonb_array_elements(payload->'answers') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 2000) then raise exception 'Bitte jeden Satz beantworten (maximal 2000 Zeichen).'; end if;
     insert into classroom_private.submissions(assignment_id,user_id,answers) values(aid,uid,payload->'answers');
   elsif action='message' then
     if (payload->>'item_index')::integer>=jsonb_array_length(a.items) then raise exception 'Satz nicht gefunden.'; end if;
     if (select count(*) from classroom_private.messages where assignment_id=aid)>=300 then raise exception 'Diskussion voll (300 Beiträge).'; end if;
     mid:=nullif(payload->>'parent_id','')::uuid;
     if mid is not null and not exists(select 1 from classroom_private.messages where id=mid and assignment_id=aid and item_index=(payload->>'item_index')::integer) then
       raise exception 'Der Bezugsbeitrag gehört nicht zu diesem Satz dieser Aufgabe.' using errcode='42501';
     end if;
     insert into classroom_private.messages(assignment_id,user_id,item_index,body,parent_id) values(aid,uid,(payload->>'item_index')::integer,trim(payload->>'body'),mid);
   elsif action='delete_message' then
     update classroom_private.messages set body='[Beitrag entfernt]',deleted=true where id=(payload->>'message_id')::uuid and assignment_id=aid and (teacher or user_id=uid);
   elsif action='react' then
     sid:=(payload->>'submission_id')::uuid;
     if not a.released then raise exception 'Vergleich ist noch nicht freigegeben.'; end if;
     if not exists(select 1 from classroom_private.submissions where id=sid and assignment_id=aid) then raise exception 'Abgabe nicht gefunden.'; end if;
     insert into classroom_private.reactions(submission_id,user_id,kind) values(sid,uid,payload->>'kind') on conflict(submission_id,user_id) do update set kind=excluded.kind;
   else raise exception 'Unbekannte Aktion.';
   end if;
 end if;
 return '{}'::jsonb;
end $function$
;

create or replace function classroom_private.stream_api(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();r classroom_private.rooms;p classroom_private.stream_posts;
 rid uuid;pid uuid;fid uuid;teacher boolean;j jsonb;n integer;stamp timestamptz;ids uuid[];page_offset integer;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>20000 then raise exception 'Ungültige Anfrage.'; end if;
 rid:=(payload->>'room_id')::uuid;
 select * into r from classroom_private.rooms where id=rid for update;
 teacher:=classroom_private.is_teacher(rid,uid);
 if r.id is null or not(teacher or exists(select 1 from classroom_private.members where room_id=rid and user_id=uid and not blocked)) then raise exception 'Kein Zugriff auf diesen Klassenraum.' using errcode='42501'; end if;
 if action='stream_list' then
  page_offset:=greatest(0,least(coalesce((payload->>'offset')::integer,0),10000));
  return jsonb_build_object(
   'posts',(select coalesce(jsonb_agg(to_jsonb(q) order by q.pinned desc,q.created_at desc,q.id),'[]') from (
    select s.id,s.kind,s.body,s.resolved,s.pinned,s.deleted,s.created_at,u.username as author,s.user_id=uid as own,classroom_private.is_teacher(rid,s.user_id) as teacher,
    (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'size',f.size) order by f.created_at,f.id),'[]') from classroom_private.stream_files f where f.post_id=s.id and not s.deleted) as files,
    (select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'reply_to_id',v.reply_to_id,'body',v.body,'deleted',v.deleted,'created_at',v.created_at,'author',a.username,'own',v.user_id=uid,'teacher',classroom_private.is_teacher(rid,v.user_id)) order by v.created_at,v.id),'[]') from classroom_private.stream_posts v join public.profiles a on a.user_id=v.user_id where v.parent_id=s.id) as replies
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
