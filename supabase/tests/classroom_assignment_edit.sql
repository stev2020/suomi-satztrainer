-- Run after classroom_assignment_edit; all fixture data is rolled back.
begin;
create temporary table edit_test_users(k text primary key,v uuid);
insert into edit_test_users values('owner',gen_random_uuid()),('teacher',gen_random_uuid()),('other',gen_random_uuid()),('student',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from edit_test_users;
insert into public.profiles(user_id,username,recovery_token_hash)
 select v,'edit_'||substr(replace(v::text,'-',''),1,20),repeat('a',64) from edit_test_users;
grant all on edit_test_users to authenticated;
set local role authenticated;
do $test$
declare o uuid; t uuid; t2 uuid; s uuid; rid uuid; aid uuid; bid uuid; code text; v jsonb; n integer;
 one jsonb:='[{"text":"Hei","translations":[{"text":"Hallo"}]}]';
 two jsonb:='[{"text":"Hei","translations":[{"text":"Hallo"}]},{"text":"Kiitos","translations":[{"text":"Danke"}],"origin":"teacher_created"}]';
begin
 select i.v into o from edit_test_users i where k='owner';
 select i.v into t from edit_test_users i where k='teacher';
 select i.v into t2 from edit_test_users i where k='other';
 select i.v into s from edit_test_users i where k='student';
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('create',jsonb_build_object('name','Edit test','display_name','Owner'));rid:=(v->>'id')::uuid;
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));code:=v->>'code';
 for n in 1..3 loop
  perform set_config('request.jwt.claim.sub',(array[t,t2,s])[n]::text,true);
  perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Member '||n));
 end loop;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','teacher'));
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t2,'role','teacher'));
 -- The teacher creates a package and may change everything while nobody answered.
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Erste Runde','items',two));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));aid:=(v->'assignments'->0->>'id')::uuid;
 assert v->'assignments'->0->>'can_manage'='true' and v->'assignments'->0->>'items_locked'='false','creator manages an open package';
 assert v->'assignments'->0->>'created_at' is not null,'created_at is returned';
 perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','  Erste Runde, korrigiert ','due_at','2030-01-02T10:00:00Z','items',one));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'title'='Erste Runde, korrigiert' and jsonb_array_length(v->'assignments'->0->'items')=1 and v->'assignments'->0->>'due_at' is not null,'title, date and sentences change';
 -- Invalid changes.
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','ab'));raise exception 'FAIL short title';
 exception when raise_exception then if sqlerrm<>'Der Titel muss 3–100 Zeichen lang sein.' then raise;end if;end;
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Erste Runde','items','[]'::jsonb));raise exception 'FAIL empty items';
 exception when raise_exception then if sqlerrm<>'Eine Aufgabe braucht 1–20 Sätze.' then raise;end if;end;
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Erste Runde','items','[{"text":"Hei"}]'::jsonb));raise exception 'FAIL incomplete items';
 exception when raise_exception then if sqlerrm<>'Satzdaten unvollständig.' then raise;end if;end;
 -- Another teacher and a student may neither change nor delete it.
 perform set_config('request.jwt.claim.sub',t2::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'can_manage'='false','another teacher does not manage it';
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Fremd'));raise exception 'FAIL other teacher update';
 exception when insufficient_privilege then null;end;
 begin perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));raise exception 'FAIL other teacher delete';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',s::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'can_manage'='false','a student does not manage it';
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Schüler'));raise exception 'FAIL student update';
 exception when insufficient_privilege then null;end;
 begin perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));raise exception 'FAIL student delete';
 exception when insufficient_privilege then null;end;
 -- After the first submission the sentences are fixed; title and date still change.
 perform public.classroom_api('submit',jsonb_build_object('room_id',rid,'assignment_id',aid,'answers','["Hei"]'::jsonb));
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'items_locked'='true','sentences are locked after a submission';
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Erste Runde','items',two));raise exception 'FAIL items after submission';
 exception when raise_exception then if sqlerrm<>'Die Sätze lassen sich nur ändern, solange es keine Abgaben und keine Fragen gibt.' then raise;end if;end;
 perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid,'title','Neuer Titel','due_at','','items',one));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'title'='Neuer Titel' and v->'assignments'->0->>'due_at' is null and jsonb_array_length(v->'assignments'->0->'submissions')=1,'title and date change, unchanged sentences are accepted, submission stays';
 -- A question alone also locks the sentences.
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Zweite Runde','items',two));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select (x->>'id')::uuid into bid from jsonb_array_elements(v->'assignments') x where x->>'title'='Zweite Runde';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('message',jsonb_build_object('room_id',rid,'assignment_id',bid,'item_index',1,'body','Warum?'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 begin perform public.classroom_api('update_assignment',jsonb_build_object('room_id',rid,'assignment_id',bid,'title','Zweite Runde','items',one));raise exception 'FAIL items after question';
 exception when raise_exception then if sqlerrm<>'Die Sätze lassen sich nur ändern, solange es keine Abgaben und keine Fragen gibt.' then raise;end if;end;
 -- The owner of the room manages packages of other teachers; deleting removes everything below.
 perform set_config('request.jwt.claim.sub',o::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert (select bool_and((x->>'can_manage')::boolean) from jsonb_array_elements(v->'assignments') x),'owner manages every package';
 perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));
 perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',bid));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert jsonb_array_length(v->'assignments')=0,'packages are gone';
 reset role;
 assert not exists(select 1 from classroom_private.submissions where assignment_id in (aid,bid)) and not exists(select 1 from classroom_private.messages where assignment_id in (aid,bid)),'submissions and questions are deleted with the package';
 set local role authenticated;
 -- A demoted creator loses the right; archived rooms stay unchanged.
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('assign',jsonb_build_object('room_id',rid,'title','Dritte Runde','items',one));
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 select (x->>'id')::uuid into aid from jsonb_array_elements(v->'assignments') x where x->>'title'='Dritte Runde';
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('set_role',jsonb_build_object('room_id',rid,'user_id',t,'role','student'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 v:=public.classroom_api('room',jsonb_build_object('room_id',rid));
 assert v->'assignments'->0->>'can_manage'='false','a former teacher no longer manages the package';
 begin perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));raise exception 'FAIL demoted delete';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',o::text,true);
 perform public.classroom_api('archive',jsonb_build_object('room_id',rid));
 begin perform public.classroom_api('delete_assignment',jsonb_build_object('room_id',rid,'assignment_id',aid));raise exception 'FAIL archived delete';
 exception when raise_exception then if sqlerrm<>'Dieser Klassenraum ist archiviert.' then raise;end if;end;
end $test$;
reset role;
select 'PASS: edit title, date and sentences, validation, creator and owner only, lock after submission or question, cascade on delete, demotion and archive' as result;
rollback;
