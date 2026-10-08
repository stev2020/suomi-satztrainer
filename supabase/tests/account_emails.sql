-- Run after account_emails; all fixture data is rolled back.
begin;
create temporary table email_test_users(k text primary key,v uuid);
insert into email_test_users values('anna',gen_random_uuid()),('ben',gen_random_uuid());
insert into auth.users(id,aud,role) select v,'authenticated','authenticated' from email_test_users;
insert into public.account_emails(user_id,email,adult_confirmed_at,verify_token_hash,verify_expires_at)
 select v,'anna@example.org',now(),repeat('a',64),now()+interval '1 day' from email_test_users where k='anna';
grant all on email_test_users to authenticated;
do $test$
declare a uuid; b uuid; failed boolean;
begin
 select v into a from email_test_users where k='anna';
 select v into b from email_test_users where k='ben';
 -- Only well-formed, lower-case addresses and SHA-256 hashes are accepted; one token belongs to one row.
 failed:=false; begin insert into public.account_emails(user_id,email,adult_confirmed_at) values(b,'Ben@Example.org',now()); exception when check_violation then failed:=true; end; assert failed,'upper case refused';
 failed:=false; begin insert into public.account_emails(user_id,email,adult_confirmed_at) values(b,'no-at-sign',now()); exception when check_violation then failed:=true; end; assert failed,'malformed refused';
 failed:=false; begin insert into public.account_emails(user_id,email) values(b,'ben@example.org'); exception when not_null_violation then failed:=true; end; assert failed,'age confirmation required';
 failed:=false; begin insert into public.account_emails(user_id,email,adult_confirmed_at,verify_token_hash) values(b,'ben@example.org',now(),'short'); exception when check_violation then failed:=true; end; assert failed,'token must be a hash';
 failed:=false; begin insert into public.account_emails(user_id,email,adult_confirmed_at,verify_token_hash) values(b,'ben@example.org',now(),repeat('a',64)); exception when unique_violation then failed:=true; end; assert failed,'token is unique';
 -- The same address may belong to several accounts.
 insert into public.account_emails(user_id,email,adult_confirmed_at) values(b,'anna@example.org',now());
 -- Browsers never reach the table, not even their own row.
 set local role authenticated;
 perform set_config('request.jwt.claim.sub',a::text,true);
 failed:=false; begin perform 1 from public.account_emails; exception when insufficient_privilege then failed:=true; end; assert failed,'no select for authenticated';
 failed:=false; begin insert into public.account_emails(user_id,email,adult_confirmed_at) values(a,'x@example.org',now()); exception when insufficient_privilege then failed:=true; end; assert failed,'no insert for authenticated';
 set local role anon;
 failed:=false; begin perform 1 from public.account_emails; exception when insufficient_privilege then failed:=true; end; assert failed,'no select for anon';
 reset role;
 -- Deleting the account removes the address.
 delete from auth.users where id=a;
 assert not exists(select 1 from public.account_emails where user_id=a),'cascade on account deletion';
end $test$;
select 'PASS: address format, age confirmation, token hashes, shared addresses, no browser access, cascade' as result;
rollback;
