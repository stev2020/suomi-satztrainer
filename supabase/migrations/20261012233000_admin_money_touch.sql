-- PayPal-Abruf: Zeitpunkt sofort beim Start merken, damit parallele Aufrufe nicht doppelt bei PayPal fragen.
create or replace function admin_private.money_store(p jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
  if p ? 'touch' then
    update admin_private.money_sync set last_try=now() where id=1;
    return jsonb_build_object('ok',true);
  end if;
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
revoke all on function admin_private.money_store(jsonb) from public,anon,authenticated;
grant execute on function admin_private.money_store(jsonb) to service_role;

-- Stündlicher Abruf bei PayPal (über die Edge Function paypal-sync), wo pg_cron und pg_net verfügbar sind.
do $cron$
begin
  if exists(select 1 from pg_available_extensions where name='pg_net') and exists(select 1 from pg_extension where extname='pg_cron') then
    execute 'create extension if not exists pg_net with schema extensions';
    execute $q$select cron.schedule('paypal-sync','7 * * * *',$job$select net.http_post(url:='https://sjhixmqlpuldwigfwybi.supabase.co/functions/v1/paypal-sync',headers:='{"Content-Type":"application/json"}'::jsonb,body:='{}'::jsonb)$job$)$q$;
  end if;
end $cron$;
