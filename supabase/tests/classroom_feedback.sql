-- Run after classroom_feedback; all fixture data is rolled back.
begin;
create temporary table feedback_test_users(k text primary key,v uuid);
insert into feedback_test_users values('owner',gen_random_uuid()),('teacher',gen_random_uuid()),('other',gen_random_uuid()),('anna',gen_random_uuid()),('mika',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from feedback_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'fb_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from feedback_test_users;
grant all on feedback_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; t uuid; t2 uuid; s1 uuid; s2 uuid; rid uuid; aid uuid; sub1 uuid; code text; v jsonb; x jsonb; n integer;
 two jsonb:='[{"text":"Hei","translations":[{"text":"Hallo"}]},{"text":"Kiitos","translations":[{"text":"Danke"}]}]';
begin
 select i.v into o from feedback_test_users i where k='owner';
 select i.v into t from feedback_test_users i where k='teacher';
 select i.v into t2 from feedback_test_users i where k='other';
 select i.v into s1 from feedback_test_users i where k='anna';
 select i.v into s2 from feedback_test_users i where k='mika';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Feedback test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 for n in 1..4 loop
  perform set_config('request.jwt.claim.sub',(array[t,t2,s1,s2])[n]::text,true);
  perform public.classroom_api('join',jsonb_build_object('code',code,'display_name',(array['Frau Virtanen','Other','Anna','Mika'])[n]));
 end loop;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t2,'role','teacher'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Runde','items',two));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',s1::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei","Kiitti"]'::jsonb));
 perform set_config('request.jwt.claim.sub',s2::text,true);
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Moi","Kiitos"]'::jsonb));
 -- The creator comments on one sentence of Anna's submission and changes it.
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select (x2->>'id')::uuid into sub1 from jsonb_array_elements(v->'assignments'->0->'submissions') x2 where x2->>'author'='Anna';
 perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',1,'body','  Umgangssprache, passt!  '));
 perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',1,'body','Umgangssprachlich, in der Schriftsprache: Kiitos.'));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select x2 into x from jsonb_array_elements(v->'assignments'->0->'submissions') x2 where x2->>'id'=sub1::text;
 assert jsonb_array_length(x->'feedback')=1 and x->'feedback'->0->>'body'='Umgangssprachlich, in der Schriftsprache: Kiitos.' and x->'feedback'->0->>'item_index'='1' and x->'feedback'->0->>'author'='Frau Virtanen','one comment per sentence, the newer text wins';
 -- Invalid input.
 begin perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',2,'body','x'));raise exception 'FAIL index';
 exception when raise_exception then if sqlerrm<>'Satz nicht gefunden.' then raise;end if;end;
 begin perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',gen_random_uuid(),'item_index',0,'body','x'));raise exception 'FAIL submission';
 exception when raise_exception then if sqlerrm<>'Abgabe nicht gefunden.' then raise;end if;end;
 begin perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',0,'body',repeat('x',1001)));raise exception 'FAIL length';
 exception when raise_exception then if sqlerrm<>'Der Kommentar darf höchstens 1000 Zeichen lang sein.' then raise;end if;end;
 -- Anna reads her comment, Mika does not see it and nobody but the teacher writes.
 perform set_config('request.jwt.claim.sub',s1::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->'submissions'->0->'feedback'->0->>'body' like 'Umgangssprachlich%','the author of the submission reads the comment';
 begin perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',0,'body','selbst'));raise exception 'FAIL student feedback';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',t2::text,true);
 begin perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',0,'body','fremd'));raise exception 'FAIL other teacher feedback';
 exception when insufficient_privilege then null;end;
 -- After the release the others see the answers, but never the comments.
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('release',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform set_config('request.jwt.claim.sub',s2::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'assignments'->0->'submissions')=2,'released comparison shows both submissions';
 assert not exists(select 1 from jsonb_array_elements(v->'assignments'->0->'submissions') x2 where jsonb_array_length(x2->'feedback')>0),'comments stay private in the comparison';
 perform set_config('request.jwt.claim.sub',t2::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert not exists(select 1 from jsonb_array_elements(v->'assignments'->0->'submissions') x2 where jsonb_array_length(x2->'feedback')>0),'another teacher does not read the comments';
 -- The owner of the room may comment too; an empty text removes a comment.
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',0,'body','Gut!'));
 perform public.classroom_api('feedback',jsonb_build_object('room_id',rid,'assignment_id',aid,'submission_id',sub1,'item_index',1,'body','   '));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select x2 into x from jsonb_array_elements(v->'assignments'->0->'submissions') x2 where x2->>'id'=sub1::text;
 assert jsonb_array_length(x->'feedback')=1 and x->'feedback'->0->>'item_index'='0' and x->'feedback'->0->>'author'='Owner','empty text deletes, owner comments';
 -- Deleting the package removes the comments.
 perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));
 create temporary table feedback_test_ids as select sub1 as id;
end $test$;
reset role;
do $$ begin
 assert not exists(select 1 from classroom_private.feedback f join feedback_test_ids i on i.id=f.submission_id),'comments are deleted with the package';
 assert not has_table_privilege('authenticated','classroom_private.feedback','select') and not has_table_privilege('anon','classroom_private.feedback','select'),'no direct table access';
 assert (select relrowsecurity from pg_class where oid='classroom_private.feedback'::regclass),'row level security is on';
end $$;
select 'PASS: comment per sentence, update and delete, validation, creator and owner only, visible to the author alone, hidden in the comparison, cascade' as result;
rollback;
