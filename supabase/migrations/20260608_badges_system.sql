-- HABIT-RANK バッジ / トロフィーシステム基盤
-- Phase 1: テーブル / RLS / 初期シード

create extension if not exists pgcrypto;

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  title varchar(100) not null,
  description text not null,
  badge_rank varchar(20) not null
    check (badge_rank in ('platinum', 'gold', 'silver', 'bronze')),
  condition_type varchar(50) not null,
  condition_value integer not null default 0,
  icon_path text,
  created_at timestamptz not null default now()
);

create table if not exists public.user_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  is_pinned boolean not null default false,
  constraint unique_user_badge unique (user_id, badge_id)
);

create index if not exists idx_user_badges_user_id
  on public.user_badges(user_id);

create index if not exists idx_user_badges_badge_id
  on public.user_badges(badge_id);

create index if not exists idx_badges_condition_type
  on public.badges(condition_type);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- badges: 全員SELECT可能
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'badges'
      and policyname = 'badges_select_all'
  ) then
    create policy badges_select_all
      on public.badges
      for select
      using (true);
  end if;
end $$;

-- user_badges: 全員SELECT可能（他人の獲得状況も見られる）
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_badges'
      and policyname = 'user_badges_select_all'
  ) then
    create policy user_badges_select_all
      on public.user_badges
      for select
      using (true);
  end if;
end $$;

-- 初期シード
insert into public.badges (
  title,
  description,
  badge_rank,
  condition_type,
  condition_value,
  icon_path
)
select *
from (
  values
    ('最初の一歩', '最初の継続セッションを終了した', 'bronze', 'total_sessions', 1, null),
    ('習慣の確立', '継続セッションを合計30回終了した', 'silver', 'total_sessions', 30, null),
    ('継続の鬼', '最長継続記録が14日に達した', 'gold', 'max_streak_days', 14, null),
    ('朝型の達人', '午前5:00〜7:59の間にセッションを10回終了した', 'silver', 'early_bird_sessions', 10, null),
    ('10時間の壁', '合計継続時間が10時間を超えた', 'bronze', 'total_hours', 10, null),
    ('100時間の求道者', '合計継続時間が100時間を超えた', 'gold', 'total_hours', 100, null),
    ('伝説の継続者', 'すべてのトロフィー（プラチナ以外）を獲得した', 'platinum', 'complete_all', 0, null)
) as seed(
  title,
  description,
  badge_rank,
  condition_type,
  condition_value,
  icon_path
)
where not exists (
  select 1
  from public.badges b
  where b.title = seed.title
);