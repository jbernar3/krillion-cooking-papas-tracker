-- Cooking Papas Season 2 (Jefferson, Davide, Jack and baby Adam).
-- Run this once in Supabase → SQL Editor → New query, after schema.sql.
-- Season 1 stays in the original `scores` table as the read-only archive.

create table if not exists public.scores_season2 (
  id          bigint generated always as identity primary key,
  player      text   not null check (player in ('jefferson', 'davide', 'jack', 'adam')),
  play_date   date   not null,
  score       bigint not null check (score >= 0),
  updated_at  timestamptz not null default now(),
  unique (player, play_date)  -- one score per papa per day; saving again overwrites
);

drop trigger if exists scores_season2_touch on public.scores_season2;
create trigger scores_season2_touch before update on public.scores_season2
  for each row execute function public.touch_updated_at();

alter table public.scores_season2 enable row level security;

drop policy if exists "read scores"   on public.scores_season2;
drop policy if exists "add scores"    on public.scores_season2;
drop policy if exists "change scores" on public.scores_season2;

create policy "read scores"   on public.scores_season2 for select to anon using (true);
create policy "add scores"    on public.scores_season2 for insert to anon with check (true);
create policy "change scores" on public.scores_season2 for update to anon using (true) with check (true);

-- Freeze Season 1: the archive can still be read, but no longer added to or changed.
drop policy if exists "add scores"    on public.scores;
drop policy if exists "change scores" on public.scores;
