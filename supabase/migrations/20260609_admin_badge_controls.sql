create extension if not exists pgcrypto;

create table if not exists public.user_badge_admin_controls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  ignore_before timestamptz not null,
  reason text not null,
  note text null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  released_at timestamptz null
);

create unique index if not exists uq_user_badge_admin_controls_active
  on public.user_badge_admin_controls(user_id, badge_id)
  where released_at is null;

create index if not exists idx_user_badge_admin_controls_user_id
  on public.user_badge_admin_controls(user_id);

create index if not exists idx_user_badge_admin_controls_badge_id
  on public.user_badge_admin_controls(badge_id);

create table if not exists public.admin_badge_audit_logs (
  id bigserial primary key,
  actor_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  action text not null check (action in ('revoke', 'restore', 'set_ignore_before', 'clear_ignore_before')),
  reason text not null,
  details jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_badge_audit_logs_target_user_id
  on public.admin_badge_audit_logs(target_user_id);

create index if not exists idx_admin_badge_audit_logs_badge_id
  on public.admin_badge_audit_logs(badge_id);

create index if not exists idx_admin_badge_audit_logs_created_at
  on public.admin_badge_audit_logs(created_at desc);
