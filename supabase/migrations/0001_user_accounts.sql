create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique
    check (username = lower(username) and username ~ '^[a-z0-9][a-z0-9._-]{2,31}$'),
  recovery_token_hash text not null
    check (recovery_token_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.learning_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb
    check (octet_length(state::text) <= 5000000),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.learning_state enable row level security;

drop policy if exists "users read own profile" on public.profiles;
create policy "users read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users read own learning state" on public.learning_state;
create policy "users read own learning state"
on public.learning_state for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "users insert own learning state" on public.learning_state;
create policy "users insert own learning state"
on public.learning_state for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "users update own learning state" on public.learning_state;
create policy "users update own learning state"
on public.learning_state for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists profiles_username_idx on public.profiles(username);
