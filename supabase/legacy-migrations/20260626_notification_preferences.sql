-- Per-user notification preferences.
-- Defaults are opt-in: a missing row means that notification type is enabled.

create table if not exists public.notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, notification_type),
  check (
    notification_type = any (
      array[
        'dm'::text,
        'global_chat'::text,
        'streak_end'::text,
        'result_comment'::text,
        'admin_broadcast'::text,
        'trophy_unlock'::text,
        'support_reply'::text
      ]
    )
  )
);

create index if not exists notification_preferences_type_idx
  on public.notification_preferences (notification_type, enabled);

alter table public.notification_preferences enable row level security;

drop policy if exists notification_preferences_select_own on public.notification_preferences;
create policy notification_preferences_select_own
  on public.notification_preferences
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists notification_preferences_insert_own on public.notification_preferences;
create policy notification_preferences_insert_own
  on public.notification_preferences
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists notification_preferences_update_own on public.notification_preferences;
create policy notification_preferences_update_own
  on public.notification_preferences
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notification_preferences_delete_own on public.notification_preferences;
create policy notification_preferences_delete_own
  on public.notification_preferences
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.is_notification_enabled(
  p_user_id uuid,
  p_notification_type text
)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce(
    (
      select np.enabled
      from public.notification_preferences np
      where np.user_id = p_user_id
        and np.notification_type = p_notification_type
      limit 1
    ),
    true
  );
$function$;

grant execute on function public.is_notification_enabled(uuid, text) to authenticated;
grant execute on function public.is_notification_enabled(uuid, text) to service_role;

alter table public.notifications
  drop constraint if exists notifications_type_check;

alter table public.notifications
  add constraint notifications_type_check
  check (
    type = any (
      array[
        'dm'::text,
        'global_chat'::text,
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
  -- Admin broadcasts are manually fanned out by the app so the body can use
  -- the announcement content instead of only notifications.message_preview.
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

  elsif new.type = 'global_chat' then
    v_title := v_actor_name || 'が掲示板で返信';
    v_body := coalesce(nullif(trim(new.message_preview), ''), '掲示板に返信が届きました');
    v_url := '/app';

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
    v_body := coalesce(nullif(trim(new.message_preview), ''), '問い合わせに返信が届きました');
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
    ) s
    where public.is_notification_enabled(s.user_id, new.type);

  elsif public.is_notification_enabled(new.recipient_id, new.type) then
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
