-- Single-source streak-end notifications.
-- The previous database had two streak end triggers, and the app also inserted
-- a streak_end notification after finishing a session. That produced duplicate
-- notifications and duplicate push_outbox rows.

drop trigger if exists trg_notify_on_streak_end on public.streak_sessions;
drop trigger if exists trg_notify_streak_end on public.streak_sessions;

create or replace function public.notify_streak_end()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_reason text;
  v_suppress boolean := false;
begin
  if old.ended_at is null and new.ended_at is not null then
    v_reason := nullif(trim(coalesce(new.end_reason, '')), '');
    if v_reason is null then
      v_reason := 'finished';
    end if;

    select exists (
      select 1
      from public.admin_users au
      join public.profiles p on p.id = au.user_id
      where au.user_id = new.user_id
        and p.suppress_global_streak_end_notification = true
    )
    into v_suppress;

    if v_suppress then
      return new;
    end if;

    begin
      update public.notifications
         set actor_id = new.user_id,
             recipient_id = null,
             thread_id = null,
             message_preview = v_reason
       where type = 'streak_end'
         and session_id = new.id;

      if not found then
        insert into public.notifications (
          type,
          actor_id,
          recipient_id,
          thread_id,
          session_id,
          message_preview,
          created_at
        )
        values (
          'streak_end',
          new.user_id,
          null,
          null,
          new.id,
          v_reason,
          now()
        );
      end if;
    exception when others then
      -- Finishing a session must not roll back because notification creation failed.
      null;
    end;
  end if;

  return new;
end;
$function$;

create trigger trg_notify_streak_end
after update of ended_at on public.streak_sessions
for each row
execute function public.notify_streak_end();

drop function if exists public.notify_on_streak_end();
