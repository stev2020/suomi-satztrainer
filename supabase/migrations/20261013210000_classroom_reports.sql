-- Klassenraum: Inhalte melden (Notice-and-Action nach dem Gesetz über digitale Dienste) und Moderation in der Verwaltung.
--
-- Datenschutz:
--  * Gemeldet werden kann ein Beitrag (auch Antworten), eine Diskussionsnachricht zu einer Aufgabe oder der ganze Raum.
--  * Wer gemeldet hat, sieht niemand – weder die Lehrkraft noch der Betreiber. Das Konto der meldenden Person wird nur
--    gespeichert, damit niemand denselben Inhalt mehrfach meldet, und beim Abschluss der Meldung gelöscht.
--  * Die Verwaltung sieht nur gemeldete Inhalte (und bei Antworten den Beitrag darüber), keine ganzen Räume.
--    Dateien werden dort nur mit Name, Art und Größe gezeigt, nicht geöffnet.
--  * Für den Überblick gibt es je Raum nur Kennzahlen (Mitglieder, Aktivität, Dateien, Meldungen), keine Inhalte.

create table classroom_private.reports(
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references classroom_private.rooms(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  target_kind text not null check (target_kind in ('post','message','room')),
  target_id uuid not null,
  reason text not null check (reason in ('illegal','harassment','inappropriate','spam','other')),
  note text not null default '' check (char_length(note)<=500),
  status text not null default 'open' check (status in ('open','resolved')),
  decision text check (decision in ('keep','remove','archive','delete_room')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create unique index classroom_reports_once on classroom_private.reports(reporter_id,target_kind,target_id) where status='open';
create index classroom_reports_open_idx on classroom_private.reports(status,created_at);
create index classroom_reports_room_idx on classroom_private.reports(room_id);
create index classroom_reports_reporter_idx on classroom_private.reports(reporter_id);
alter table classroom_private.reports enable row level security;
revoke all on classroom_private.reports from public,anon,authenticated;
create policy "deny direct browser access" on classroom_private.reports for all to anon,authenticated using(false) with check(false);

-- Melden aus dem Klassenraum (nur Mitglieder des Raums, nicht die eigenen Inhalte, höchstens 20 Meldungen am Tag).
create function classroom_private.report(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); kind text; tid uuid; rid uuid; author uuid; reason text; note text; n integer;
begin
  if uid is null or not exists(select 1 from public.profiles where user_id=uid) then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>3000 then raise exception 'Ungültige Anfrage.'; end if;
  kind:=payload->>'kind'; reason:=payload->>'reason';
  if kind is null or kind not in ('post','message','room') then raise exception 'Ungültige Meldung.'; end if;
  if reason is null or reason not in ('illegal','harassment','inappropriate','spam','other') then raise exception 'Bitte einen Grund auswählen.'; end if;
  if coalesce(payload->>'id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültige Meldung.'; end if;
  tid:=(payload->>'id')::uuid;
  note:=left(btrim(regexp_replace(coalesce(payload->>'note',''),'[\x01-\x09\x0b-\x1f\x7f]+',' ','g')),500);
  if kind='post' then
    select p.room_id,p.user_id into rid,author from classroom_private.stream_posts p where p.id=tid and not p.deleted;
  elsif kind='message' then
    select a.room_id,m.user_id into rid,author from classroom_private.messages m join classroom_private.assignments a on a.id=m.assignment_id where m.id=tid and not m.deleted;
  else
    select r.id,r.owner_id into rid,author from classroom_private.rooms r where r.id=tid;
  end if;
  if rid is null then raise exception 'Dieser Inhalt ist nicht mehr da.'; end if;
  if not exists(select 1 from classroom_private.rooms r where r.id=rid and r.owner_id=uid)
     and not exists(select 1 from classroom_private.members m where m.room_id=rid and m.user_id=uid and not m.blocked) then
    raise exception 'Nur Mitglieder dieses Raums können hier etwas melden.' using errcode='42501';
  end if;
  if author=uid then raise exception 'Eigene Inhalte kannst du selbst entfernen.'; end if;
  select count(*) into n from classroom_private.reports where reporter_id=uid and created_at>now()-interval '1 day';
  if n>=20 then raise exception 'Du hast heute schon viele Meldungen geschickt. Bitte versuche es morgen wieder.'; end if;
  insert into classroom_private.reports(room_id,reporter_id,target_kind,target_id,reason,note)
  values(rid,uid,kind,tid,reason,note) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;
revoke all on function classroom_private.report(jsonb) from public,anon,authenticated;
grant execute on function classroom_private.report(jsonb) to authenticated;

create or replace function public.classroom_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select case when action='delete_room' then classroom_private.delete_room(payload)
 when action='report' then classroom_private.report(payload)
 when action like 'stream_%' then classroom_private.stream_api(action,payload)
 else classroom_private.api(action,payload) end;
$$;
revoke all on function public.classroom_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.classroom_api(text,jsonb) to authenticated;

-- Rolle im Raum, ohne Namen (für die Einordnung einer Meldung).
create function admin_private.room_role(rid uuid,u uuid)
returns text language sql stable security definer set search_path='' as $$
  select case when exists(select 1 from classroom_private.rooms r where r.id=rid and r.owner_id=u) then 'Ersteller'
    when exists(select 1 from classroom_private.members m where m.room_id=rid and m.user_id=u and m.role='teacher') then 'Lehrkraft'
    else 'Mitglied' end
$$;

-- Moderation für die Verwaltung (nur über public.admin_api, also nur für Admins mit zweitem Faktor).
create function admin_private.moderation(action text,payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; kind text; tid uuid; rid uuid; verdict text; r classroom_private.rooms%rowtype;
begin
  if uid is null or not exists(select 1 from admin_private.admins a where a.user_id=uid) then
    raise exception 'Keine Berechtigung.' using errcode='42501';
  end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>3000 then raise exception 'Ungültige Anfrage.'; end if;

  if action='class_reports' then
    with g as (
      select x.target_kind,x.target_id,x.room_id,count(*) as n,min(x.created_at) as first_at,max(x.created_at) as last_at,
        jsonb_object_agg(x.reason,x.cnt) as reasons
      from (select target_kind,target_id,room_id,reason,count(*) as cnt,min(created_at) as created_at
            from classroom_private.reports where status='open' group by 1,2,3,4) x
      group by 1,2,3
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'target_kind',g.target_kind,'target_id',g.target_id,'room_id',g.room_id,'count',g.n,'reasons',g.reasons,
      'first_at',g.first_at,'last_at',g.last_at,
      'notes',(select coalesce(jsonb_agg(z.note),'[]'::jsonb) from (select note from classroom_private.reports
                where status='open' and target_kind=g.target_kind and target_id=g.target_id and note<>'' order by created_at desc limit 5) z),
      'room',(select jsonb_build_object('name',ro.name,'archived',ro.archived,
                'members',(select count(*) from classroom_private.members m where m.room_id=ro.id and not m.blocked))
              from classroom_private.rooms ro where ro.id=g.room_id),
      'content',case g.target_kind
        when 'post' then (select jsonb_build_object('body',p.body,'kind',p.kind,'deleted',p.deleted,'created_at',p.created_at,
            'role',admin_private.room_role(p.room_id,p.user_id),
            'parent',(select q.body from classroom_private.stream_posts q where q.id=p.parent_id),
            'files',(select coalesce(jsonb_agg(jsonb_build_object('name',f.name,'mime',f.mime,'size',f.size)),'[]'::jsonb)
                     from classroom_private.stream_files f where f.post_id=p.id))
          from classroom_private.stream_posts p where p.id=g.target_id)
        when 'message' then (select jsonb_build_object('body',m.body,'deleted',m.deleted,'created_at',m.created_at,
            'role',admin_private.room_role(a.room_id,m.user_id),'assignment',a.title)
          from classroom_private.messages m join classroom_private.assignments a on a.id=m.assignment_id where m.id=g.target_id)
        else null end
    ) order by g.last_at desc),'[]'::jsonb) into result from g;
    return result;
  end if;

  if action='class_resolve' then
    kind:=payload->>'target_kind'; verdict:=payload->>'decision';
    if kind is null or kind not in ('post','message','room') or coalesce(payload->>'target_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültige Meldung.'; end if;
    if verdict is null or verdict not in ('keep','remove','archive') or (verdict='remove' and kind='room') then raise exception 'Ungültige Entscheidung.'; end if;
    tid:=(payload->>'target_id')::uuid;
    select room_id into rid from classroom_private.reports where target_kind=kind and target_id=tid and status='open' limit 1;
    if rid is null then raise exception 'Diese Meldung ist schon erledigt.'; end if;
    if verdict='remove' and kind='post' then
      update classroom_private.stream_posts set body='[Vom Betreiber entfernt]',deleted=true,pinned=false where id=tid;
      -- Dateien des Beitrags: Eintrag löschen; die Datei selbst entfernt danach storage-sweep (Storage-API).
      delete from classroom_private.stream_files where post_id=tid;
    elsif verdict='remove' and kind='message' then
      update classroom_private.messages set body='[Vom Betreiber entfernt]',deleted=true where id=tid;
    elsif verdict='archive' then
      update classroom_private.rooms set archived=true where id=rid;
    end if;
    update classroom_private.reports set status='resolved',decision=verdict,resolved_at=now(),reporter_id=null,note=''
      where target_kind=kind and target_id=tid and status='open';
    return jsonb_build_object('ok',true,'files_removed',verdict='remove' and kind='post');
  end if;

  if action='class_rooms' then
    select coalesce(jsonb_agg(to_jsonb(x) order by x.open_reports desc,x.last_activity desc nulls last),'[]'::jsonb) into result from (
      select ro.id,ro.name,ro.archived,to_char(ro.created_at at time zone 'Europe/Berlin','YYYY-MM') as created,
        (select count(*) from classroom_private.members m where m.room_id=ro.id and not m.blocked) as members,
        (select count(*) from classroom_private.members m where m.room_id=ro.id and m.role='teacher') as teachers,
        (select count(*) from classroom_private.stream_posts p where p.room_id=ro.id and not p.deleted and p.created_at>now()-interval '30 days') as posts_30d,
        (select count(*) from classroom_private.messages me join classroom_private.assignments a on a.id=me.assignment_id
          where a.room_id=ro.id and not me.deleted and me.created_at>now()-interval '30 days') as messages_30d,
        (select count(*) from classroom_private.assignments a where a.room_id=ro.id) as assignments,
        (select count(*) from classroom_private.stream_files f where f.room_id=ro.id and f.post_id is not null) as files,
        (select coalesce(sum(f.size),0) from classroom_private.stream_files f where f.room_id=ro.id and f.post_id is not null) as file_bytes,
        greatest((select max(p.created_at) from classroom_private.stream_posts p where p.room_id=ro.id),
          (select max(me.created_at) from classroom_private.messages me join classroom_private.assignments a on a.id=me.assignment_id where a.room_id=ro.id),
          (select max(s.created_at) from classroom_private.submissions s join classroom_private.assignments a on a.id=s.assignment_id where a.room_id=ro.id)) as last_activity,
        (select count(*) from classroom_private.reports rp where rp.room_id=ro.id and rp.status='open') as open_reports
      from classroom_private.rooms ro order by ro.created_at desc limit 300) x;
    return result;
  end if;

  if action='class_room_archive' then
    if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Raum.'; end if;
    update classroom_private.rooms set archived=true where id=(payload->>'room_id')::uuid;
    update classroom_private.reports set status='resolved',decision='archive',resolved_at=now(),reporter_id=null,note=''
      where room_id=(payload->>'room_id')::uuid and target_kind='room' and status='open';
    return jsonb_build_object('ok',found);
  end if;

  if action='class_room_delete' then
    if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Raum.'; end if;
    select * into r from classroom_private.rooms where id=(payload->>'room_id')::uuid for update;
    if r.id is null then raise exception 'Diesen Raum gibt es nicht mehr.'; end if;
    if (payload->>'confirm_name') is distinct from r.name then raise exception 'Bitte den Raumnamen genau eingeben.'; end if;
    delete from classroom_private.rooms where id=r.id;
    return jsonb_build_object('ok',true);
  end if;
  raise exception 'Unbekannte Aktion.';
end $$;
revoke all on function admin_private.moderation(text,jsonb) from public,anon,authenticated;
revoke all on function admin_private.room_role(uuid,uuid) from public,anon,authenticated;

create or replace function public.admin_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare aal2 boolean:=coalesce(auth.jwt()->>'aal','')='aal2'; r jsonb;
begin
  if action='status' then
    r:=admin_private.api('status',coalesce(payload,'{}'::jsonb));
    return r||jsonb_build_object('aal2',aal2,'ok',coalesce((r->>'admin')::boolean,false) and aal2);
  end if;
  if not aal2 then raise exception 'Bitte mit dem Code aus der Authenticator-App anmelden.' using errcode='42501'; end if;
  if action like 'class\_%' then return admin_private.moderation(action,coalesce(payload,'{}'::jsonb)); end if;
  return admin_private.api(action,payload);
end $$;
revoke all on function public.admin_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_api(text,jsonb) to authenticated;

-- Erledigte Meldungen nach 180 Tagen ganz löschen.
do $cron$
begin
  if exists(select 1 from pg_extension where extname='pg_cron') then
    execute $q$select cron.schedule('classroom-reports-cleanup','29 3 * * *',$job$delete from classroom_private.reports where status='resolved' and resolved_at<now()-interval '180 days'$job$)$q$;
  end if;
end $cron$;
