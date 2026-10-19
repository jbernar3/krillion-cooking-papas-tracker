-- Cooking Papas scoreboard: run this once in Supabase → SQL Editor → New query.

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  player      text   not null check (player in ('jefferson', 'davide', 'jack')),
  play_date   date   not null,
  score       bigint not null check (score >= 0),
  updated_at  timestamptz not null default now(),
  unique (player, play_date)  -- one score per papa per day; saving again overwrites
);

-- Keep updated_at fresh when a score is overwritten.
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists scores_touch on public.scores;
create trigger scores_touch before update on public.scores
  for each row execute function public.touch_updated_at();

-- Row Level Security: the site uses the public (anon/publishable) key,
-- so allow reading, adding and overwriting scores, but never deleting.
alter table public.scores enable row level security;

drop policy if exists "read scores"   on public.scores;
drop policy if exists "add scores"    on public.scores;
drop policy if exists "change scores" on public.scores;

create policy "read scores"   on public.scores for select to anon using (true);
create policy "add scores"    on public.scores for insert to anon with check (true);
create policy "change scores" on public.scores for update to anon using (true) with check (true);
