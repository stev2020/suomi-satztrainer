-- Run after classroom_reports; all fixture data is rolled back.
begin;
create temporary table rep_users(k text primary key,id uuid default gen_random_uuid());
insert into rep_users(k) values('teacher'),('student'),('peer'),('outsider'),('admin');
insert into auth.users(id,aud,role) select id,'authenticated','authenticated' from rep_users;
insert into public.profiles(user_id,username,recovery_token_hash) select id,'rep_'||substr(replace(id::text,'-',''),1,20),repeat('a',64) from rep_users;
insert into admin_private.admins(user_id) select id from rep_users where k='admin';
create temporary table rep_ids(k text primary key,id uuid);
grant select,insert on rep_users,rep_ids to authenticated;
do $$
declare t uuid;s uuid;peer uuid;o uuid;adm uuid;rid uuid;pid uuid;reply uuid;aid uuid;mid uuid;j jsonb;code text;failed boolean;
begin
 select id into t from rep_users where k='teacher';select id into s from rep_users where k='student';select id into peer from rep_users where k='peer';
 select id into o from rep_users where k='outsider';select id into adm from rep_users where k='admin';
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',t::text,true);
 j:=public.classroom_api('create',jsonb_build_object('name','Meldetest','display_name','Lehrerin'));rid:=(j->>'id')::uuid;
 code:=public.classroom_api('room',jsonb_build_object('room_id',rid))->>'code';
 perform set_config('request.jwt.claim.sub',s::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Schüler'));
 j:=public.classroom_api('stream_post',jsonb_build_object('room_id',rid,'request_id',gen_random_uuid(),'kind','post','body','Etwas Schlimmes'));pid:=(j->>'id')::uuid;
 perform set_config('request.jwt.claim.sub',peer::text,true);
 perform public.classroom_api('join',jsonb_build_object('code',code,'display_name','Mitschülerin'));
 perform public.classroom_api('stream_reply',jsonb_build_object('room_id',rid,'post_id',pid,'request_id',gen_random_uuid(),'body','Antwort darauf'));
 reset role;
 select id into reply from classroom_private.stream_posts where parent_id=pid;
 insert into classroom_private.assignments(room_id,created_by,title,items,direction) values(rid,t,'Aufgabe 1','[{"text":"Moi","translations":[{"text":"Hallo"}]}]','fi-de') returning id into aid;
 insert into classroom_private.messages(assignment_id,user_id,item_index,body) values(aid,s,0,'Böse Nachricht') returning id into mid;
 insert into classroom_private.stream_files(room_id,user_id,post_id,name,mime,size) values(rid,s,pid,'bild.png','image/png',12345);
 set local role authenticated;

 -- Wer nicht im Raum ist, kann nichts melden; eigene Inhalte auch nicht; Grund ist Pflicht.
 perform set_config('request.jwt.claim.sub',o::text,true);
 failed:=false; begin perform public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','illegal')); exception when insufficient_privilege then failed:=true; end; assert failed,'outsider cannot report';
 perform set_config('request.jwt.claim.sub',s::text,true);
 failed:=false; begin perform public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','illegal')); exception when others then failed:=true; end; assert failed,'own content cannot be reported';
 perform set_config('request.jwt.claim.sub',peer::text,true);
 failed:=false; begin perform public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','nope')); exception when others then failed:=true; end; assert failed,'reason required';

 -- Melden: Beitrag (zweimal von derselben Person zählt einmal), Nachricht, Raum.
 assert (public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','illegal','note','Das ist <b>verboten</b>'))->>'ok')::boolean,'post reported';
 perform public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','illegal'));
 perform public.classroom_api('report',jsonb_build_object('kind','message','id',mid,'reason','harassment'));
 perform public.classroom_api('report',jsonb_build_object('kind','room','id',rid,'reason','other','note','Seltsamer Raum'));
 perform set_config('request.jwt.claim.sub',t::text,true);
 perform public.classroom_api('report',jsonb_build_object('kind','post','id',pid,'reason','inappropriate'));
 reset role;
 assert (select count(*) from classroom_private.reports where target_id=pid)=2,'one open report per person';

 -- Niemand liest die Meldungen direkt; Lehrkräfte sehen sie nicht.
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',t::text,true);
 failed:=false; begin perform 1 from classroom_private.reports; exception when insufficient_privilege then failed:=true; end; assert failed,'reports are private';
 failed:=false; begin perform public.admin_api('class_reports','{}'); exception when insufficient_privilege then failed:=true; end; assert failed,'teacher is no admin';

 -- Admin ohne zweiten Faktor: nichts. Mit: gemeldete Inhalte, ohne meldende Personen.
 perform set_config('request.jwt.claim.sub',adm::text,true);
 perform set_config('test.aal','aal1',true);
 failed:=false; begin perform public.admin_api('class_reports','{}'); exception when insufficient_privilege then failed:=true; end; assert failed,'second factor needed';
 perform set_config('test.aal','aal2',true);
 j:=public.admin_api('class_reports','{}');
 assert jsonb_array_length(j)=3,'three reported targets: '||jsonb_array_length(j);
 assert not (j::text ~ s::text) and not (j::text ~ peer::text) and not (j::text ~ t::text),'no account ids in reports';
 assert exists(select 1 from jsonb_array_elements(j) x where x->>'target_kind'='post' and (x->>'count')::int=2 and x->'content'->>'body'='Etwas Schlimmes'
   and x->'content'->>'role'='Mitglied' and x->'content'->'files'->0->>'name'='bild.png' and x->'room'->>'name'='Meldetest'),'post report with content and files';
 assert exists(select 1 from jsonb_array_elements(j) x where x->>'target_kind'='message' and x->'content'->>'assignment'='Aufgabe 1'),'message report';
 assert exists(select 1 from jsonb_array_elements(j) x where x->>'target_kind'='post' and x->'notes'->>0='Das ist <b>verboten</b>'),'note kept as text';

 -- Raumliste: nur Kennzahlen.
 j:=public.admin_api('class_rooms','{}');
 assert exists(select 1 from jsonb_array_elements(j) x where x->>'name'='Meldetest' and (x->>'members')::int=3 and (x->>'teachers')::int=1 and (x->>'files')::int=1 and (x->>'file_bytes')::int=12345 and (x->>'open_reports')::int=4),'room figures';
 assert not (j::text ~ 'Etwas Schlimmes'),'no content in room list';

 -- Entscheiden: Beitrag entfernen (mit Dateien), Nachricht behalten, Raum archivieren.
 perform public.admin_api('class_resolve',jsonb_build_object('target_kind','post','target_id',pid,'decision','remove'));
 perform public.admin_api('class_resolve',jsonb_build_object('target_kind','message','target_id',mid,'decision','keep'));
 failed:=false; begin perform public.admin_api('class_resolve',jsonb_build_object('target_kind','message','target_id',mid,'decision','keep')); exception when others then failed:=true; end; assert failed,'resolved only once';
 failed:=false; begin perform public.admin_api('class_resolve',jsonb_build_object('target_kind','room','target_id',rid,'decision','remove')); exception when others then failed:=true; end; assert failed,'rooms are archived or deleted, not removed';
 perform public.admin_api('class_resolve',jsonb_build_object('target_kind','room','target_id',rid,'decision','archive'));
 reset role;
 assert (select deleted and body='[Vom Betreiber entfernt]' from classroom_private.stream_posts where id=pid),'post removed';
 assert not exists(select 1 from classroom_private.stream_files where post_id=pid),'files removed';
 assert (select not deleted from classroom_private.messages where id=mid),'message kept';
 assert (select archived from classroom_private.rooms where id=rid),'room archived';
 assert not exists(select 1 from classroom_private.reports where status='open'),'all resolved';
 assert not exists(select 1 from classroom_private.reports where reporter_id is not null or note<>''),'reporter and note forgotten after resolving';

 -- Raum löschen nur mit genauem Namen.
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',adm::text,true);
 failed:=false; begin perform public.admin_api('class_room_delete',jsonb_build_object('room_id',rid,'confirm_name','meldetest')); exception when others then failed:=true; end; assert failed,'exact name needed';
 perform public.admin_api('class_room_delete',jsonb_build_object('room_id',rid,'confirm_name','Meldetest'));
 reset role;
 assert not exists(select 1 from classroom_private.rooms where id=rid),'room deleted';
 assert not exists(select 1 from classroom_private.reports where room_id=rid),'reports go with the room';
end $$;
select 'classroom_reports ok';
rollback;
