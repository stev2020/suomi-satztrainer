-- Verwaltung und Satzprüfung nur noch mit zweitem Faktor (Code aus einer Authenticator-App).
-- Supabase vermerkt im Zugangstoken, wie man sich angemeldet hat: aal1 = nur Passwort, aal2 = Passwort + Code.
-- Die öffentlichen Einstiege prüfen das, bevor sie die eigentlichen Funktionen aufrufen; direkt sind diese
-- für angemeldete Nutzer nicht mehr aufrufbar. Gestohlenes Passwort allein reicht damit nicht mehr.

create or replace function public.admin_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare aal2 boolean:=coalesce(auth.jwt()->>'aal','')='aal2'; r jsonb;
begin
  if action='status' then
    r:=admin_private.api('status',coalesce(payload,'{}'::jsonb));
    return r||jsonb_build_object('aal2',aal2,'ok',coalesce((r->>'admin')::boolean,false) and aal2);
  end if;
  if not aal2 then raise exception 'Bitte mit dem Code aus der Authenticator-App anmelden.' using errcode='42501'; end if;
  return admin_private.api(action,payload);
end $$;
revoke all on function public.admin_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.admin_api(text,jsonb) to authenticated;
revoke all on function admin_private.api(text,jsonb) from public,anon,authenticated;

create or replace function public.sentence_quality_review_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if action<>'status' and coalesce(auth.jwt()->>'aal','')<>'aal2' then
    raise exception 'Bitte mit dem Code aus der Authenticator-App anmelden.' using errcode='42501';
  end if;
  return quality_private.review_api(action,payload);
end $$;
revoke all on function public.sentence_quality_review_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sentence_quality_review_api(text,jsonb) to authenticated;
revoke all on function quality_private.review_api(text,jsonb) from public,anon,authenticated;
