-- Aufgabentyp „Finnisch → Deutsch“: Aufgaben bekommen eine Übersetzungsrichtung.
-- Neue Spalte classroom_private.assignments.direction ('de-fi' wie bisher oder
-- 'fi-de'); bestehende Aufgaben bleiben 'de-fi'. `assign` und `update_assignment`
-- nehmen direction an, `room` liefert sie je Aufgabe. Die Richtung lässt sich wie
-- die Sätze nur ändern, solange es keine Abgaben und keine Fragen gibt.
-- Der übrige Funktionstext ist unverändert.
alter table classroom_private.assignments add column direction text not null default 'de-fi' check(direction in ('de-fi','fi-de'));

CREATE OR REPLACE FUNCTION classroom_private.api(action text, payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 uid uuid := auth.uid(); rid uuid; aid uuid; sid uuid; mid uuid;
 r classroom_private.rooms; a classroom_private.assignments;
 display text; teacher boolean; owner boolean; result jsonb; n integer; stamp timestamptz;
begin
 if uid is null or not exists(select 1 from public.profiles where user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>250000 then raise exception 'Ungültige Anfrage.'; end if;
 -- Reads have their own, more generous limit (S4 in the 2026-10-01 check).
 if action in ('list','room') and not classroom_private.consume_read(uid) then
   return jsonb_build_object('error','Zu viele Anfragen. Bitte kurz warten.');
 end if;
 -- Return errors for throttled/invalid invitations so attempts remain counted.
 if action not in ('list','room') then
   insert into classroom_private.throttle(user_id) values(uid) on conflict do nothing;
   select hits,started_at into n,stamp from classroom_private.throttle where user_id=uid for update;
   if stamp < now()-interval '1 minute' then n:=0; stamp:=now(); end if;
   update classroom_private.throttle set hits=n+1,started_at=stamp where user_id=uid;
   if n>=30 then return jsonb_build_object('error','Zu viele Aktionen. Bitte eine Minute warten.'); end if;
 end if;
 if action in ('create','join','rename') then
   if jsonb_typeof(payload->'display_name') is distinct from 'string' then raise exception 'Bitte deinen Namen für diesen Klassenraum eingeben.'; end if;
   display:=regexp_replace(payload->>'display_name','^[[:space:]]+|[[:space:]]+$','','g');
   if char_length(display) not between 1 and 80 then raise exception 'Der Name muss 1–80 Zeichen lang sein.'; end if;
 end if;
 if action='list' then
   -- open_tasks: packages the caller can still hand in. activity: the newest thing
   -- in the room that somebody else did; the app compares it with what this
   -- device has already seen and shows a hint.
   select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'name',q.name,'owner',q.owner_id=uid,'teacher',classroom_private.is_teacher(q.id,uid),'archived',q.archived,
     'open_tasks',case when q.archived or classroom_private.is_teacher(q.id,uid) then 0 else (select count(*) from classroom_private.assignments x where x.room_id=q.id and not x.released and (x.due_at is null or x.due_at>=now()) and x.created_by is distinct from uid and not exists(select 1 from classroom_private.submissions s where s.assignment_id=x.id and s.user_id=uid)) end,
     'activity',(select max(z.t) from (
       select max(x.created_at) as t from classroom_private.assignments x where x.room_id=q.id and x.created_by is distinct from uid
       union all select max(p.created_at) from classroom_private.stream_posts p where p.room_id=q.id and not p.deleted and p.user_id<>uid
       union all select max(v.created_at) from classroom_private.messages v join classroom_private.assignments x on x.id=v.assignment_id where x.room_id=q.id and not v.deleted and v.user_id<>uid
       union all select max(w.updated_at) from classroom_private.feedback w join classroom_private.submissions s on s.id=w.submission_id join classroom_private.assignments x on x.id=s.assignment_id where x.room_id=q.id and s.user_id=uid and w.user_id<>uid
       union all select max(s.created_at) from classroom_private.submissions s join classroom_private.assignments x on x.id=s.assignment_id where x.room_id=q.id and x.created_by=uid and s.user_id<>uid
     ) z)) order by q.created_at desc),'[]') into result
   from classroom_private.rooms q where q.owner_id=uid or exists(select 1 from classroom_private.members m where m.room_id=q.id and m.user_id=uid and not m.blocked);
   return result;
 elsif action='create' then
   perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
   if (select count(*) from classroom_private.rooms where owner_id=uid)>=10 then raise exception 'Maximal 10 Klassenräume pro Konto.'; end if;
   insert into classroom_private.rooms(owner_id,name) values(uid,trim(payload->>'name')) returning id into rid;
   insert into classroom_private.display_names(room_id,user_id,name) values(rid,uid,display);
   return jsonb_build_object('id',rid);
 elsif action='join' then
   select * into r from classroom_private.rooms where code=upper(regexp_replace(payload->>'code','[[:space:]-]','','g')) and not archived for update;
   if r.id is null then return jsonb_build_object('error','Code ungültig oder Raum geschlossen.'); end if;
   if exists(select 1 from classroom_private.members where room_id=r.id and user_id=uid and blocked) then return jsonb_build_object('error','Beitritt nicht möglich. Bitte die Lehrkraft kontaktieren.'); end if;
   if r.owner_id=uid or exists(select 1 from classroom_private.members where room_id=r.id and user_id=uid and not blocked) then
     insert into classroom_private.display_names(room_id,user_id,name) values(r.id,uid,display)
       on conflict(room_id,user_id) do update set name=excluded.name;
     return jsonb_build_object('id',r.id);
   end if;
   if (select count(*) from classroom_private.members where room_id=r.id and not blocked)>=100 then return jsonb_build_object('error','Dieser Raum ist voll (100 Teilnehmer).'); end if;
   if (select count(*) from classroom_private.members where user_id=uid and not blocked)>=30 then return jsonb_build_object('error','Maximal 30 Mitgliedschaften pro Konto.'); end if;
   insert into classroom_private.members(room_id,user_id) values(r.id,uid) on conflict do nothing;
   insert into classroom_private.display_names(room_id,user_id,name) values(r.id,uid,display)
     on conflict(room_id,user_id) do update set name=excluded.name;
   return jsonb_build_object('id',r.id);
 end if;
 rid:=(payload->>'room_id')::uuid;
 -- Reading a room needs no row lock: an exclusive lock made all members of a
 -- room wait for each other. Changes keep the lock for their limit checks.
 if action='room' then
   select * into r from classroom_private.rooms where id=rid;
 else
   select * into r from classroom_private.rooms where id=rid for update;
 end if;
 owner:=r.owner_id=uid;
 teacher:=classroom_private.is_teacher(rid,uid);
 if r.id is null or not (teacher or exists(select 1 from classroom_private.members where room_id=rid and user_id=uid and not blocked)) then
   raise exception 'Kein Zugriff auf diesen Klassenraum.' using errcode='42501';
 end if;
 -- Only the caller's name can change; payload user_id is deliberately unused.
 -- Renaming also works in an archived room.
 if action='rename' then
   insert into classroom_private.display_names(room_id,user_id,name) values(rid,uid,display)
     on conflict(room_id,user_id) do update set name=excluded.name;
   return '{}'::jsonb;
 end if;
 if action='room' then
   return jsonb_build_object('id',r.id,'name',r.name,'owner',owner,'teacher',teacher,'archived',r.archived,'code',case when owner then r.code else null end,
   'teacher_count',1+(select count(*) from classroom_private.members where room_id=rid and not blocked and role='teacher'),
   'member_count',(select count(*) from classroom_private.members where room_id=rid and not blocked and role='student'),
   'members',jsonb_build_array(jsonb_build_object('id',case when teacher then r.owner_id else null end,'own',r.owner_id=uid,'name',classroom_private.display_name(rid,r.owner_id),'role','teacher','owner',true,'blocked',false)) ||
     (select coalesce(jsonb_agg(jsonb_build_object('id',case when teacher or m.user_id=uid then m.user_id else null end,'own',m.user_id=uid,'name',classroom_private.display_name(rid,m.user_id),'role',m.role,'owner',false,'blocked',m.blocked) order by classroom_private.display_name(rid,m.user_id),m.user_id),'[]') from classroom_private.members m join public.profiles p on p.user_id=m.user_id where m.room_id=rid and m.user_id<>r.owner_id and (owner or not m.blocked)),
   'assignments',(select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'title',q.title,'own_assignment',coalesce(q.created_by=uid,false),'items',q.items,'due_at',q.due_at,'released',q.released,'created_at',q.created_at,'direction',q.direction,
     'can_manage',teacher and (owner or coalesce(q.created_by=uid,false)),
     'items_locked',q.released or exists(select 1 from classroom_private.submissions s where s.assignment_id=q.id) or exists(select 1 from classroom_private.messages v where v.assignment_id=q.id),
     'submissions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'own',s.user_id=uid,'author_id',case when teacher then s.user_id else null end,'author',case when teacher then classroom_private.display_name(rid,s.user_id) else null end,'answers',s.answers,'created_at',s.created_at,
       -- Comments of the teacher: only for the author of the submission and for whoever may write them.
       'feedback',case when s.user_id=uid or (teacher and (owner or coalesce(q.created_by=uid,false))) then (select coalesce(jsonb_agg(jsonb_build_object('item_index',f.item_index,'body',f.body,'author',classroom_private.display_name(rid,f.user_id),'updated_at',f.updated_at) order by f.item_index),'[]') from classroom_private.feedback f where f.submission_id=s.id) else '[]'::jsonb end,
       'reactions',(select jsonb_build_object('helpful',count(*) filter(where kind='helpful'),'interesting',count(*) filter(where kind='interesting'),'encouraging',count(*) filter(where kind='encouraging')) from classroom_private.reactions z where z.submission_id=s.id)) order by s.id),'[]') from classroom_private.submissions s join public.profiles p on p.user_id=s.user_id where s.assignment_id=q.id and ((teacher and (q.created_by=uid or exists(select 1 from classroom_private.submissions own_submission where own_submission.assignment_id=q.id and own_submission.user_id=uid))) or s.user_id=uid or q.released)),
     'submitted_count',(select count(*) from classroom_private.submissions s join classroom_private.members m on m.room_id=rid and m.user_id=s.user_id and not m.blocked and m.role='student' where s.assignment_id=q.id),
     'messages',(select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'author',classroom_private.display_name(rid,v.user_id),'own',v.user_id=uid,'item_index',v.item_index,'body',v.body,'parent_id',v.parent_id,'deleted',v.deleted,'teacher',classroom_private.is_teacher(rid,v.user_id),'created_at',v.created_at) order by v.created_at,v.id),'[]') from classroom_private.messages v join public.profiles p on p.user_id=v.user_id where v.assignment_id=q.id)
   ) order by q.created_at desc),'[]') from classroom_private.assignments q where q.room_id=rid));
 end if;
 if action='leave' and not owner then
   delete from classroom_private.members where room_id=rid and user_id=uid;
   return '{}'::jsonb;
 end if;
 if r.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 if action in ('rotate','archive','remove','set_role') and not owner then raise exception 'Nur der Ersteller darf das.' using errcode='42501'; end if;
 if action in ('assign','release','update_assignment','delete_assignment') and not teacher then raise exception 'Nur die Lehrkraft darf das.' using errcode='42501'; end if;
 if action='set_role' then
   if payload->>'role' is null or payload->>'role' not in ('student','teacher') then raise exception 'Ungültige Rolle.'; end if;
   if (payload->>'user_id')::uuid=r.owner_id then raise exception 'Die Rolle des Erstellers kann nicht geändert werden.' using errcode='42501'; end if;
   update classroom_private.members set role=payload->>'role'
     where room_id=rid and user_id=(payload->>'user_id')::uuid and not blocked;
   if not found then raise exception 'Aktives Mitglied nicht gefunden.'; end if;
 elsif action='rotate' then
   update classroom_private.rooms set code=upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)) where id=rid;
 elsif action='archive' then
   update classroom_private.rooms set archived=true where id=rid;
 elsif action='remove' then
   update classroom_private.members set blocked=true where room_id=rid and user_id=(payload->>'user_id')::uuid;
 elsif action='assign' then
   if (select count(*) from classroom_private.assignments where room_id=rid)>=100 then raise exception 'Maximal 100 Aufgabenpakete pro Raum.'; end if;
   -- Keeps `room` responses small: 100 packages x 40 KB at most.
   if octet_length(coalesce(payload->'items','[]'::jsonb)::text)>40000 then raise exception 'Das Aufgabenpaket ist zu groß.'; end if;
   if exists(select 1 from jsonb_array_elements(payload->'items') x where jsonb_typeof(x)<>'object' or coalesce(length(x->>'text'),0)=0 or coalesce(length(x->'translations'->0->>'text'),0)=0) then raise exception 'Satzdaten unvollständig.'; end if;
   if coalesce(payload->>'direction','de-fi') not in ('de-fi','fi-de') then raise exception 'Unbekannte Übersetzungsrichtung.'; end if;
   insert into classroom_private.assignments(room_id,created_by,title,items,due_at,direction) values(rid,uid,trim(payload->>'title'),payload->'items',nullif(payload->>'due_at','')::timestamptz,coalesce(payload->>'direction','de-fi'));
 else
   aid:=(payload->>'assignment_id')::uuid;
   select * into a from classroom_private.assignments where id=aid and room_id=rid for update;
   if a.id is null then raise exception 'Aufgabe nicht gefunden.'; end if;
   -- Changing or deleting a package: its creator or the owner of the room.
   if action in ('update_assignment','delete_assignment') and not (owner or coalesce(a.created_by=uid,false)) then
     raise exception 'Nur wer die Aufgabe erstellt hat oder der Ersteller des Raums darf das.' using errcode='42501';
   end if;
   if action='release' then
     update classroom_private.assignments set released=true where id=aid;
   elsif action='delete_assignment' then
     -- Submissions, questions and reactions go with it (foreign keys cascade).
     delete from classroom_private.assignments where id=aid;
   elsif action='update_assignment' then
     if char_length(trim(coalesce(payload->>'title',''))) not between 3 and 100 then raise exception 'Der Titel muss 3–100 Zeichen lang sein.'; end if;
     if payload ? 'items' and payload->'items' is distinct from a.items then
       -- Answers and questions refer to sentences by position, so the
       -- sentences stay fixed as soon as either exists.
       if a.released or exists(select 1 from classroom_private.submissions where assignment_id=aid) or exists(select 1 from classroom_private.messages where assignment_id=aid) then
         raise exception 'Die Sätze lassen sich nur ändern, solange es keine Abgaben und keine Fragen gibt.';
       end if;
       if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 20 then raise exception 'Eine Aufgabe braucht 1–20 Sätze.'; end if;
       if octet_length((payload->'items')::text)>40000 then raise exception 'Das Aufgabenpaket ist zu groß.'; end if;
       if exists(select 1 from jsonb_array_elements(payload->'items') x where jsonb_typeof(x)<>'object' or coalesce(length(x->>'text'),0)=0 or coalesce(length(x->'translations'->0->>'text'),0)=0) then raise exception 'Satzdaten unvollständig.'; end if;
       update classroom_private.assignments set items=payload->'items' where id=aid;
     end if;
     -- The direction changes what an answer means, so it is fixed like the sentences.
     if payload->>'direction' is not null and payload->>'direction'<>a.direction then
       if payload->>'direction' not in ('de-fi','fi-de') then raise exception 'Unbekannte Übersetzungsrichtung.'; end if;
       if a.released or exists(select 1 from classroom_private.submissions where assignment_id=aid) or exists(select 1 from classroom_private.messages where assignment_id=aid) then
         raise exception 'Die Richtung lässt sich nur ändern, solange es keine Abgaben und keine Fragen gibt.';
       end if;
       update classroom_private.assignments set direction=payload->>'direction' where id=aid;
     end if;
     update classroom_private.assignments set title=trim(payload->>'title'),due_at=nullif(payload->>'due_at','')::timestamptz where id=aid;
   elsif action='submit' then
     if a.created_by=uid then raise exception 'Der Ersteller reicht für die eigene Aufgabe keine Abgabe ein.'; end if;
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
   elsif action='feedback' then
     if not (teacher and (owner or coalesce(a.created_by=uid,false))) then
       raise exception 'Nur wer die Aufgabe erstellt hat oder der Ersteller des Raums darf das.' using errcode='42501';
     end if;
     sid:=(payload->>'submission_id')::uuid;
     if not exists(select 1 from classroom_private.submissions where id=sid and assignment_id=aid) then raise exception 'Abgabe nicht gefunden.'; end if;
     n:=(payload->>'item_index')::integer;
     if n is null or n<0 or n>=jsonb_array_length(a.items) then raise exception 'Satz nicht gefunden.'; end if;
     display:=regexp_replace(coalesce(payload->>'body',''),'^[[:space:]]+|[[:space:]]+$','','g');
     if display='' then
       delete from classroom_private.feedback where submission_id=sid and item_index=n;
     elsif char_length(display)>1000 then raise exception 'Der Kommentar darf höchstens 1000 Zeichen lang sein.';
     else
       insert into classroom_private.feedback(submission_id,item_index,user_id,body) values(sid,n,uid,display)
         on conflict(submission_id,item_index) do update set body=excluded.body,user_id=excluded.user_id,updated_at=now();
     end if;
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
