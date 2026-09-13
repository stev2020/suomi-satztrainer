-- Recorded through the Supabase migration mechanism.
-- Existing posts remain independent roots. Replies are tied to the same
-- assignment and sentence; no existing text is changed by this migration.
alter table classroom_private.messages add column if not exists parent_id uuid;
alter table classroom_private.messages add column if not exists deleted boolean not null default false;
do $guard$ begin
 if not exists(select 1 from pg_constraint where conrelid='classroom_private.messages'::regclass and conname='messages_thread_target') then
 alter table classroom_private.messages add constraint messages_thread_target unique(id,assignment_id,item_index);
 end if;
end $guard$;
do $guard$ begin
 if not exists(select 1 from pg_constraint where conrelid='classroom_private.messages'::regclass and conname='messages_parent_same_sentence') then
 alter table classroom_private.messages add constraint messages_parent_same_sentence foreign key(parent_id,assignment_id,item_index) references classroom_private.messages(id,assignment_id,item_index) on delete cascade;
 end if;
end $guard$;
do $guard$ begin
 if not exists(select 1 from pg_constraint where conrelid='classroom_private.messages'::regclass and conname='messages_not_self_parent') then
 alter table classroom_private.messages add constraint messages_not_self_parent check(parent_id is null or parent_id<>id);
 end if;
end $guard$;
create index if not exists messages_parent_idx on classroom_private.messages(parent_id,assignment_id,item_index);

