-- Verwaltung (nur für den Betreiber): Zahlen, Seitenfehler, Rückmeldungen, Einstellungen, Unterstützungen.
--
-- Datenschutz:
--  * Die Verwaltung bekommt nur Summen und Zählungen – keine Konten, Namen, E-Mail-Adressen oder Lernverläufe.
--    Durchschnitte und Summen über einzelne Lernende erscheinen erst ab 5 Personen (MIN_GROUP).
--  * Seitenfehler werden ohne Konto, ohne IP-Adresse und ohne Eingaben gespeichert: nur Fehlertext (bereinigt),
--    Datei und Zeile, Seitenpfad, Browser- und Systemfamilie. Löschung 30 Tage nach dem letzten Auftreten.
--  * Rückmeldungen sind anonym (ohne Absender). Archivierte werden nach 30 Tagen gelöscht, alle nach 180 Tagen.
--  * Von PayPal werden nur Monatssummen gespeichert (Beträge, Gebühren, Anzahl) – keine Transaktionen, keine Namen.
create schema if not exists admin_private;
revoke all on schema admin_private from public,anon,authenticated;
grant usage on schema admin_private to anon,authenticated;

create table admin_private.admins(
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
-- Der Betreiber ist bisher als einziger Prüfer eingetragen; er wird Admin. Weitere Admins nur von Hand per SQL.
insert into admin_private.admins(user_id) select user_id from quality_private.reviewers on conflict do nothing;

create table admin_private.settings(
  id integer primary key default 1 check (id=1),
  month_goal numeric(10,2) not null default 10 check (month_goal>0 and month_goal<=100000),
  notice_on boolean not null default false,
  notice_text text not null default '' check (char_length(notice_text)<=200),
  notice_kind text not null default 'info' check (notice_kind in ('info','warn')),
  registration_open boolean not null default true,
  collect_errors boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into admin_private.settings(id) values(1) on conflict do nothing;

create table admin_private.client_errors(
  fingerprint text primary key check (fingerprint ~ '^[0-9a-f]{64}$'),
  message text not null check (char_length(message) between 1 and 300),
  source text not null default '' check (char_length(source)<=120),
  page text not null default '' check (char_length(page)<=60),
  platforms jsonb not null default '{}'::jsonb,
  hits integer not null default 1 check (hits>=1),
  status text not null default 'new' check (status in ('new','done')),
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index client_errors_last_seen_idx on admin_private.client_errors(last_seen);

create table admin_private.feedback(
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) between 3 and 1000),
  page text not null default '' check (char_length(page)<=60),
  status text not null default 'open' check (status in ('open','archived')),
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
create index feedback_status_idx on admin_private.feedback(status,created_at);

-- Grobe Bremse gegen Massenmeldungen, ohne irgendetwas über die Absender zu speichern.
create table admin_private.throttle(
  action text primary key,
  window_start timestamptz not null default now(),
  n integer not null default 0
);

create table admin_private.money_months(
  month date primary key check (extract(day from month)=1),
  gross numeric(12,2) not null default 0,
  fees numeric(12,2) not null default 0,
  payments integer not null default 0 check (payments>=0),
  recurring integer not null default 0 check (recurring>=0),
  last_payment_at timestamptz,
  updated_at timestamptz not null default now()
);
create table admin_private.money_sync(
  id integer primary key default 1 check (id=1),
  last_try timestamptz,
  last_ok timestamptz,
  last_error text check (char_length(last_error)<=200)
);
insert into admin_private.money_sync(id) values(1) on conflict do nothing;

alter table admin_private.admins enable row level security;
alter table admin_private.settings enable row level security;
alter table admin_private.client_errors enable row level security;
alter table admin_private.feedback enable row level security;
alter table admin_private.throttle enable row level security;
alter table admin_private.money_months enable row level security;
alter table admin_private.money_sync enable row level security;
revoke all on all tables in schema admin_private from public,anon,authenticated;
create policy "deny direct browser access" on admin_private.admins for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.settings for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.client_errors for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.feedback for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.throttle for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.money_months for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on admin_private.money_sync for all to anon,authenticated using(false) with check(false);

-- true = Aktion darf noch (höchstens p_limit je Minute, für alle zusammen).
create function admin_private.allow(p_action text,p_limit integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare ok boolean;
begin
  insert into admin_private.throttle(action,window_start,n) values(p_action,now(),1)
  on conflict(action) do update set
    n=case when admin_private.throttle.window_start<now()-interval '1 minute' then 1 else admin_private.throttle.n+1 end,
    window_start=case when admin_private.throttle.window_start<now()-interval '1 minute' then now() else admin_private.throttle.window_start end
  returning n<=p_limit into ok;
  return ok;
end $$;

-- Fehlertexte von allem befreien, was auf eine Person zeigen könnte.
create function admin_private.scrub(raw text,max_len integer)
returns text language sql immutable set search_path='' as $$
  select left(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
    coalesce(raw,''),
    '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}','[E-Mail]','g'),
    '(https?://[^/[:space:]]+)?(/[^?#[:space:]]*)?[?#][^[:space:])]*','\1\2','g'),
    '[A-Za-z0-9_-]{24,}','…','g'),
    '[0-9]{6,}','#','g'),
    '[[:cntrl:]]+',' ','g')),max_len)
