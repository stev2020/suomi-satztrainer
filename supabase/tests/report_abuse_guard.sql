-- Report abuse guard (20261001210000): a reviewer's "keep" decision lasts, and
-- automatic quarantines are capped per day. All fixture records are rolled back.
begin;
create temporary table rag_ids(k text primary key,v uuid);
insert into rag_ids values('reviewer',gen_random_uuid()),('a',gen_random_uuid()),('b',gen_random_uuid()),('c',gen_random_uuid()),('d',gen_random_uuid()),('e',gen_random_uuid()),('f',gen_random_uuid());
insert into auth.users(id,aud,role,created_at) select v,'authenticated','authenticated',now()-interval '3 days' from rag_ids;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'rag_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from rag_ids;
insert into quality_private.reviewers(user_id) select v from rag_ids where k='reviewer';
grant all on rag_ids to authenticated;
set local role authenticated;
create or replace function pg_temp.report_as(who text,sentence bigint) returns jsonb language plpgsql as $$
declare u uuid;
begin
 select v into u from rag_ids where k=who;
 perform set_config('request.jwt.claim.sub',u::text,true);
 return public.sentence_quality_api('report',jsonb_build_object('sentence_id',sentence,'category','unnatural','note','Test','sentence_text','Hei.'));
end $$;
create or replace function pg_temp.hidden(sentence bigint) returns boolean language sql as $$
 select exists(select 1 from jsonb_array_elements(public.sentence_quality_exclusions()->'sentence_ids') x where x::text=sentence::text) $$;
do $$
declare v jsonb; rv uuid; i integer;
begin
 select k.v into rv from rag_ids k where k.k='reviewer';
 -- Three established accounts still quarantine automatically.
 perform pg_temp.report_as('a',7001);perform pg_temp.report_as('b',7001);
 assert not pg_temp.hidden(7001),'two reports are not enough';
 v:=pg_temp.report_as('c',7001);
 assert (v->>'quarantined')::boolean and pg_temp.hidden(7001),'third report quarantines';

 -- Reviewer keeps the sentence.
 perform set_config('request.jwt.claim.sub',rv::text,true);
 v:=public.sentence_quality_review_api('list_reports','{}');
 perform public.sentence_quality_review_api('resolve_report',jsonb_build_object('report_id',(select x->>'id' from jsonb_array_elements(v) x where x->>'sentence_id'='7001' limit 1),'decision','restore'));
 assert not pg_temp.hidden(7001),'reviewer restored the sentence';

 -- Same and new accounts report again: back in the queue, but stays visible.
 perform pg_temp.report_as('a',7001);perform pg_temp.report_as('b',7001);perform pg_temp.report_as('d',7001);
 v:=pg_temp.report_as('e',7001);
 assert not (v->>'quarantined')::boolean,'reports after a keep decision do not quarantine';
 assert not pg_temp.hidden(7001),'restored sentence stays visible for everyone';
 perform set_config('request.jwt.claim.sub',rv::text,true);
 v:=public.sentence_quality_review_api('list_reports','{}');
 assert exists(select 1 from jsonb_array_elements(v) x where x->>'sentence_id'='7001'),'new reports are in the review queue';

 -- A reviewer can still hide it at once.
 v:=pg_temp.report_as('reviewer',7001);
 assert (v->>'quarantined')::boolean and pg_temp.hidden(7001),'reviewer report quarantines restored content';

 -- Daily cap: after 20 automatic quarantines, further ones only queue.
 reset role;
 insert into quality_private.sentence_states(sentence_id,source_kind,review_status,availability)
  select 8000+g,'unknown','needs_review','quarantined' from generate_series(1,20) g;
 set local role authenticated;
 perform pg_temp.report_as('a',7002);perform pg_temp.report_as('b',7002);
 v:=pg_temp.report_as('c',7002);
 assert not (v->>'quarantined')::boolean and not pg_temp.hidden(7002),'cap reached: no further automatic quarantine';
 v:=pg_temp.report_as('reviewer',7002);
 assert (v->>'quarantined')::boolean,'reviewers are not affected by the cap';
end $$;
select 'PASS: report abuse guard' as result;
rollback;
