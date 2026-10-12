-- Unterstützen-Seite: Schwarm aus den Vornamen der Unterstützer.
--
-- Ablauf (ohne Konto, ohne E-Mail):
-- 1. Wer auf der Seite das Häkchen setzt und einen Vornamen eingibt, bekommt im Browser einen
--    Zufallsschlüssel. support_name_submit legt den Namen damit auf die Warteliste (noch unsichtbar).
-- 2. Donorbox leitet nach der Zahlung auf unterstuetzen.html?danke=1 zurück. Der Browser schickt
--    den Schlüssel an support_name_activate: Der Name wird sichtbar, für 6 Monate.
-- 3. Danach löscht support_private.cleanup() den Namen; übrig bleibt nur der Zähler „frühere
--    Unterstützer“ (ein namenloser Punkt im Schwarm). Nicht freigeschaltete Namen verschwinden
--    nach 30 Tagen. Gespeichert werden nur Vorname, Zeitpunkte und der Hash des Schlüssels.
-- Mitwirkende trägt der Betreiber von Hand ein (contributor=true, active_from=now(),
-- visible_until leer = bleibt, bis er den Eintrag löscht).
create schema if not exists support_private;
revoke all on schema support_private from public,anon,authenticated;
grant usage on schema support_private to anon,authenticated;

create table support_private.names(
  id uuid primary key default gen_random_uuid(),
  first_name text not null check (char_length(first_name) between 2 and 20
    and first_name ~ '^[[:alpha:]]+([ ''’-][[:alpha:]]+)*$'),
  token_hash text unique check (token_hash ~ '^[0-9a-f]{64}$'),
  contributor boolean not null default false,
  created_at timestamptz not null default now(),
  active_from timestamptz,
  visible_until timestamptz
);
create index names_active_idx on support_private.names(active_from) where active_from is not null;
create index names_pending_idx on support_private.names(created_at) where active_from is null;

create table support_private.stats(
  id integer primary key default 1 check (id=1),
  former integer not null default 0 check (former>=0)
);
insert into support_private.stats(id,former) values(1,0) on conflict do nothing;

-- Wörter, die nie im Schwarm stehen sollen (ohne Groß-/Kleinschreibung). Ab 5 Buchstaben genügt ein
-- Teilwort, kürzere müssen ein ganzes Namensteil sein – sonst träfe „nazi“ auch Nazim.
create table support_private.blocked_words(word text primary key check (word=lower(word) and char_length(word)>=3));
insert into support_private.blocked_words(word) values
 ('arsch'),('fick'),('fotze'),('hure'),('nutte'),('wichs'),('schlampe'),('hitler'),('nazi'),('neger'),('nigger'),('nigga'),
 ('kanake'),('schwuchtel'),('spast'),('missgeburt'),('penis'),('vagina'),('porn'),('sex'),('fuck'),('shit'),('bitch'),('cunt'),
 ('cock'),('pussy'),('whore'),('slut'),('rape'),('vittu'),('perkele'),('saatana'),('paska'),('huora'),('kyrpä'),('mulkku'),
 ('neekeri'),('homo'),('admin'),('vanamo')
on conflict do nothing;

alter table support_private.names enable row level security;
alter table support_private.stats enable row level security;
alter table support_private.blocked_words enable row level security;
revoke all on all tables in schema support_private from public,anon,authenticated;
create policy "deny direct browser access" on support_private.names for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on support_private.stats for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on support_private.blocked_words for all to anon,authenticated using(false) with check(false);

-- Vorname vereinheitlichen und prüfen; null = nicht erlaubt.
create function support_private.clean_name(raw text)
returns text language plpgsql stable security definer set search_path='' as $$
declare n text;
begin
  n:=regexp_replace(btrim(coalesce(raw,'')),'\s+',' ','g');
  if char_length(n) not between 2 and 20 or n !~ '^[[:alpha:]]+([ ''’-][[:alpha:]]+)*$' then return null; end if;
  if exists(select 1 from support_private.blocked_words b
             where (char_length(b.word)>=5 and position(b.word in lower(n))>0)
                or b.word = any(regexp_split_to_array(lower(n),'[ ''’-]'))) then return null; end if;
  return n;
