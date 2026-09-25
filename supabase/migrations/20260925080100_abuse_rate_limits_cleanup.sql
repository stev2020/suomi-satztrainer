-- Rate-limit counters hold pseudonymous data (HMAC of IP address or username).
-- They were never removed. Every call now deletes counters older than two days;
-- the longest window is one day, so no active limit is affected.
create or replace function public.consume_abuse_limit(
  p_action text,
  p_subject_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
begin
  if p_action is null or length(p_action) > 80
     or p_subject_hash !~ '^[0-9a-f]{64}$'
     or p_limit < 1 or p_limit > 1000
     or p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'invalid rate-limit parameters';
  end if;

  -- Datensparsamkeit: abgelaufene Zähler (HMAC von IP-Adresse bzw. Benutzername)
  -- werden gelöscht, sobald sie älter als zwei Tage sind.
  delete from public.abuse_rate_limits
   where window_start < now() - interval '2 days';

  insert into public.abuse_rate_limits(action, subject_hash, window_seconds, window_start, request_count)
  values (p_action, p_subject_hash, p_window_seconds, now(), 1)
  on conflict (action, subject_hash, window_seconds)
  do update set
    request_count = case
      when abuse_rate_limits.window_start <= now() - make_interval(secs => excluded.window_seconds)
        then 1
      else abuse_rate_limits.request_count + 1
    end,
    window_start = case
      when abuse_rate_limits.window_start <= now() - make_interval(secs => excluded.window_seconds)
        then now()
      else abuse_rate_limits.window_start
    end
  returning request_count <= p_limit into allowed;

  return allowed;
end;
$$;

revoke all on function public.consume_abuse_limit(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_abuse_limit(text,text,integer,integer) to service_role;
create index if not exists abuse_rate_limits_window_start_idx on public.abuse_rate_limits(window_start);
