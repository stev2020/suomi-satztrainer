-- Run after admin_dashboard; all fixture data is rolled back.
begin;
do $test$
declare r jsonb; failed boolean; a uuid:=gen_random_uuid(); u uuid:=gen_random_uuid(); i integer; today text:=to_char((now() at time zone 'Europe/Berlin')::date,'YYYY-MM-DD');
  yday text:=to_char((now() at time zone 'Europe/Berlin')::date-1,'YYYY-MM-DD');
begin
 insert into auth.users(id,aud,role) values(a,'authenticated','authenticated'),(u,'authenticated','authenticated');
 insert into admin_private.admins(user_id) values(a);

 -- Browsers never reach the tables, and guests cannot call the admin API at all.
 set local role anon;
 failed:=false; begin perform 1 from admin_private.client_errors; exception when insufficient_privilege then failed:=true; end; assert failed,'no select for anon';
 failed:=false; begin perform 1 from admin_private.feedback; exception when insufficient_privilege then failed:=true; end; assert failed,'no feedback select for anon';
 failed:=false; begin perform public.admin_api('status'); exception when insufficient_privilege then failed:=true; end; assert failed,'admin api not for guests';
 failed:=false; begin perform public.admin_money_store('{"months":[]}'); exception when insufficient_privilege then failed:=true; end; assert failed,'money store not for guests';
 reset role;

 -- A normal account is told it is not an admin and gets nothing else.
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert (public.admin_api('status')->>'admin')::boolean=false,'normal user is no admin';
 failed:=false; begin perform public.admin_api('overview'); exception when insufficient_privilege then failed:=true; end; assert failed,'overview refused for normal user';
 failed:=false; begin perform public.admin_api('settings_save','{"month_goal":"1"}'); exception when insufficient_privilege then failed:=true; end; assert failed,'settings refused for normal user';
 failed:=false; begin perform public.admin_money_store('{"months":[]}'); exception when insufficient_privilege then failed:=true; end; assert failed,'money store not for users';
 reset role;

 -- Page errors: scrubbed, grouped, capped; no account or address stored.
 set local role anon;
 r:=public.report_client_error(jsonb_build_object('message','TypeError: x for anna@example.org at https://vanamo.app/app.js?v=12&token=abc#k id 12345678',
   'source','https://vanamo.app/dist/app.js?v=213:120:5','page','/index.html?invite=SECRET','browser','Chrome 129','os','Android'));
 assert (r->>'ok')::boolean,'error stored';
 perform public.report_client_error(jsonb_build_object('message','TypeError: x for anna@example.org at https://vanamo.app/app.js?v=12&token=abc#k id 12345678',
   'source','https://vanamo.app/dist/app.js?v=213:120:5','page','/','browser','Safari 18','os','iOS'));
 reset role;
 assert (select count(*) from admin_private.client_errors)=1,'same error grouped';
 select to_jsonb(e) into r from admin_private.client_errors e;
 assert (r->>'hits')::int=2,'hits counted';
 assert position('anna@' in r->>'message')=0 and position('[E-Mail]' in r->>'message')>0,'email removed';
 assert position('token' in r->>'message')=0 and position('?' in r->>'message')=0,'query string removed';
 assert position('12345678' in r->>'message')=0,'long numbers removed';
 assert r->>'source'='app.js:120:5','only file and line kept: '||(r->>'source');
 assert r->>'page'='/','page without query';
 assert (r->'platforms'->>'Chrome 129 · Android')::int=1 and (r->'platforms'->>'Safari 18 · iOS')::int=1,'platform families counted';
 assert not exists(select 1 from admin_private.client_errors where message ~* 'secret|invite'),'invite codes never stored';

 -- Rate limit: at most 30 reports per minute for everyone together.
 set local role anon;
 for i in 1..40 loop perform public.report_client_error(jsonb_build_object('message','Fehler '||i,'source','a.js:1:1')); end loop;
 reset role;
 assert (select count(*) from admin_private.client_errors)<=30,'error reports throttled';

 -- Switched off in the settings: nothing is stored.
 update admin_private.settings set collect_errors=false;
 update admin_private.throttle set n=0;
 set local role anon;
 assert (public.report_client_error('{"message":"Aus","source":"x.js:1:1"}')->>'off')::boolean,'collection off';
 reset role;
 assert not exists(select 1 from admin_private.client_errors where message='Aus'),'nothing stored when off';
 update admin_private.settings set collect_errors=true;

 -- Feedback: anonymous, length-checked.
 set local role anon;
 assert (public.send_feedback('ok')->>'error')='short','too short';
 assert (public.send_feedback('Bitte einen Schalter für die Vögel.','/?x=1')->>'ok')::boolean,'feedback stored';
 reset role;
 assert (select page from admin_private.feedback limit 1)='/','feedback page without query';

 -- Admin: overview, lists and actions.
 insert into public.learning_state(user_id,state) values
   (a,jsonb_build_object('daily',jsonb_build_object(today,10,yday,5,'kaputt',3,'2026-13-45',4),'reviews',jsonb_build_object('1:fi-de','{}'::jsonb))),
   (u,jsonb_build_object('daily',jsonb_build_object(today,'viel'),'reviews','[]'::jsonb));
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',a::text,true);
 assert (public.admin_api('status')->>'admin')::boolean,'admin recognised';
 assert (public.admin_api('status')->>'ok')::boolean,'admin with second factor is ok';
 -- Nur Passwort (aal1): Status sagt es, alles andere wird verweigert – auch die Satzprüfung.
 perform set_config('test.aal','aal1',true);
 r:=public.admin_api('status');
 assert (r->>'admin')::boolean and not (r->>'aal2')::boolean and not (r->>'ok')::boolean,'status shows missing second factor';
 failed:=false; begin perform public.admin_api('overview'); exception when insufficient_privilege then failed:=true; end; assert failed,'overview needs second factor';
 failed:=false; begin perform public.admin_api('settings_save','{"month_goal":"5"}'); exception when insufficient_privilege then failed:=true; end; assert failed,'settings need second factor';
 failed:=false; begin perform public.sentence_quality_review_api('list_reports','{}'); exception when insufficient_privilege then failed:=true; end; assert failed,'review needs second factor';
 failed:=false; begin perform admin_private.api('overview','{}'); exception when insufficient_privilege then failed:=true; end; assert failed,'inner api not callable directly';
 perform set_config('test.aal','aal2',true);
 r:=public.admin_api('overview');
 assert (r#>>'{accounts,total}')::int>=2,'accounts counted';
 assert jsonb_array_length(r#>'{accounts,weekly}')=12,'twelve weeks';
 assert (r#>>'{activity,today}')::int=1,'one learner active today (broken values ignored)';
 assert r#>'{activity,practiced_today}'='null'::jsonb and r#>'{activity,streak_avg}'='null'::jsonb,'small groups hidden';
 assert (r#>>'{todo,errors}')::int>=1 and (r#>>'{todo,feedback}')::int=1,'todo counts';
 assert not (r::text ~ a::text) and not (r::text ~ u::text),'no account ids in overview';
 r:=public.admin_api('errors');
 assert jsonb_array_length(r)>=1 and not (r::text ~* 'anna'),'error list without personal data';
 perform public.admin_api('error_done',jsonb_build_object('fingerprint',r->0->>'fingerprint'));
 r:=public.admin_api('feedback');
 assert jsonb_array_length(r)=1,'feedback listed';
 perform public.admin_api('feedback_archive',jsonb_build_object('id',r->0->>'id'));
 assert jsonb_array_length(public.admin_api('feedback'))=0,'feedback archived';

 -- Settings with validation.
 failed:=false; begin perform public.admin_api('settings_save','{"month_goal":"0"}'); exception when others then failed:=true; end; assert failed,'goal must be > 0';
 failed:=false; begin perform public.admin_api('settings_save','{"month_goal":"10","notice_on":true,"notice_text":""}'); exception when others then failed:=true; end; assert failed,'notice needs text';
 perform public.admin_api('settings_save','{"month_goal":"20,50","notice_on":true,"notice_text":"Heute Wartung","notice_kind":"warn","registration_open":false,"collect_errors":true}');
 r:=public.admin_api('settings');
 assert (r->>'month_goal')::numeric=20.5 and (r->>'registration_open')::boolean=false,'settings saved';

 -- Swarm: contributors added by the admin, names can be removed.
 assert (public.admin_api('contributor_add','{"name":"Aino"}')->>'name')='Aino','contributor added';
 failed:=false; begin perform public.admin_api('contributor_add','{"name":"Hitler"}'); exception when others then failed:=true; end; assert failed,'blocked words refused';
 r:=public.admin_api('settings');
 assert (r->'swarm'->0->>'contributor')::boolean,'contributor in swarm list';
 perform public.admin_api('swarm_remove',jsonb_build_object('id',r->'swarm'->0->>'id'));
 assert jsonb_array_length(public.admin_api('settings')->'swarm')=0,'name removed';
 reset role;

 -- Money: only the service role writes month totals; the public sees a percentage, never amounts.
 set local role service_role;
 perform public.admin_money_store(jsonb_build_object('months',jsonb_build_array(jsonb_build_object(
   'month',to_char(now() at time zone 'Europe/Berlin','YYYY-MM'),'gross',10.25,'fees',0.80,'payments',3,'recurring',1,'last_payment_at',now()))));
 reset role;
 set local role anon;
 r:=public.app_settings();
 assert (r->>'goal_percent')::int=50,'goal percent from month total: '||(r->>'goal_percent');
 assert r->'notice'->>'text'='Heute Wartung' and r->'notice'->>'kind'='warn','notice public';
 assert (r->>'registration')::boolean=false,'registration state public';
 assert not (r::text ~ '10\.25'),'no amounts public';
 reset role;
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',a::text,true);
 r:=public.admin_api('overview');
 assert (r#>>'{money,months,0,gross}')::numeric=10.25 and (r#>>'{money,months,0,payments}')::int=3,'admin sees month totals';
 reset role;

 -- Cleanup: old errors and archived feedback disappear.
 update admin_private.client_errors set last_seen=now()-interval '31 days';
 perform admin_private.cleanup();
 assert not exists(select 1 from admin_private.client_errors),'old errors deleted after 30 days';
end $test$;
select 'admin_dashboard ok';
rollback;