$$;

-- Nur Dateiname, Zeile und Spalte – nie die volle Adresse.
create function admin_private.short_source(raw text)
returns text language sql immutable set search_path='' as $$
  select left(regexp_replace(regexp_replace(coalesce(raw,''),'[?#][^:[:space:]]*',''),'^.*/',''),120)
$$;

create function admin_private.record_error(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare msg text; src text; pg text; plat text; fp text; n integer;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>4000 then return jsonb_build_object('ok',false); end if;
  if not (select collect_errors from admin_private.settings where id=1) then return jsonb_build_object('ok',false,'off',true); end if;
  msg:=admin_private.scrub(p->>'message',300);
  if char_length(msg)<1 then return jsonb_build_object('ok',false); end if;
  src:=admin_private.short_source(p->>'source');
  pg:=coalesce(substring(p->>'page' from '^/[A-Za-z0-9._/-]{0,58}'),'/');
  plat:=left(regexp_replace(coalesce(p->>'browser',''),'[^A-Za-z0-9 .]','','g'),24)
     ||' · '||left(regexp_replace(coalesce(p->>'os',''),'[^A-Za-z0-9 ]','','g'),16);
  if not admin_private.allow('client-error',30) then return jsonb_build_object('ok',false,'busy',true); end if;
  fp:=encode(sha256(convert_to(msg||'|'||src,'UTF8')),'hex');
  update admin_private.client_errors set
    hits=least(hits+1,1000000),last_seen=now(),page=pg,
    status=case when status='done' then 'new' else status end,
    platforms=case when platforms ? plat or (select count(*) from jsonb_object_keys(platforms))<8
      then jsonb_set(platforms,array[plat],to_jsonb(coalesce((platforms->>plat)::integer,0)+1)) else platforms end
  where fingerprint=fp;
  if found then return jsonb_build_object('ok',true); end if;
  select count(*) into n from admin_private.client_errors;
  if n>=300 then return jsonb_build_object('ok',false,'full',true); end if;
  insert into admin_private.client_errors(fingerprint,message,source,page,platforms)
  values(fp,msg,src,pg,jsonb_build_object(plat,1)) on conflict do nothing;
  return jsonb_build_object('ok',true);
end $$;

create function admin_private.record_feedback(p_message text,p_page text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare msg text:=left(btrim(regexp_replace(coalesce(p_message,''),'[\x01-\x09\x0b-\x1f\x7f]+',' ','g')),1000); n integer;
begin
  if char_length(msg)<3 then return jsonb_build_object('ok',false,'error','short'); end if;
  if not admin_private.allow('feedback',10) then return jsonb_build_object('ok',false,'error','busy'); end if;
  select count(*) into n from admin_private.feedback where status='open';
  if n>=200 then return jsonb_build_object('ok',false,'error','busy'); end if;
  insert into admin_private.feedback(message,page)
  values(msg,coalesce(substring(coalesce(p_page,'') from '^/[A-Za-z0-9._/-]{0,58}'),'/'));
  return jsonb_build_object('ok',true);
end $$;

create function admin_private.cleanup()
returns void language plpgsql security definer set search_path='' as $$
begin
  delete from admin_private.client_errors where last_seen<now()-interval '30 days';
  delete from admin_private.feedback where (status='archived' and archived_at<now()-interval '30 days') or created_at<now()-interval '180 days';
  delete from admin_private.money_months where month<(date_trunc('month',now() at time zone 'Europe/Berlin')-interval '12 months')::date;
end $$;

-- Öffentlich: Hinweisband, Registrierung offen?, Füllstand des Monatsziels in Prozent (keine Beträge).
create function admin_private.public_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s admin_private.settings%rowtype; got numeric;
begin
  select * into s from admin_private.settings where id=1;
  select gross into got from admin_private.money_months where month=date_trunc('month',now() at time zone 'Europe/Berlin')::date;
  return jsonb_build_object(
    'notice',case when s.notice_on and char_length(btrim(s.notice_text))>0 then jsonb_build_object('text',s.notice_text,'kind',s.notice_kind) end,
    'registration',s.registration_open,
    'goal_percent',least(100,greatest(0,round(coalesce(got,0)/s.month_goal*100)))::integer
  );
end $$;

-- Tageszähler-Schlüssel sicher lesen: Lernstände schreiben die Nutzer selbst, kaputte Werte dürfen nichts stören.
create function admin_private.day(k text)
returns date language plpgsql immutable set search_path='' as $$
begin
  if k is null or k !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return k::date;
exception when others then return null;
end $$;
create function admin_private.amount(v text)
returns numeric language sql immutable set search_path='' as $$
  select case when v ~ '^\d{1,9}(\.\d{1,6})?$' then v::numeric else 0 end
$$;

-- Aktuelle Serie eines Lernenden aus seinem Tageszähler (heute oder gestern muss geübt sein).
create function admin_private.streak(daily jsonb,today date)
returns integer language sql immutable set search_path='' as $$
  with d as (
    select distinct admin_private.day(k) as day from jsonb_each_text(case when jsonb_typeof(daily)='object' then daily else '{}'::jsonb end) e(k,v)
    where admin_private.day(k) is not null and admin_private.amount(v)>0
  ), g as (select day, day-(row_number() over (order by day))::integer as grp from d),
  runs as (select max(day) as last_day,count(*) as len from g group by grp)
  select coalesce((select len::integer from runs where last_day>=today-1 order by last_day desc limit 1),0)
$$;

create function admin_private.overview()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  min_group constant integer:=5;
  today date:=(now() at time zone 'Europe/Berlin')::date;
  week0 date:=date_trunc('week',now() at time zone 'Europe/Berlin')::date;
  result jsonb; act jsonb; weekly jsonb; money jsonb; streaks record;
begin
  -- Aktivität je Lernendem nur als Zwischenergebnis; heraus gehen nur Summen.
  with days as (
    select l.user_id,admin_private.day(e.k) as d,admin_private.amount(e.v) as n
    from public.learning_state l,
      jsonb_each_text(case when jsonb_typeof(l.state->'daily')='object' then l.state->'daily' else '{}'::jsonb end) e(k,v)
  ), agg as (
    select user_id,
      sum(n) filter (where d=today) as n_today,
      sum(n) filter (where d between today-6 and today) as n_7,
      sum(n) filter (where d between today-13 and today-7) as n_prev7,
      max(d) filter (where n>0) as last_day
    from days where d is not null group by user_id
  ), per as (
    select coalesce(a.n_today,0) as n_today,coalesce(a.n_7,0) as n_7,coalesce(a.n_prev7,0) as n_prev7,a.last_day,
      admin_private.streak(l.state->'daily',today) as streak,
      (select count(*) from jsonb_object_keys(case when jsonb_typeof(l.state->'reviews')='object' then l.state->'reviews' else '{}'::jsonb end)) as cards
    from public.learning_state l left join agg a on a.user_id=l.user_id
  )
  select jsonb_build_object(
    'today',count(*) filter (where n_today>0),
    'd7',count(*) filter (where last_day>=today-6),
    'd30',count(*) filter (where last_day>=today-29),
    'practiced_today',case when count(*) filter (where n_today>0)>=min_group then sum(n_today) end,
    'practiced_7',case when count(*) filter (where n_7>0)>=min_group then sum(n_7) end,
    'practiced_prev7',case when count(*) filter (where n_prev7>0)>=min_group then sum(n_prev7) end,
    'streak_avg',case when count(*) filter (where streak>0)>=min_group then round(avg(streak) filter (where streak>0),1) end,
    'streak_users',count(*) filter (where streak>0),
    'cards_total',case when count(*) filter (where cards>0)>=min_group then sum(cards) end
  ) into act from per;

  select coalesce(jsonb_agg(jsonb_build_object('week',w,'n',coalesce(c.n,0)) order by w),'[]'::jsonb) into weekly
  from (select week0-7*i as w from generate_series(0,11) i) ws
  left join (select date_trunc('week',u.created_at at time zone 'Europe/Berlin')::date wk,count(*) n from auth.users u group by 1) c on c.wk=w;

  select jsonb_build_object(
    'months',coalesce((select jsonb_agg(jsonb_build_object('month',to_char(m.month,'YYYY-MM'),'gross',m.gross,'fees',m.fees,'payments',m.payments,'recurring',m.recurring) order by m.month)
      from admin_private.money_months m where m.month>(date_trunc('month',today)-interval '6 months')::date),'[]'::jsonb),
    'last_payment_at',(select max(last_payment_at) from admin_private.money_months),
    'last_ok',(select last_ok from admin_private.money_sync where id=1),
    'last_error',(select last_error from admin_private.money_sync where id=1),
    'goal',(select month_goal from admin_private.settings where id=1)
  ) into money;

  return jsonb_build_object(
    'min_group',min_group,
    'accounts',jsonb_build_object(
      'total',(select count(*) from auth.users),
      'new7',(select count(*) from auth.users where created_at>=now()-interval '7 days'),
      'with_email',(select count(*) from public.account_emails where verified_at is not null),
      'weekly',weekly),
    'activity',act,
    'classrooms',jsonb_build_object(
      'rooms',(select count(*) from classroom_private.rooms where not archived),
      'members',(select count(*) from classroom_private.members m join classroom_private.rooms r on r.id=m.room_id where not r.archived and not m.blocked)),
    'swarm',jsonb_build_object(
      'names',(select count(*) from support_private.names where active_from is not null and not contributor and (visible_until is null or visible_until>now())),
      'contributors',(select count(*) from support_private.names where contributor and active_from is not null)),
    'money',money,
    'todo',jsonb_build_object(
      'reports',(select count(*) from quality_private.reports where status='open'),
      'errors',(select count(*) from admin_private.client_errors where status='new'),
      'feedback',(select count(*) from admin_private.feedback where status='open'))
  );
end $$;

create function admin_private.api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb; n text; s admin_private.settings%rowtype; goal numeric;
begin
  if uid is null then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>5000 then raise exception 'Ungültige Anfrage.'; end if;
  if action='status' then
    return jsonb_build_object('admin',exists(select 1 from admin_private.admins a where a.user_id=uid));
  end if;
  if not exists(select 1 from admin_private.admins a where a.user_id=uid) then
    raise exception 'Keine Berechtigung.' using errcode='42501';
  end if;
  perform admin_private.cleanup();

  if action='overview' then return admin_private.overview(); end if;

  if action='errors' then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.status='done',e.last_seen desc),'[]'::jsonb) into result from (
      select fingerprint,message,source,page,platforms,hits,status,first_seen,last_seen from admin_private.client_errors
      order by status='done',last_seen desc limit 60) e;
    return result;
  end if;
  if action='error_done' then
    update admin_private.client_errors set status='done' where fingerprint=payload->>'fingerprint';
    return jsonb_build_object('ok',found);
  end if;

  if action='feedback' then
    select coalesce(jsonb_agg(to_jsonb(f) order by f.created_at desc),'[]'::jsonb) into result from (
      select id,message,page,created_at from admin_private.feedback where status='open' order by created_at desc limit 60) f;
    return result;
  end if;
  if action='feedback_archive' then
    if coalesce(payload->>'id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültige Rückmeldung.'; end if;
    update admin_private.feedback set status='archived',archived_at=now() where id=(payload->>'id')::uuid and status='open';
    return jsonb_build_object('ok',found);
  end if;

  if action='settings' then
    select * into s from admin_private.settings where id=1;
    return jsonb_build_object(
      'month_goal',s.month_goal,'notice_on',s.notice_on,'notice_text',s.notice_text,'notice_kind',s.notice_kind,
      'registration_open',s.registration_open,'collect_errors',s.collect_errors,'updated_at',s.updated_at,
      'swarm',(select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'name',x.first_name,'contributor',x.contributor,'until',x.visible_until) order by x.contributor desc,x.active_from),'[]'::jsonb)
        from support_private.names x where x.active_from is not null and (x.visible_until is null or x.visible_until>now())),
      'money',(select jsonb_build_object('last_ok',m.last_ok,'last_error',m.last_error,'last_try',m.last_try) from admin_private.money_sync m where m.id=1));
  end if;
  if action='settings_save' then
    if coalesce(payload->>'month_goal','') !~ '^[0-9]{1,6}([.,][0-9]{1,2})?$' then raise exception 'Bitte ein Monatsziel in Euro angeben.'; end if;
    goal:=replace(payload->>'month_goal',',','.')::numeric;
    if goal<=0 then raise exception 'Das Monatsziel muss größer als 0 sein.'; end if;
    if char_length(coalesce(payload->>'notice_text',''))>200 then raise exception 'Der Hinweis darf höchstens 200 Zeichen haben.'; end if;
    if coalesce(payload->>'notice_kind','info') not in ('info','warn') then raise exception 'Ungültige Hinweisart.'; end if;
    update admin_private.settings set
      month_goal=goal,
      notice_on=coalesce((payload->>'notice_on')::boolean,false),
      notice_text=btrim(regexp_replace(coalesce(payload->>'notice_text',''),'[[:cntrl:]]+',' ','g')),
      notice_kind=coalesce(payload->>'notice_kind','info'),
      registration_open=coalesce((payload->>'registration_open')::boolean,true),
      collect_errors=coalesce((payload->>'collect_errors')::boolean,true),
      updated_at=now()
    where id=1;
    if (select notice_on and notice_text='' from admin_private.settings where id=1) then
      raise exception 'Bitte einen Text für den Hinweis eingeben – oder den Hinweis ausschalten.';
    end if;
    return jsonb_build_object('ok',true,'updated_at',now());
  end if;

  if action='contributor_add' then
    n:=support_private.clean_name(payload->>'name');
    if n is null then raise exception 'Bitte einen Vornamen mit 2 bis 20 Buchstaben eingeben.'; end if;
    insert into support_private.names(first_name,contributor,active_from) values(n,true,now());
    return jsonb_build_object('ok',true,'name',n);
  end if;
  if action='swarm_remove' then
    if coalesce(payload->>'id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Eintrag.'; end if;
    delete from support_private.names where id=(payload->>'id')::uuid;
    return jsonb_build_object('ok',found);
  end if;
  raise exception 'Unbekannte Aktion.';
end $$;

-- Schreibzugang für die PayPal-Abfrage (Edge Function mit Service-Rolle). Erwartet nur Monatssummen.
create function admin_private.money_store(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
  if p ? 'error' then
    update admin_private.money_sync set last_try=now(),last_error=left(p->>'error',200) where id=1;
    return jsonb_build_object('ok',true);
  end if;
  for m in select * from jsonb_array_elements(coalesce(p->'months','[]'::jsonb)) loop
    insert into admin_private.money_months(month,gross,fees,payments,recurring,last_payment_at,updated_at)
    values(((m->>'month')||'-01')::date,(m->>'gross')::numeric,(m->>'fees')::numeric,(m->>'payments')::integer,
      (m->>'recurring')::integer,nullif(m->>'last_payment_at','')::timestamptz,now())
    on conflict(month) do update set gross=excluded.gross,fees=excluded.fees,payments=excluded.payments,
      recurring=excluded.recurring,last_payment_at=excluded.last_payment_at,updated_at=now();
  end loop;
  update admin_private.money_sync set last_try=now(),last_ok=now(),last_error=null where id=1;
  return jsonb_build_object('ok',true);
end $$;

-- Wie lange ist der letzte Abruf her? (Edge Function bremst damit manuelle Abrufe.)
create function admin_private.money_state()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('last_try',last_try,'last_ok',last_ok,'empty',not exists(select 1 from admin_private.money_months))
  from admin_private.money_sync where id=1
$$;

revoke all on all functions in schema admin_private from public,anon,authenticated;
grant execute on function admin_private.api(text,jsonb) to authenticated;
grant execute on function admin_private.record_error(jsonb),admin_private.record_feedback(text,text),admin_private.public_settings() to anon,authenticated;
grant usage on schema admin_private to service_role;
grant execute on function admin_private.money_store(jsonb),admin_private.money_state(),admin_private.public_settings() to service_role;

create function public.admin_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select admin_private.api(action,payload); $$;
create function public.report_client_error(p jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select admin_private.record_error(p); $$;
create function public.send_feedback(p_message text,p_page text default '/')
returns jsonb language sql security invoker set search_path='' as $$ select admin_private.record_feedback(p_message,p_page); $$;
create function public.app_settings()
returns jsonb language sql stable security invoker set search_path='' as $$ select admin_private.public_settings(); $$;
create function public.admin_money_store(p jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select admin_private.money_store(p); $$;
create function public.admin_money_state()
returns jsonb language sql stable security invoker set search_path='' as $$ select admin_private.money_state(); $$;
revoke all on function public.admin_api(text,jsonb),public.report_client_error(jsonb),public.send_feedback(text,text),public.app_settings(),
  public.admin_money_store(jsonb),public.admin_money_state() from public,anon,authenticated;
grant execute on function public.admin_api(text,jsonb) to authenticated;
grant execute on function public.report_client_error(jsonb),public.send_feedback(text,text),public.app_settings() to anon,authenticated;
grant execute on function public.admin_money_store(jsonb),public.admin_money_state(),public.app_settings() to service_role;

-- Nächtliches Aufräumen, wo pg_cron verfügbar ist (Supabase).
do $cron$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('admin-cleanup','23 3 * * *','select admin_private.cleanup()')$q$;
  end if;
end $cron$;
