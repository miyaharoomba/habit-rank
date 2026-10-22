-- Include actor display names in device push notification payloads.
-- The in-app notification API already resolves actor_name, but device push
-- only sees push_outbox.payload, so the name must be embedded there too.

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
