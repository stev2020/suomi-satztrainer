-- Self-service account deletion. A deletion plan is stored briefly so a
-- BEFORE DELETE trigger can transfer owned rooms in the same transaction as
-- the Auth deletion. Rooms without a successor are deleted by the existing
-- ON DELETE CASCADE relation.
create schema if not exists account_private;
revoke all on schema account_private from public, anon, authenticated;
grant usage on schema account_private to authenticated;

create table account_private.deletion_transfers (
 user_id uuid not null references auth.users(id) on delete cascade,
 room_id uuid not null references classroom_private.rooms(id) on delete cascade,
 new_owner_id uuid references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key (user_id, room_id)
);
create index deletion_transfers_new_owner_idx on account_private.deletion_transfers(new_owner_id);
create index deletion_transfers_room_idx on account_private.deletion_transfers(room_id);
alter table account_private.deletion_transfers enable row level security;
revoke all on account_private.deletion_transfers from public, anon, authenticated;
create policy "deny direct browser access" on account_private.deletion_transfers
 for all to anon, authenticated using(false) with check(false);

create function account_private.deletion_manifest()
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles p where p.user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 select jsonb_build_object(
   'username',(select p.username from public.profiles p where p.user_id=uid),
   'rooms',coalesce((select jsonb_agg(jsonb_build_object(
     'id',r.id,'name',r.name,
     'teachers',coalesce((select jsonb_agg(jsonb_build_object('id',m.user_id,'name',p.username) order by p.username)
       from classroom_private.members m join public.profiles p on p.user_id=m.user_id
       where m.room_id=r.id and m.user_id<>uid and not m.blocked and m.role='teacher'),'[]'::jsonb)
   ) order by r.name) from classroom_private.rooms r where r.owner_id=uid),'[]'::jsonb)
 ) into result;
 return result;
end $$;
revoke all on function account_private.deletion_manifest() from public,anon,authenticated;
grant execute on function account_private.deletion_manifest() to authenticated;

create function account_private.prepare_deletion(decisions jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); owned_count integer; decision_count integer;
begin
 if uid is null or not exists(select 1 from public.profiles p where p.user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if decisions is null or jsonb_typeof(decisions)<>'array' or octet_length(decisions::text)>100000 then
   raise exception 'Ungültige Klassenraum-Auswahl.';
 end if;
 if exists(select 1 from jsonb_array_elements(decisions) d
   where jsonb_typeof(d)<>'object'
      or coalesce(d->>'room_id','')!~'^[0-9a-fA-F-]{36}$'
      or (d ? 'new_owner_id' and d->>'new_owner_id' is not null and d->>'new_owner_id'<>''
          and d->>'new_owner_id'!~'^[0-9a-fA-F-]{36}$')) then
   raise exception 'Ungültige Klassenraum-Auswahl.';
 end if;
 select count(*) into owned_count from classroom_private.rooms r where r.owner_id=uid;
 select count(distinct d->>'room_id') into decision_count from jsonb_array_elements(decisions) d;
 if decision_count<>owned_count or jsonb_array_length(decisions)<>owned_count or exists(
   select 1 from jsonb_array_elements(decisions) d
   where not exists(select 1 from classroom_private.rooms r where r.id=(d->>'room_id')::uuid and r.owner_id=uid)
 ) then raise exception 'Bitte entscheide für jeden eigenen Klassenraum.'; end if;

 delete from account_private.deletion_transfers t where t.user_id=uid;
 insert into account_private.deletion_transfers(user_id,room_id,new_owner_id)
 select uid,(d->>'room_id')::uuid,nullif(d->>'new_owner_id','')::uuid
 from jsonb_array_elements(decisions) d;

 if exists(select 1 from account_private.deletion_transfers t
   where t.user_id=uid and t.new_owner_id is not null and not exists(
     select 1 from classroom_private.members m where m.room_id=t.room_id
       and m.user_id=t.new_owner_id and not m.blocked and m.role='teacher')) then
   raise exception 'Die ausgewählte Nachfolge ist nicht mehr als Lehrkraft aktiv.';
 end if;

 return jsonb_build_object('storage_objects',coalesce((
   select jsonb_agg(distinct f.id::text)
   from classroom_private.stream_files f
   join classroom_private.rooms r on r.id=f.room_id
   left join account_private.deletion_transfers t on t.user_id=uid and t.room_id=r.id
   where f.user_id=uid or (r.owner_id=uid and t.new_owner_id is null)
 ),'[]'::jsonb));
end $$;
revoke all on function account_private.prepare_deletion(jsonb) from public,anon,authenticated;
grant execute on function account_private.prepare_deletion(jsonb) to authenticated;

create function account_private.cancel_deletion()
returns void language sql security definer set search_path='' as $$
 delete from account_private.deletion_transfers t where t.user_id=auth.uid();
$$;
revoke all on function account_private.cancel_deletion() from public,anon,authenticated;
grant execute on function account_private.cancel_deletion() to authenticated;

create function account_private.apply_deletion_transfers()
returns trigger language plpgsql security definer set search_path='' as $$
declare transfer account_private.deletion_transfers%rowtype;
begin
 for transfer in select * from account_private.deletion_transfers t where t.user_id=old.id and t.new_owner_id is not null loop
   if not exists(select 1 from classroom_private.members m where m.room_id=transfer.room_id
     and m.user_id=transfer.new_owner_id and not m.blocked and m.role='teacher') then
     raise exception 'Die ausgewählte Klassenraum-Nachfolge ist nicht mehr verfügbar.';
   end if;
   update classroom_private.rooms set owner_id=transfer.new_owner_id
    where id=transfer.room_id and owner_id=old.id;
   delete from classroom_private.members where room_id=transfer.room_id and user_id=transfer.new_owner_id;
 end loop;
 return old;
end $$;
revoke all on function account_private.apply_deletion_transfers() from public,anon,authenticated;

create trigger apply_account_deletion_transfers
before delete on auth.users
for each row execute function account_private.apply_deletion_transfers();

create function public.account_deletion_manifest()
returns jsonb language sql security invoker set search_path='' as $$
 select account_private.deletion_manifest();
$$;
create function public.account_prepare_deletion(decisions jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select account_private.prepare_deletion(decisions);
$$;
create function public.account_cancel_deletion()
returns void language sql security invoker set search_path='' as $$
 select account_private.cancel_deletion();
$$;
revoke all on function public.account_deletion_manifest(),public.account_prepare_deletion(jsonb),public.account_cancel_deletion() from public,anon,authenticated;
grant execute on function public.account_deletion_manifest(),public.account_prepare_deletion(jsonb),public.account_cancel_deletion() to authenticated;
