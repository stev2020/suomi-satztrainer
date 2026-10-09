-- Fünf weitere Vogel-Avatare (Unglückshäher, Eisvogel, Buchfink, Seeadler, Turmfalke):
-- der Klassenraum liefert ihre Kennungen jetzt ebenfalls aus. Muss zu dist/avatars.mjs passen.
create or replace function classroom_private.avatar(uid uuid)
returns text language sql stable security invoker set search_path='' as $$
 select case when u.raw_user_meta_data->>'avatar' in ('raystaspaasky','punatulkku','sinitiainen','harmaalokki','tunturipollo','kapytikka','harakka','tilhi','viherpeippo','punarinta','kurki','kuukkeli','kuningaskalastaja','peippo','merikotka','tuulihaukka')
  then u.raw_user_meta_data->>'avatar' end
 from auth.users u where u.id=uid;
$$;
revoke all on function classroom_private.avatar(uuid) from public,anon,authenticated;
