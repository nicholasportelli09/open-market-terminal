-- Per-user copies of the terminal's browser storage (portfolio, watchlist, saved work) for cross-device sync.
-- Row-level security: each signed-in user can read and write only their own rows.
create table public.user_data (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (key ~ '^terminal\.[a-z0-9.]{1,60}$'),
  value text not null check (char_length(value) <= 1000000),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

comment on table public.user_data is 'Per-user copies of the terminal''s browser storage (portfolio, watchlist, saved work) for cross-device sync.';

alter table public.user_data enable row level security;

create policy "read own data" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "insert own data" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "update own data" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own data" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_data from anon;
grant select, insert, update, delete on public.user_data to authenticated;
