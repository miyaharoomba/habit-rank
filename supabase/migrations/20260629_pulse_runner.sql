-- Pulse Runner minigame records and rewards.

alter table public.minigame_runs
  drop constraint if exists minigame_runs_game_key_check;

alter table public.minigame_runs
  add constraint minigame_runs_game_key_check
  check (game_key in ('stack_tower', 'pulse_runner'));

alter table public.minigame_runs
  add column if not exists progress_percent numeric(5, 2) not null default 0
    check (progress_percent between 0 and 100),
  add column if not exists completed boolean not null default false,
  add column if not exists completion_ms integer,
  add column if not exists coins_collected integer not null default 0
    check (coins_collected >= 0);

create index if not exists idx_minigame_runs_pulse_ranking
  on public.minigame_runs(
    game_key,
    status,
    progress_percent desc,
    completed desc,
    completion_ms asc
  );

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
    ('Pulse Runner: Launch', 'Beat Runner', 'Pulse Runnerで25%地点へ到達しました。', 'bronze', 'pulse_best_progress', 25, null),
    ('Pulse Runner: Rocket Pilot', 'Rocket Pilot', 'Pulse Runnerでロケット区間を突破しました。', 'silver', 'pulse_best_progress', 60, null),
    ('Pulse Runner: Full Sync', 'Full Sync', 'Pulse Runnerを100%クリアしました。', 'gold', 'pulse_best_progress', 100, null)
) as seed(title, title_label, description, badge_rank, condition_type, condition_value, icon_path)
where not exists (
  select 1 from public.badges b where b.title = seed.title
);
