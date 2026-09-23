-- Integration tests use temporary users and roll back every change.
begin;
create temporary table quality_test_ids(k text primary key,v uuid);
insert into quality_test_ids values('owner',gen_random_uuid()),('student',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from quality_test_ids;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'quality_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from quality_test_ids;
insert into quality_private.reviewers(user_id) select v from quality_test_ids where k='owner';
grant all on quality_test_ids to authenticated;
set local role authenticated;
do $$
declare o uuid;s uuid;rid uuid;code text;v jsonb;
begin
 select q.v into o from quality_test_ids q where q.k='owner';
 select q.v into s from quality_test_ids q where q.k='student';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Quality test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';

 v:=public.sentence_quality_api('report',jsonb_build_object('sentence_id',42,'translation_id',84,'category','translation',
   'note','Bedeutung weicht ab','sentence_text','Terve.','translation_text','Hallo.','source_kind','indirect_tatoeba'));
 assert v->>'target'='translation','translation report quarantines only the relation';
 v:=public.sentence_quality_exclusions();
 assert exists(select 1 from jsonb_array_elements(v->'translations') x where x->>'sentence_id'='42' and x->>'translation_id'='84'),
   'public exclusion list contains quarantined translation';
 v:=public.sentence_quality_review_api('status','{}');assert (v->>'reviewer')::boolean,'reviewer status is private and explicit';
 v:=public.sentence_quality_review_api('list_reports','{}');assert jsonb_array_length(v)=1,'reviewer sees open report';
 perform public.sentence_quality_review_api('resolve_report',jsonb_build_object('report_id',v->0->>'id','decision','restore'));
 v:=public.sentence_quality_exclusions();
 assert not exists(select 1 from jsonb_array_elements(v->'translations') x where x->>'sentence_id'='42' and x->>'translation_id'='84'),
   'reviewer can restore reported translation';
 perform public.sentence_quality_review_api('resolve_duplicate',jsonb_build_object('left_sentence_id',90,'right_sentence_id',91,
   'left_text','Hei.','right_text','Hei!','match_kind','exact','similarity',1,'decision','disable_right'));
 v:=public.sentence_quality_exclusions();assert exists(select 1 from jsonb_array_elements(v->'sentence_ids') x where x::text='91'),
   'duplicate decision disables selected sentence';

 perform public.sentence_quality_api('classroom_hide',jsonb_build_object('room_id',rid,'sentence_id',42,'reason','Nicht für diese Klasse'));
 v:=public.sentence_quality_api('classroom_list',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v)=1 and v->0->>'sentence_id'='42','teacher can hide and list classroom sentence';

 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Student'));
 v:=public.sentence_quality_review_api('status','{}');assert not (v->>'reviewer')::boolean,'student is not a reviewer';
 begin
   perform public.sentence_quality_review_api('list_reports','{}');
   raise exception 'FAIL student reviewer queue';
 exception when insufficient_privilege then null; end;
 begin
   perform public.sentence_quality_api('classroom_hide',jsonb_build_object('room_id',rid,'sentence_id',99));
   raise exception 'FAIL student classroom exclusion';
 exception when insufficient_privilege then null; end;

 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.sentence_quality_api('classroom_restore',jsonb_build_object('room_id',rid,'sentence_id',42));
 v:=public.sentence_quality_api('classroom_list',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v)=0,'teacher can restore classroom sentence';
end $$;
reset role;
select 'PASS: quality quarantine, reviewer decisions, duplicate review, teacher isolation and restore' as result;
rollback;
