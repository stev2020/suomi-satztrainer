-- Sentence-quality data is private. Small, explicitly authorized RPCs expose
-- only the actions and exclusion IDs required by the browser application.
create schema if not exists quality_private;
revoke all on schema quality_private from public, anon, authenticated;
grant usage on schema quality_private to anon, authenticated;

create table quality_private.sentence_states (
 sentence_id bigint primary key check (sentence_id > 0),
 source_kind text not null default 'unknown'
   check (source_kind in ('direct_tatoeba','indirect_tatoeba','app_generated','editorial','unknown')),
 review_status text not null default 'unreviewed'
   check (review_status in ('unreviewed','needs_review','reviewed','rejected')),
 availability text not null default 'active'
   check (availability in ('active','quarantined','disabled')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 updated_at timestamptz not null default now()
);

create table quality_private.translation_states (
 sentence_id bigint not null check (sentence_id > 0),
 translation_id bigint not null check (translation_id > 0),
 relation_kind text not null default 'unknown'
   check (relation_kind in ('direct_tatoeba','indirect_tatoeba','app_generated','editorial','unknown')),
 review_status text not null default 'unreviewed'
   check (review_status in ('unreviewed','needs_review','reviewed','rejected')),
 availability text not null default 'active'
   check (availability in ('active','quarantined','disabled')),
 reviewed_by uuid references auth.users(id) on delete set null,
 reviewed_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key (sentence_id,translation_id)
);

create table quality_private.reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 sentence_id bigint not null check (sentence_id > 0),
 translation_id bigint not null default 0 check (translation_id >= 0),
 category text not null check (category in
   ('translation','unnatural','outdated','inappropriate','duplicate','grammar','audio','level','other')),
 note text not null default '' check (char_length(note) <= 2000),
 snapshot jsonb not null default '{}'::jsonb
   check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 20000),
 status text not null default 'open' check (status in ('open','reviewed','dismissed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (reporter_id,sentence_id,translation_id,category)
);

create table quality_private.classroom_exclusions (
 room_id uuid not null references classroom_private.rooms(id) on delete cascade,
 sentence_id bigint not null check (sentence_id > 0),
 translation_id bigint not null default 0 check (translation_id >= 0),
 hidden_by uuid not null references auth.users(id) on delete cascade,
 reason text not null default '' check (char_length(reason) <= 500),
 created_at timestamptz not null default now(),
 primary key (room_id,sentence_id,translation_id)
);

create table quality_private.report_throttle (
 user_id uuid primary key references auth.users(id) on delete cascade,
 window_start timestamptz not null default now(),
 hits integer not null default 0 check (hits >= 0)
);

create index sentence_states_unavailable_idx on quality_private.sentence_states(sentence_id)
 where availability <> 'active';
create index translation_states_unavailable_idx on quality_private.translation_states(sentence_id,translation_id)
 where availability <> 'active';
create index quality_reports_queue_idx on quality_private.reports(status,updated_at desc);
create index quality_reports_sentence_idx on quality_private.reports(sentence_id,translation_id);
create index classroom_exclusions_room_idx on quality_private.classroom_exclusions(room_id);

alter table quality_private.sentence_states enable row level security;
alter table quality_private.translation_states enable row level security;
alter table quality_private.reports enable row level security;
alter table quality_private.classroom_exclusions enable row level security;
alter table quality_private.report_throttle enable row level security;
revoke all on all tables in schema quality_private from public, anon, authenticated;
create policy "deny direct browser access" on quality_private.sentence_states for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on quality_private.translation_states for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on quality_private.reports for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on quality_private.classroom_exclusions for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on quality_private.report_throttle for all to anon,authenticated using(false) with check(false);

create function quality_private.public_exclusions()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
   'sentence_ids',(select coalesce(jsonb_agg(s.sentence_id order by s.sentence_id),'[]'::jsonb)
     from quality_private.sentence_states s where s.availability <> 'active'),
   'translations',(select coalesce(jsonb_agg(jsonb_build_object('sentence_id',t.sentence_id,'translation_id',t.translation_id)
     order by t.sentence_id,t.translation_id),'[]'::jsonb)
     from quality_private.translation_states t where t.availability <> 'active')
 );
$$;
revoke all on function quality_private.public_exclusions() from public,anon,authenticated;
grant execute on function quality_private.public_exclusions() to anon,authenticated;

