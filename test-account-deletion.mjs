import assert from 'node:assert/strict';
import fs from 'node:fs';

const auth=fs.readFileSync(new URL('./dist/auth.js',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('./supabase/config.toml',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('./supabase/migrations/20260923184732_account_self_deletion.sql',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('./supabase/functions/delete-account/index.ts',import.meta.url),'utf8');

for(const expected of ['delete-account-form','Benutzername zur Bestätigung','Aktuelles Passwort','An ${escapeHTML(teacher.name)} übertragen','deletionDecisions()','localStorage.removeItem(STORE)','localStorage.removeItem(SESSION)'])assert(auth.includes(expected),expected);
assert(config.includes('[functions.delete-account]')&&config.includes('verify_jwt = true'));
for(const expected of ['account_private.deletion_transfers','auth.uid()','m.role=\'teacher\'','before delete on auth.users','update classroom_private.rooms set owner_id=transfer.new_owner_id','security invoker'])assert(migration.includes(expected),expected);
for(const expected of ['auth.getUser()','signInWithPassword','account_prepare_deletion',"storage.from('classroom-stream').remove",'admin.auth.admin.deleteUser','account_cancel_deletion'])assert(edge.includes(expected),expected);
assert(edge.indexOf("storage.from('classroom-stream').remove")<edge.indexOf('admin.auth.admin.deleteUser'),'Storage bytes are removed before the cascading Auth deletion');

console.log('PASS: account deletion reauthenticates, transfers classrooms and removes Storage before Auth data.');
