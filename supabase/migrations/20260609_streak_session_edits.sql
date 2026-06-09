create extension if not exists pgcrypto;

create table if not exists public.streak_session_edits (
  id uuid primary key default gen_random_uuid(),
  session_id bigint null,
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in ('adjust', 'merge', 'split', 'delete', 'create')),
  before_payload jsonb,
  after_payload jsonb,
  edit_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_streak_session_edits_user_id
  on public.streak_session_edits(user_id);

create index if not exists idx_streak_session_edits_session_id
  on public.streak_session_edits(session_id);
