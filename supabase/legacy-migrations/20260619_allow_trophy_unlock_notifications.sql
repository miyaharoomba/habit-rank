-- Allow trophy unlock notifications to be stored.
-- The application and push trigger already handle type = 'trophy_unlock',
-- but the notifications.type CHECK constraint rejected those rows.

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
        'trophy_unlock'::text
      ]
    )
  );