CREATE OR REPLACE FUNCTION classroom_private.api(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid := auth.uid(); rid uuid; aid uuid; sid uuid; mid uuid;
 r classroom_private.rooms; a classroom_private.assignments;
 teacher boolean; result jsonb; n integer; stamp timestamptz;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>250000 then raise exception 'Ungültige Anfrage.'; end if;
 -- Return errors for throttled/invalid invitations so attempts remain counted.
 if action not in ('list','room') then
   insert into classroom_private.throttle(user_id) values(uid) on conflict do nothing;
   select hits,started_at into n,stamp from classroom_private.throttle where user_id=uid for update;
   if stamp < now()-interval '1 minute' then n:=0; stamp:=now(); end if;
   update classroom_private.throttle set hits=n+1,started_at=stamp where user_id=uid;
   if n>=30 then return jsonb_build_object('error','Zu viele Aktionen. Bitte eine Minute warten.'); end if;
 end if;
 if action='list' then
   select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'teacher',q.owner_id=uid,'archived',q.archived) order by q.created_at desc),'[]') into result
   from classroom_private.rooms q where q.owner_id=uid or exists(select 1 from classroom_private.members m where m.room_id=q.id and m.user_id=uid and not m.blocked);
   return result;
 elsif action='create' then
   perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
   if (select count(*) from classroom_private.rooms where owner_id=uid)>=10 then raise exception 'Maximal 10 Klassenräume pro Konto.'; end if;
   insert into classroom_private.rooms(owner_id,name) values(uid,trim(payload->>'name')) returning id into rid;
   return jsonb_build_object('id',rid);
 elsif action='join' then
   select * into r from classroom_private.rooms where code=upper(regexp_replace(payload->>'code','[[:space:]-]','','g')) and not archived for update;
   if r.id is null then return jsonb_build_object('error','Code ungültig oder Raum geschlossen.'); end if;
   if exists(select 1 from classroom_private.members where room_id=r.id and user_id=uid and blocked) then return jsonb_build_object('error','Beitritt nicht möglich. Bitte die Lehrkraft kontaktieren.'); end if;
   if r.owner_id=uid then return jsonb_build_object('id',r.id); end if;
   if (select count(*) from classroom_private.members where room_id=r.id and not blocked)>=100 then return jsonb_build_object('error','Dieser Raum ist voll (100 Teilnehmer).'); end if;
   if (select count(*) from classroom_private.members where user_id=uid and not blocked)>=30 then return jsonb_build_object('error','Maximal 30 Mitgliedschaften pro Konto.'); end if;
   insert into classroom_private.members(room_id,user_id) values(r.id,uid) on conflict do nothing;
   return jsonb_build_object('id',r.id);
 end if;
 rid:=(payload->>'room_id')::uuid;
 select * into r from classroom_private.rooms where id=rid for update;
 teacher:=r.owner_id=uid;
 if r.id is null or not (teacher or exists(select 1 from classroom_private.members where room_id=rid and user_id=uid and not blocked)) then
   raise exception 'Kein Zugriff auf diesen Klassenraum.' using errcode='42501';
 end if;
 if action='room' then
   return jsonb_build_object('id',r.id,'name',r.name,'teacher',teacher,'archived',r.archived,'code',case when teacher then r.code else null end,
   'member_count',(select count(*) from classroom_private.members where room_id=rid and not blocked),
   'members',jsonb_build_array(jsonb_build_object('id',case when teacher then r.owner_id else null end,'name',(select username from public.profiles where user_id=r.owner_id),'role','teacher','blocked',false)) ||
     (select coalesce(jsonb_agg(jsonb_build_object('id',case when teacher then m.user_id else null end,'name',p.username,'role','student','blocked',m.blocked) order by p.username),'[]') from classroom_private.members m join public.profiles p on p.user_id=m.user_id where m.room_id=rid and m.user_id<>r.owner_id and (teacher or not m.blocked)),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'items',q.items,'due_at',q.due_at,'released',q.released,
     'submissions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'own',s.user_id=uid,'author',case when teacher then p.username else null end,'answers',s.answers,'created_at',s.created_at,
       'reactions',(select jsonb_build_object('helpful',count(*) filter(where kind='helpful'),'interesting',count(*) filter(where kind='interesting'),'encouraging',count(*) filter(where kind='encouraging')) from classroom_private.reactions z where z.submission_id=s.id)) order by s.id),'[]') from classroom_private.submissions s join public.profiles p on p.user_id=s.user_id where s.assignment_id=q.id and (teacher or s.user_id=uid or q.released)),
     'submitted_count',(select count(*) from classroom_private.submissions s join classroom_private.members m on m.room_id=rid and m.user_id=s.user_id and not m.blocked where s.assignment_id=q.id),
     'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'author',p.username,'own',v.user_id=uid,'item_index',v.item_index,'body',v.body,'parent_id',v.parent_id,'deleted',v.deleted,'teacher',v.user_id=r.owner_id,'created_at',v.created_at) order by v.created_at,v.id),'[]') from classroom_private.messages v join public.profiles p on p.user_id=v.user_id where v.assignment_id=q.id)
   ) order by q.created_at desc),'[]') from classroom_private.assignments q where q.room_id=rid));
 end if;
 if action='leave' and not teacher then
   delete from classroom_private.members where room_id=rid and user_id=uid;
   return '{}'::jsonb;
 end if;
 if r.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 if action in ('rotate','archive','remove','assign','release') and not teacher then raise exception 'Nur die Lehrkraft darf das.' using errcode='42501'; end if;
 if action='rotate' then
   update classroom_private.rooms set code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) where id=rid;
 elsif action='archive' then
   update classroom_private.rooms set archived=true where id=rid;
 elsif action='remove' then
   update classroom_private.members set blocked=true where room_id=rid and user_id=(payload->>'user_id')::uuid;
 elsif action='assign' then
   if (select count(*) from classroom_private.assignments where room_id=rid)>=100 then raise exception 'Maximal 100 Aufgabenpakete pro Raum.'; end if;
   if exists(select 1 from jsonb_array_elements(payload->'items') x where jsonb_typeof(x)<>'object' or coalesce(length(x->>'text'),0)=0 or coalesce(length(x->'translations'->0->>'text'),0)=0) then raise exception 'Satzdaten unvollständig.'; end if;
   insert into classroom_private.assignments(room_id,title,items,due_at) values(rid,trim(payload->>'title'),payload->'items',nullif(payload->>'due_at','')::timestamptz);
 else
   aid:=(payload->>'assignment_id')::uuid;
   select * into a from classroom_private.assignments where id=aid and room_id=rid for update;
   if a.id is null then raise exception 'Aufgabe nicht gefunden.'; end if;
   if action='release' then
     update classroom_private.assignments set released=true where id=aid;
   elsif action='submit' then
     if teacher then raise exception 'Die Lehrkraft reicht keine Teilnehmerabgabe ein.'; end if;
     if a.released or (a.due_at is not null and a.due_at<now()) then raise exception 'Abgabe geschlossen.'; end if;
     if jsonb_typeof(payload->'answers') is distinct from 'array' then raise exception 'Antworten fehlen.'; end if;
     if jsonb_array_length(payload->'answers')<>jsonb_array_length(a.items) or exists(select 1 from jsonb_array_elements(payload->'answers') x where jsonb_typeof(x)<>'string' or length(trim(x#>>'{}')) not between 1 and 2000) then raise exception 'Bitte jeden Satz beantworten (maximal 2000 Zeichen).'; end if;
     insert into classroom_private.submissions(assignment_id,user_id,answers) values(aid,uid,payload->'answers');
   elsif action='message' then
     if (payload->>'item_index')::integer>=jsonb_array_length(a.items) then raise exception 'Satz nicht gefunden.'; end if;
     if (select count(*) from classroom_private.messages where assignment_id=aid)>=300 then raise exception 'Diskussion voll (300 Beiträge).'; end if;
     mid:=nullif(payload->>'parent_id','')::uuid;
     if mid is not null and not exists(select 1 from classroom_private.messages where id=mid and assignment_id=aid and item_index=(payload->>'item_index')::integer) then
       raise exception 'Der Bezugsbeitrag gehört nicht zu diesem Satz dieser Aufgabe.' using errcode='42501';
     end if;
     insert into classroom_private.messages(assignment_id,user_id,item_index,body,parent_id) values(aid,uid,(payload->>'item_index')::integer,trim(payload->>'body'),mid);
   elsif action='delete_message' then
     update classroom_private.messages set body='[Beitrag entfernt]',deleted=true where id=(payload->>'message_id')::uuid and assignment_id=aid and (teacher or user_id=uid);
   elsif action='react' then
     sid:=(payload->>'submission_id')::uuid;
     if not a.released then raise exception 'Vergleich ist noch nicht freigegeben.'; end if;
     if not exists(select 1 from classroom_private.submissions where id=sid and assignment_id=aid) then raise exception 'Abgabe nicht gefunden.'; end if;
     insert into classroom_private.reactions(submission_id,user_id,kind) values(sid,uid,payload->>'kind') on conflict(submission_id,user_id) do update set kind=excluded.kind;
   else raise exception 'Unbekannte Aktion.';
   end if;
 end if;
 return '{}'::jsonb;
end $function$
;
