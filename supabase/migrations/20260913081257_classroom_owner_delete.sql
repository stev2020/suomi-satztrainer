-- Owner-only deletion, including archived rooms. Existing room FK cascades
-- remove classroom content only; auth.users and learning_state are not deleted.
create function classroom_private.delete_room(payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid := auth.uid();
 r classroom_private.rooms;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then
  raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>1000 then
  raise exception 'Ungültige Anfrage.';
 end if;
 select * into r from classroom_private.rooms
 where id=(payload->>'room_id')::uuid and owner_id=uid for update;
 if r.id is null then
  raise exception 'Nur der Ersteller darf diesen Klassenraum löschen.' using errcode='42501';
 end if;
 if (payload->>'confirm_name') is distinct from r.name then
  raise exception 'Bitte den Raumnamen exakt eingeben.';
 end if;
 delete from classroom_private.rooms where id=r.id and owner_id=uid;
 return jsonb_build_object('deleted',true,'room_id',r.id);
end $$;
revoke all on function classroom_private.delete_room(jsonb) from public,anon,authenticated;
grant execute on function classroom_private.delete_room(jsonb) to authenticated;

create or replace function public.classroom_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select case when action='delete_room'
 then classroom_private.delete_room(payload)
 else classroom_private.api(action,payload) end;
$$;
revoke all on function public.classroom_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.classroom_api(text,jsonb) to authenticated;
