-- Avoid PL/pgSQL variable/column ambiguity in report inserts.
create or replace function quality_private.api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); sid bigint; tid bigint; rid uuid; report_category text; report_source_kind text;
 n integer; teacher boolean; room classroom_private.rooms; result jsonb;
begin
 if uid is null or not exists(select 1 from public.profiles p where p.user_id=uid) then
   raise exception 'Bitte zuerst anmelden.' using errcode='42501';
 end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then
   raise exception 'Ungültige Anfrage.';
 end if;
 if action='report' then
   if coalesce(payload->>'sentence_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Satz.'; end if;
   sid:=(payload->>'sentence_id')::bigint;
   if coalesce(payload->>'translation_id','')='' then tid:=0;
   elsif payload->>'translation_id' !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültige Übersetzung.';
   else tid:=(payload->>'translation_id')::bigint; end if;
   report_category:=payload->>'category';
   if report_category is null or report_category not in ('translation','unnatural','outdated','inappropriate','duplicate','grammar','audio','level','other') then
     raise exception 'Ungültiger Meldegrund.';
   end if;
   if char_length(coalesce(payload->>'note',''))>2000 or char_length(coalesce(payload->>'sentence_text',''))>5000
      or char_length(coalesce(payload->>'translation_text',''))>10000 then raise exception 'Der Hinweis ist zu lang.'; end if;
   report_source_kind:=coalesce(payload->>'source_kind','unknown');
   if report_source_kind not in ('direct_tatoeba','indirect_tatoeba','app_generated','editorial','unknown') then report_source_kind:='unknown'; end if;

   insert into quality_private.report_throttle(user_id,hits) values(uid,1)
   on conflict(user_id) do update set
     hits=case when quality_private.report_throttle.window_start<now()-interval '1 hour' then 1 else quality_private.report_throttle.hits+1 end,
     window_start=case when quality_private.report_throttle.window_start<now()-interval '1 hour' then now() else quality_private.report_throttle.window_start end
   returning hits into n;
   if n>20 then return jsonb_build_object('error','Zu viele Hinweise. Bitte versuche es später erneut.'); end if;

   insert into quality_private.reports(reporter_id,sentence_id,translation_id,category,note,snapshot)
   values(uid,sid,case when report_category='translation' then tid else 0 end,report_category,coalesce(payload->>'note',''),
     jsonb_build_object('sentence_text',coalesce(payload->>'sentence_text',''),'translation_text',coalesce(payload->>'translation_text',''),
       'source_kind',report_source_kind,'reported_activity',left(coalesce(payload->>'activity',''),40)))
   on conflict(reporter_id,sentence_id,translation_id,category) do update set
     note=excluded.note,snapshot=excluded.snapshot,status='open',updated_at=now();

   if report_category='translation' and tid>0 then
     insert into quality_private.translation_states(sentence_id,translation_id,relation_kind,review_status,availability)
     values(sid,tid,report_source_kind,'needs_review','quarantined')
     on conflict(sentence_id,translation_id) do update set
       review_status='needs_review',availability='quarantined',updated_at=now();
     return jsonb_build_object('quarantined',true,'target','translation');
   else
     insert into quality_private.sentence_states(sentence_id,source_kind,review_status,availability)
     values(sid,report_source_kind,'needs_review','quarantined')
     on conflict(sentence_id) do update set review_status='needs_review',availability='quarantined',updated_at=now();
     return jsonb_build_object('quarantined',true,'target','sentence');
   end if;
 end if;

 if coalesce(payload->>'room_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Klassenraum.'; end if;
 rid:=(payload->>'room_id')::uuid;
 select r.* into room from classroom_private.rooms r where r.id=rid;
 teacher:=classroom_private.is_teacher(rid,uid);
 if room.id is null or not teacher then raise exception 'Nur die Lehrkraft darf Sätze ausblenden.' using errcode='42501'; end if;
 if action='classroom_list' then
   select coalesce(jsonb_agg(jsonb_build_object('sentence_id',e.sentence_id,'translation_id',e.translation_id,
     'reason',e.reason,'created_at',e.created_at) order by e.created_at desc),'[]'::jsonb)
   into result from quality_private.classroom_exclusions e where e.room_id=rid;
   return result;
 end if;
 if room.archived then raise exception 'Dieser Klassenraum ist archiviert.'; end if;
 if coalesce(payload->>'sentence_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiger Satz.'; end if;
 sid:=(payload->>'sentence_id')::bigint;
 if action='classroom_hide' then
   if char_length(coalesce(payload->>'reason',''))>500 then raise exception 'Der Grund ist zu lang.'; end if;
   insert into quality_private.classroom_exclusions(room_id,sentence_id,translation_id,hidden_by,reason)
   values(rid,sid,0,uid,coalesce(payload->>'reason',''))
   on conflict(room_id,sentence_id,translation_id) do update set hidden_by=excluded.hidden_by,reason=excluded.reason,created_at=now();
 elsif action='classroom_restore' then
   delete from quality_private.classroom_exclusions where room_id=rid and sentence_id=sid and translation_id=0;
 else
   raise exception 'Unbekannte Aktion.';
 end if;
 return '{}'::jsonb;
end $$;