create function quality_private.api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); sid bigint; tid bigint; rid uuid; report_category text; report_source_kind text;
 n integer; teacher boolean; room classroom_private.rooms; result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles p where p.user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then
   raise exception 'Ungültige Anfrage.';
 end if;
 if action='report' then
   if coalesce(payload->>'sentence_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Satz.'; end if;
   sid:=(payload->>'sentence_id')::bigint;
   if coalesce(payload->>'translation_id','')='' then tid:=0;
   elsif payload->>'translation_id' !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültige Übersetzung.';
   else tid:=(payload->>'translation_id')::bigint; end if;
   report_category:=payload->>'category';
   if report_category is null or report_category not in ('translation','unnatural','outdated','inappropriate','duplicate','grammar','audio','level','other') then
     raise exception 'Ungültiger Meldegrund.';
   end if;
   if char_length(coalesce(payload->>'note',''))>2000 or char_length(coalesce(payload->>'sentence_text',''))>5000
      or char_length(coalesce(payload->>'translation_text',''))>10000 then raise exception 'Der Hinweis ist zu lang.'; end if;
   report_source_kind:=coalesce(payload->>'source_kind','unknown');
   if report_source_kind not in ('direct_tatoeba','indirect_tatoeba','app_generated','editorial','unknown') then report_source_kind:='unknown'; end if;

   insert into quality_private.report_throttle(user_id,hits) values(uid,1)
   on conflict(user_id) do update set
     hits=case when quality_private.report_throttle.window_start<now()-interval '1 hour' then 1 else quality_private.report_throttle.hits+1 end,
     window_start=case when quality_private.report_throttle.window_start<now()-interval '1 hour' then now() else quality_private.report_throttle.window_start end
   returning hits into n;
   if n>20 then return jsonb_build_object('error','Zu viele Hinweise. Bitte versuche es später erneut.'); end if;

   insert into quality_private.reports(reporter_id,sentence_id,translation_id,category,note,snapshot)
   values(uid,sid,case when report_category='translation' then tid else 0 end,report_category,coalesce(payload->>'note',''),
     jsonb_build_object('sentence_text',coalesce(payload->>'sentence_text',''),'translation_text',coalesce(payload->>'translation_text',''),
       'source_kind',report_source_kind,'reported_activity',left(coalesce(payload->>'activity',''),40)))
   on conflict(reporter_id,sentence_id,translation_id,category) do update set
     note=excluded.note,snapshot=excluded.snapshot,status='open',updated_at=now();

   if report_category='translation' and tid>0 then
     insert into quality_private.translation_states(sentence_id,translation_id,relation_kind,review_status,availability)
     values(sid,tid,report_source_kind,'needs_review','quarantined')
     on conflict(sentence_id,translation_id) do update set
       review_status='needs_review',availability='quarantined',updated_at=now();
     return jsonb_build_object('quarantined',true,'target','translation');
   else
     insert into quality_private.sentence_states(sentence_id,source_kind,review_status,availability)
     values(sid,report_source_kind,'needs_review','quarantined')
     on conflict(sentence_id) do update set review_status='needs_review',availability='quarantined',updated_at=now();
     return jsonb_build_object('quarantined',true,'target','sentence');
   end if;
 end if;

 if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Klassenraum.'; end if;
 rid:=(payload->>'room_id')::uuid;
 select r.* into room from classroom_private.rooms r where r.id=rid;
 teacher:=classroom_private.is_teacher(rid,uid);
 if room.id is null or not teacher then raise exception 'Nur die Lehrkraft darf Sätze ausblenden.' using errcode='42501'; end if;
 if action='classroom_list' then
   select coalesce(jsonb_agg(jsonb_build_object('sentence_id',e.sentence_id,'translation_id',e.translation_id,
     'reason',e.reason,'created_at',e.created_at) order by e.created_at desc),'[]'::jsonb)
   into result from quality_private.classroom_exclusions e where e.room_id=rid;
   return result;
 end if;
 if room.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 if coalesce(payload->>'sentence_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Satz.'; end if;
 sid:=(payload->>'sentence_id')::bigint;
 if action='classroom_hide' then
   if char_length(coalesce(payload->>'reason',''))>500 then raise exception 'Der Grund ist zu lang.'; end if;
   insert into quality_private.classroom_exclusions(room_id,sentence_id,translation_id,hidden_by,reason)
   values(rid,sid,0,uid,coalesce(payload->>'reason',''))
   on conflict(room_id,sentence_id,translation_id) do update set hidden_by=excluded.hidden_by,reason=excluded.reason,created_at=now();
 elsif action='classroom_restore' then
   delete from quality_private.classroom_exclusions where room_id=rid and sentence_id=sid and translation_id=0;
 else
   raise exception 'Unbekannte Aktion.';
 end if;
 return '{}'::jsonb;
end $$;
revoke all on function quality_private.api(text,jsonb) from public,anon,authenticated;
grant execute on function quality_private.api(text,jsonb) to authenticated;

create function public.sentence_quality_exclusions()
returns jsonb language sql stable security invoker set search_path='' as $$
 select quality_private.public_exclusions();
$$;
revoke all on function public.sentence_quality_exclusions() from public,anon,authenticated;
grant execute on function public.sentence_quality_exclusions() to anon,authenticated;

create function public.sentence_quality_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select quality_private.api(action,payload);
$$;
revoke all on function public.sentence_quality_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sentence_quality_api(text,jsonb) to authenticated;
