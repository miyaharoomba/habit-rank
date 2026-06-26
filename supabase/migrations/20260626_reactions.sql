-- Lightweight reactions for result pages, global chat, and DM messages.
-- Application APIs validate target visibility before using the service role.

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  target_type text not null,
  target_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  check (
    target_type = any (
      array[
        'dm_message'::text,
        'global_chat_message'::text,
        'streak_session'::text
      ]
    )
  ),
  check (
    emoji = any (
      array[
        '👍'::text,
        '❤️'::text,
        '😂'::text,
        '🔥'::text,
        '👏'::text
      ]
    )
  )
);

create unique index if not exists reactions_unique_user_emoji
  on public.reactions (target_type, target_id, user_id, emoji);

create index if not exists reactions_target_created_idx
  on public.reactions (target_type, target_id, created_at);

create index if not exists reactions_user_created_idx
  on public.reactions (user_id, created_at desc);

alter table public.reactions enable row level security;
