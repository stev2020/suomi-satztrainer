// Local PostgreSQL regression runner. Supply PGLITE_MODULE or install @electric-sql/pglite.
const {PGlite}=await import(process.env.PGLITE_MODULE||'@electric-sql/pglite');
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
const db=new PGlite();
try {
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,aud text,role text,created_at timestamptz not null default now());
create table auth.sessions(id uuid primary key default gen_random_uuid(),user_id uuid);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,storage to authenticated,anon;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner uuid,owner_id text,created_at timestamptz not null default now());
alter table storage.objects enable row level security;
grant select,insert,delete on storage.objects to authenticated;`);
for(const file of fs.readdirSync(root+'/supabase/migrations').sort()) {
 await db.exec(fs.readFileSync(root+'/supabase/migrations/'+file,'utf8'));
}
for(const file of ['classrooms.sql','classroom_owner_delete.sql','classroom_threads.sql','classroom_teacher_roles.sql','classroom_display_names.sql','classroom_stream.sql','classroom_assignment_creators.sql','classroom_assignment_edit.sql','classroom_feedback.sql','classroom_activity.sql','classroom_direction.sql','sentence_quality.sql','account_self_deletion.sql','security_bundle.sql']) {
 const result=await db.exec(fs.readFileSync(root+'/supabase/tests/'+file,'utf8'));
 console.log(file,JSON.stringify(result.flatMap(r=>r.rows)));
}
} catch(e) { console.error(e.message,e.where||'');process.exitCode=1; }
finally {await db.close();}
