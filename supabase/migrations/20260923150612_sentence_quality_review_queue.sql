-- Private reviewer authorization and moderation decisions for reports and
-- automatically detected duplicate candidates.
create table quality_private.reviewers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);

create table quality_private.duplicate_reviews (
 left_sentence_id bigint not null check (left_sentence_id > 0),
 right_sentence_id bigint not null check (right_sentence_id > left_sentence_id),
 left_text text not null check (char_length(left_text) <= 5000),
 right_text text not null check (char_length(right_text) <= 5000),
 match_kind text not null check (match_kind in ('exact','near')),
 similarity numeric(6,5) not null check (similarity between 0 and 1),
 decision text not null check (decision in ('keep_both','disable_left','disable_right')),
 reviewed_by uuid not null references auth.users(id) on delete cascade,
 reviewed_at timestamptz not null default now(),
 primary key (left_sentence_id,right_sentence_id)
);

create index duplicate_reviews_reviewed_by_idx on quality_private.duplicate_reviews(reviewed_by);
alter table quality_private.reviewers enable row level security;
alter table quality_private.duplicate_reviews enable row level security;
revoke all on quality_private.reviewers,quality_private.duplicate_reviews from public,anon,authenticated;
create policy "deny direct browser access" on quality_private.reviewers for all to anon,authenticated using(false) with check(false);
create policy "deny direct browser access" on quality_private.duplicate_reviews for all to anon,authenticated using(false) with check(false);

create function quality_private.review_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); report_row quality_private.reports%rowtype; decision text; result jsonb;
 left_id bigint; right_id bigint; disabled_id bigint; inserted integer; source_kind text;
begin
 if uid is null then raise exception 'Bitte zuerst anmelden.' using errcode='42501'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>30000 then
   raise exception 'Ungültige Anfrage.';
 end if;
 if action='status' then
   return jsonb_build_object('reviewer',exists(select 1 from quality_private.reviewers r where r.user_id=uid));
 end if;
 if not exists(select 1 from quality_private.reviewers r where r.user_id=uid) then
   raise exception 'Keine Berechtigung für die Qualitätsprüfung.' using errcode='42501';
 end if;

 if action='list_reports' then
   select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc),'[]'::jsonb) into result
   from (
     select r.id,r.sentence_id,r.translation_id,r.category,r.note,r.snapshot,r.created_at,r.updated_at
     from quality_private.reports r where r.status='open' order by r.updated_at desc limit 100
   ) q;
   return result;
 end if;

 if action='list_duplicates' then
   select coalesce(jsonb_agg(to_jsonb(d) order by d.reviewed_at desc),'[]'::jsonb) into result
   from quality_private.duplicate_reviews d;
   return result;
 end if;

 if action='resolve_report' then
   if coalesce(payload->>'report_id','') !~ '^[0-9a-fA-F-]{36}$' then raise exception 'Ungültiger Hinweis.'; end if;
   decision:=payload->>'decision';
   if decision is null or decision not in ('restore','disable') then raise exception 'Ungültige Entscheidung.'; end if;
   select r.* into report_row from quality_private.reports r where r.id=(payload->>'report_id')::uuid and r.status='open' for update;
   if report_row.id is null then raise exception 'Hinweis wurde bereits bearbeitet oder nicht gefunden.'; end if;
   source_kind:=coalesce(report_row.snapshot->>'source_kind','unknown');
   if source_kind not in ('direct_tatoeba','indirect_tatoeba','app_generated','editorial','unknown') then source_kind:='unknown'; end if;
   if report_row.category='translation' and report_row.translation_id>0 then
     insert into quality_private.translation_states(sentence_id,translation_id,relation_kind,review_status,availability,reviewed_by,reviewed_at)
     values(report_row.sentence_id,report_row.translation_id,source_kind,case when decision='restore' then 'reviewed' else 'rejected' end,
       case when decision='restore' then 'active' else 'disabled' end,uid,now())
     on conflict(sentence_id,translation_id) do update set
       review_status=excluded.review_status,availability=excluded.availability,reviewed_by=uid,reviewed_at=now(),updated_at=now();
     update quality_private.reports set status=case when decision='restore' then 'dismissed' else 'reviewed' end,updated_at=now()
       where sentence_id=report_row.sentence_id and translation_id=report_row.translation_id and category='translation' and status='open';
   else
     insert into quality_private.sentence_states(sentence_id,source_kind,review_status,availability,reviewed_by,reviewed_at)
     values(report_row.sentence_id,source_kind,case when decision='restore' then 'reviewed' else 'rejected' end,
       case when decision='restore' then 'active' else 'disabled' end,uid,now())
     on conflict(sentence_id) do update set
       review_status=excluded.review_status,availability=excluded.availability,reviewed_by=uid,reviewed_at=now(),updated_at=now();
     update quality_private.reports set status=case when decision='restore' then 'dismissed' else 'reviewed' end,updated_at=now()
       where sentence_id=report_row.sentence_id and translation_id=0 and status='open';
   end if;
   return jsonb_build_object('decision',decision);
 end if;

 if action='resolve_duplicate' then
   if coalesce(payload->>'left_sentence_id','') !~ '^[1-9][0-9]{0,18}$'
      or coalesce(payload->>'right_sentence_id','') !~ '^[1-9][0-9]{0,18}$' then raise exception 'Ungültiges Satzpaar.'; end if;
   left_id:=(payload->>'left_sentence_id')::bigint;right_id:=(payload->>'right_sentence_id')::bigint;
   if right_id<=left_id then raise exception 'Ungültiges Satzpaar.'; end if;
   decision:=payload->>'decision';
   if decision is null or decision not in ('keep_both','disable_left','disable_right') then raise exception 'Ungültige Entscheidung.'; end if;
   if coalesce(payload->>'match_kind','') not in ('exact','near') or coalesce(payload->>'similarity','') !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
      or char_length(coalesce(payload->>'left_text',''))>5000 or char_length(coalesce(payload->>'right_text',''))>5000 then
     raise exception 'Ungültiger Dublettenvorschlag.';
   end if;
   insert into quality_private.duplicate_reviews(left_sentence_id,right_sentence_id,left_text,right_text,match_kind,similarity,decision,reviewed_by)
   values(left_id,right_id,coalesce(payload->>'left_text',''),coalesce(payload->>'right_text',''),payload->>'match_kind',
     (payload->>'similarity')::numeric,decision,uid) on conflict do nothing;
   get diagnostics inserted=row_count;
   if inserted=0 then raise exception 'Dieses Satzpaar wurde bereits geprüft.'; end if;
   disabled_id:=case decision when 'disable_left' then left_id when 'disable_right' then right_id else null end;
   if disabled_id is not null then
     insert into quality_private.sentence_states(sentence_id,source_kind,review_status,availability,reviewed_by,reviewed_at)
     values(disabled_id,'unknown','rejected','disabled',uid,now())
     on conflict(sentence_id) do update set review_status='rejected',availability='disabled',reviewed_by=uid,reviewed_at=now(),updated_at=now();
   end if;
   return jsonb_build_object('decision',decision,'disabled_sentence_id',disabled_id);
 end if;
 raise exception 'Unbekannte Aktion.';
end $$;
revoke all on function quality_private.review_api(text,jsonb) from public,anon,authenticated;
grant execute on function quality_private.review_api(text,jsonb) to authenticated;

create function public.sentence_quality_review_api(action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select quality_private.review_api(action,payload);
$$;
revoke all on function public.sentence_quality_review_api(text,jsonb) from public,anon,authenticated;
grant execute on function public.sentence_quality_review_api(text,jsonb) to authenticated;