end $$;

create function support_private.token_hash(token text)
returns text language sql immutable set search_path='' as $$
  select case when token ~ '^[0-9a-f]{64}$' then encode(sha256(convert_to(token,'UTF8')),'hex') end
$$;

-- Abgelaufene Namen löschen (und als frühere Unterstützer zählen), alte Wartelisten-Einträge entfernen.
create function support_private.cleanup()
returns void language plpgsql security definer set search_path='' as $$
declare gone integer;
begin
  with d as (delete from support_private.names where visible_until is not null and visible_until<=now() returning 1)
  select count(*) into gone from d;
  if gone>0 then update support_private.stats set former=former+gone where id=1; end if;
  delete from support_private.names where active_from is null and created_at<now()-interval '30 days';
end $$;

create function support_private.submit(p_name text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n text:=support_private.clean_name(p_name); h text:=support_private.token_hash(p_token); waiting integer;
begin
  if h is null then return jsonb_build_object('ok',false,'error','token'); end if;
  if n is null then return jsonb_build_object('ok',false,'error','name'); end if;
  perform support_private.cleanup();
  -- Die Warteliste bleibt klein: Bei mehr als 500 offenen Einträgen fallen die ältesten heraus.
  select count(*) into waiting from support_private.names where active_from is null;
  if waiting>=500 then
    delete from support_private.names where id in (select id from support_private.names where active_from is null order by created_at limit waiting-499);
  end if;
  insert into support_private.names(first_name,token_hash) values(n,h)
  on conflict(token_hash) do update set first_name=excluded.first_name,created_at=now()
    where support_private.names.active_from is null;
  return jsonb_build_object('ok',true,'name',n);
end $$;

create function support_private.activate(p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare h text:=support_private.token_hash(p_token); n text;
begin
  if h is null then return jsonb_build_object('ok',false); end if;
  update support_private.names
     set active_from=now(),visible_until=now()+interval '6 months',token_hash=null
   where token_hash=h and active_from is null and created_at>now()-interval '3 days'
  returning first_name into n;
  if n is null then return jsonb_build_object('ok',false); end if;
  return jsonb_build_object('ok',true,'name',n);
end $$;

create function support_private.swarm()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform support_private.cleanup();
  return jsonb_build_object(
    'names',(select coalesce(jsonb_agg(jsonb_build_object('name',x.first_name,'contributor',x.contributor) order by x.active_from),'[]'::jsonb)
      from (select first_name,contributor,active_from from support_private.names
             where active_from is not null and (visible_until is null or visible_until>now())
             order by active_from desc limit 200) x),
    'former',(select former from support_private.stats where id=1)
  );
end $$;

revoke all on all functions in schema support_private from public,anon,authenticated;
grant execute on function support_private.submit(text,text),support_private.activate(text),support_private.swarm() to anon,authenticated;

create function public.support_swarm()
returns jsonb language sql security invoker set search_path='' as $$ select support_private.swarm(); $$;
create function public.support_name_submit(p_name text,p_token text)
returns jsonb language sql security invoker set search_path='' as $$ select support_private.submit(p_name,p_token); $$;
create function public.support_name_activate(p_token text)
returns jsonb language sql security invoker set search_path='' as $$ select support_private.activate(p_token); $$;
revoke all on function public.support_swarm(),public.support_name_submit(text,text),public.support_name_activate(text) from public,anon,authenticated;
grant execute on function public.support_swarm(),public.support_name_submit(text,text),public.support_name_activate(text) to anon,authenticated;

-- Nächtliches Aufräumen, wo pg_cron verfügbar ist (Supabase). swarm() und submit() räumen zusätzlich bei jedem Aufruf auf.
do $cron$
begin
  if exists(select 1 from pg_available_extensions where name='pg_cron') then
    execute 'create extension if not exists pg_cron';
    execute $q$select cron.schedule('support-swarm-cleanup','17 3 * * *','select support_private.cleanup()')$q$;
  end if;
end $cron$;
