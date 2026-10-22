-- Add Twitter-like comments to finished streak result pages.
-- A comment creates a private notification for the result owner and reuses the
-- existing push_outbox trigger/dispatcher pipeline.

create table if not exists public.result_comments (
  id uuid primary key default gen_random_uuid(),
  session_id bigint not null references public.streak_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (
    char_length(trim(body)) > 0
    and char_length(body) <= 280
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists result_comments_session_created_idx
  on public.result_comments (session_id, created_at);

create index if not exists result_comments_user_created_idx
  on public.result_comments (user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

alter table public.result_comments enable row level security;

drop policy if exists result_comments_select_authenticated on public.result_comments;
create policy result_comments_select_authenticated
  on public.result_comments
  for select
  to authenticated
  using (true);

drop policy if exists result_comments_insert_own on public.result_comments;
create policy result_comments_insert_own
  on public.result_comments
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.streak_sessions s
      where s.id = result_comments.session_id
        and s.ended_at is not null
    )
  );

drop policy if exists result_comments_update_own on public.result_comments;
create policy result_comments_update_own
  on public.result_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists result_comments_delete_own on public.result_comments;
create policy result_comments_delete_own
  on public.result_comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

drop trigger if exists trg_touch_result_comments_updated_at on public.result_comments;
create trigger trg_touch_result_comments_updated_at
before update on public.result_comments
for each row
execute function public.touch_updated_at();

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'dm'::text,
        'streak_end'::text,
        'admin_broadcast'::text,
        'support_reply'::text,
        'trophy_unlock'::text,
        'result_comment'::text
      ]
    )
  );

create or replace function public.enqueue_push_outbox_from_notification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_title text;
  v_body text;
  v_url text;
  v_actor_name text;
begin
  -- Admin broadcasts are manually fanned out by the app so the body can use the
  -- announcement content instead of only notifications.message_preview.
  if new.type = 'admin_broadcast' then
    return new;
  end if;

  if new.actor_id is not null then
    select coalesce(nullif(trim(p.display_name), ''), 'NoName')
      into v_actor_name
      from public.profiles p
     where p.id = new.actor_id;
  end if;

  v_actor_name := coalesce(v_actor_name, '誰か');

  if new.type = 'dm' and new.thread_id is not null then
    v_title := v_actor_name || 'からDM';
    v_body := coalesce(nullif(trim(new.message_preview), ''), '新しいDMがあります');
    v_url := '/dm/' || new.thread_id::text;

  elsif new.type = 'streak_end' and new.session_id is not null then
    v_title := v_actor_name || 'が継続を終了';
    v_body := '理由: ' || coalesce(nullif(trim(new.message_preview), ''), 'finished');
    v_url := '/results/' || new.session_id::text;

  elsif new.type = 'result_comment' and new.session_id is not null then
    v_title := v_actor_name || 'がリザルトにコメント';
    v_body := coalesce(nullif(trim(new.message_preview), ''), 'コメントが届きました');
    v_url := '/results/' || new.session_id::text;

  elsif new.type = 'support_reply' and new.support_thread_id is not null then
    v_title := '管理者から返信';
    v_body := coalesce(nullif(trim(new.message_preview), ''), '問い合わせに返信がありました');
    v_url := '/support/' || new.support_thread_id::text;

  elsif new.type = 'trophy_unlock' then
    v_title := 'トロフィー獲得！';
    v_body := coalesce(nullif(trim(new.message_preview), ''), '新しいトロフィーを獲得しました');
    v_url := '/badges';

  else
    v_title := '通知';
    v_body := coalesce(nullif(trim(new.message_preview), ''), '新しい通知があります');
    v_url := '/app';
  end if;

  if new.recipient_id is null then
    insert into public.push_outbox (notification_id, recipient_id, payload)
    select
      new.id,
      s.user_id,
      jsonb_build_object(
        'title', v_title,
        'body', v_body,
        'url', v_url
      )
    from (
      select distinct user_id
      from public.push_subscriptions
      where disabled = false
    ) s;

  else
    insert into public.push_outbox (notification_id, recipient_id, payload)
    values (
      new.id,
      new.recipient_id,
      jsonb_build_object(
        'title', v_title,
        'body', v_body,
        'url', v_url
      )
    );
  end if;

  return new;
end;
$function$;
