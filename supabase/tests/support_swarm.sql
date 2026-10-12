-- Run after support_swarm; all fixture data is rolled back.
begin;
do $test$
declare r jsonb; failed boolean; t1 text:=repeat('a',64); t2 text:=repeat('b',64); t3 text:=repeat('c',64);
begin
 -- Browsers never reach the tables directly.
 set local role anon;
 failed:=false; begin perform 1 from support_private.names; exception when insufficient_privilege then failed:=true; end; assert failed,'no select for anon';
 failed:=false; begin insert into support_private.names(first_name) values('Anna'); exception when insufficient_privilege then failed:=true; end; assert failed,'no insert for anon';
 failed:=false; begin perform support_private.cleanup(); exception when insufficient_privilege then failed:=true; end; assert failed,'cleanup is not public';

 -- Empty swarm.
 r:=public.support_swarm();
 assert jsonb_array_length(r->'names')=0 and (r->>'former')::int=0,'empty at start';

 -- Name check: letters, 2–20 characters, blocked words.
 assert (public.support_name_submit('A',t1)->>'error')='name','too short';
 assert (public.support_name_submit('Anna1',t1)->>'error')='name','digits refused';
 assert (public.support_name_submit('<b>Anna</b>',t1)->>'error')='name','markup refused';
 assert (public.support_name_submit('Fuck',t1)->>'error')='name','short blocked word as a whole name part';
 assert (public.support_name_submit('Arschgeige',t1)->>'error')='name','long blocked word as part of a name';
 assert (public.support_name_submit('Anna',repeat('z',64))->>'error')='token','token must be hex';
 assert (public.support_name_submit('Anna','abc')->>'error')='token','token must be 64 chars';
 assert (public.support_name_submit('Nazim',t3)->>'ok')::boolean,'Nazim is a name, not a blocked word';
 r:=public.support_name_submit('  Marja-Liisa  ',t1);
 assert (r->>'ok')::boolean and r->>'name'='Marja-Liisa','spaces trimmed, hyphen allowed';
 assert (public.support_name_submit('Jöns',t2)->>'ok')::boolean,'umlauts allowed';

 -- Pending names are invisible until Donorbox sends the visitor back.
 assert jsonb_array_length(public.support_swarm()->'names')=0,'pending names stay hidden';
 assert not (public.support_name_activate(repeat('d',64))->>'ok')::boolean,'unknown token';
 r:=public.support_name_activate(t1);
 assert (r->>'ok')::boolean and r->>'name'='Marja-Liisa','activated';
 assert not (public.support_name_activate(t1)->>'ok')::boolean,'a token works only once';
 r:=public.support_swarm();
 assert jsonb_array_length(r->'names')=1 and r->'names'->0->>'name'='Marja-Liisa' and not (r->'names'->0->>'contributor')::boolean,'visible after activation';
 assert public.support_swarm()::text not like '%token%' and public.support_swarm()::text not like '%created%','only name and contributor flag leave the database';
 reset role;

 -- Activation keeps the name for six months, no token is kept afterwards.
 assert (select visible_until between now()+interval '6 months'-interval '1 minute' and now()+interval '6 months' and token_hash is null
           from support_private.names where first_name='Marja-Liisa'),'six months, token removed';
 -- A pending entry older than three days can no longer be activated.
 update support_private.names set created_at=now()-interval '4 days' where first_name='Jöns';
 set local role anon;
 assert not (public.support_name_activate(t2)->>'ok')::boolean,'stale tokens expire';
 reset role;

 -- Cleanup: expired names are deleted and counted as former supporters; old pending entries disappear.
 insert into support_private.names(first_name,contributor,active_from) values('Mikko',true,now());
 update support_private.names set active_from=now()-interval '7 months',visible_until=now()-interval '1 month' where first_name='Marja-Liisa';
 update support_private.names set created_at=now()-interval '31 days' where first_name='Jöns';
 set local role anon;
 r:=public.support_swarm();
 assert jsonb_array_length(r->'names')=1 and r->'names'->0->>'name'='Mikko' and (r->'names'->0->>'contributor')::boolean,'contributors stay';
 assert (r->>'former')::int=1,'expired supporter counted';
 reset role;
 assert not exists(select 1 from support_private.names where first_name in ('Marja-Liisa','Jöns')),'personal data deleted';
 assert exists(select 1 from support_private.names where first_name='Nazim' and active_from is null),'recent pending kept';

 -- The waiting list never grows beyond 500 entries.
 insert into support_private.names(first_name,token_hash,created_at)
   select 'Test',encode(sha256(convert_to(g::text,'UTF8')),'hex'),now()-interval '1 day'+g*interval '1 second' from generate_series(1,520) g;
 set local role anon;
 perform public.support_name_submit('Lotta',repeat('e',64));
 reset role;
 assert (select count(*) from support_private.names where active_from is null)<=500,'waiting list capped';
 assert exists(select 1 from support_private.names where first_name='Lotta'),'newest entry kept';
end $test$;
select 'support_swarm ok';
rollback;
