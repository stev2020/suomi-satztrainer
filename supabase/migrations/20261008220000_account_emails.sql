-- Freiwillige E-Mail-Adresse zum Zurücksetzen des Passworts.
-- Die Adresse wird nur dafür verwendet. Sie gilt erst nach Bestätigung über einen Link; Links (Bestätigung und
-- Zurücksetzen) sind zufällige Einmal-Tokens, von denen hier nur der SHA-256-Hash liegt.
-- Der Browser erreicht diese Tabelle nie direkt, nur die Edge Function „account-email“ (service_role).
create table public.account_emails (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null
    check (email = lower(email) and char_length(email) between 6 and 254
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  -- Die Adresse darf nur hinterlegen, wer bestätigt, mindestens 16 zu sein.
  adult_confirmed_at timestamptz not null,
  verified_at timestamptz,
  verify_token_hash text check (verify_token_hash ~ '^[0-9a-f]{64}$'),
  verify_expires_at timestamptz,
  reset_token_hash text check (reset_token_hash ~ '^[0-9a-f]{64}$'),
  reset_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index account_emails_verify_token_idx on public.account_emails(verify_token_hash) where verify_token_hash is not null;
create unique index account_emails_reset_token_idx on public.account_emails(reset_token_hash) where reset_token_hash is not null;
create index account_emails_verified_email_idx on public.account_emails(email) where verified_at is not null;

alter table public.account_emails enable row level security;
create policy "deny direct browser access" on public.account_emails
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.account_emails from public, anon, authenticated;
grant select, insert, update, delete on table public.account_emails to service_role;
