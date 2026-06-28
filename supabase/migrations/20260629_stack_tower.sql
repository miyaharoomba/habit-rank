-- Stack Tower minigame: validated runs, rankings, XP rewards, and titles.

create extension if not exists pgcrypto;

create table if not exists public.minigame_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  game_key text not null check (game_key in ('stack_tower')),
  game_version text not null,
  seed integer not null,
  status text not null default 'started'
    check (status in ('started', 'finished', 'abandoned')),
  score integer not null default 0 check (score >= 0),
  blocks_stacked integer not null default 0 check (blocks_stacked >= 0),
  perfect_count integer not null default 0 check (perfect_count >= 0),
  max_combo integer not null default 0 check (max_combo >= 0),
  reward_xp numeric(8, 1) not null default 0 check (reward_xp >= 0),
  replay jsonb not null default '[]'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_minigame_runs_leaderboard
  on public.minigame_runs(game_key, status, score desc, finished_at desc);

create index if not exists idx_minigame_runs_user_finished
  on public.minigame_runs(user_id, finished_at desc);

alter table public.minigame_runs enable row level security;

drop policy if exists minigame_runs_finished_select on public.minigame_runs;
create policy minigame_runs_finished_select
  on public.minigame_runs
  for select
  using (status = 'finished' or auth.uid() = user_id);

create or replace function public.refresh_profile_level(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_xp numeric(12, 1);
begin
  if p_user_id is null then
    return;
  end if;

  select (
    coalesce((
      select sum(public.streak_session_scaled_xp(s.started_at, s.ended_at))
      from public.streak_sessions s
      where s.user_id = p_user_id and s.ended_at is not null
    ), 0)
    +
    coalesce((
      select sum(r.reward_xp)
      from public.minigame_runs r
      where r.user_id = p_user_id and r.status = 'finished'
    ), 0)
  )::numeric(12, 1)
  into v_xp;

  update public.profiles
     set xp_total = v_xp,
         level = public.profile_level_from_xp(v_xp)
   where id = p_user_id;
end;
$function$;

create or replace function public.refresh_profile_level_from_minigame_run()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_profile_level(old.user_id);
    return old;
  end if;

  perform public.refresh_profile_level(new.user_id);
  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.refresh_profile_level(old.user_id);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_refresh_profile_level_from_minigame_run
  on public.minigame_runs;

create trigger trg_refresh_profile_level_from_minigame_run
after insert or delete or update of user_id, status, reward_xp
on public.minigame_runs
for each row
execute function public.refresh_profile_level_from_minigame_run();

insert into public.badges (
  title,
  title_label,
  description,
  badge_rank,
  condition_type,
  condition_value,
  icon_path
)
select *
from (
  values
    ('Stack Tower: First Step', 'Tower Rookie', 'Stack Towerで最初のブロックを積みました。', 'bronze', 'stack_best_score', 1, null),
    ('Stack Tower: Skyward', 'Sky Builder', 'Stack Towerで3,000点を達成しました。', 'silver', 'stack_best_score', 3000, null),
    ('Stack Tower: Perfect Architect', 'Perfect Architect', 'Stack Towerで8,000点を達成しました。', 'gold', 'stack_best_score', 8000, null)
) as seed(title, title_label, description, badge_rank, condition_type, condition_value, icon_path)
where not exists (
  select 1 from public.badges b where b.title = seed.title
);
