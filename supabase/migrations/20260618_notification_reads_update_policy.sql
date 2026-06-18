-- Allow idempotent notification read marking.
-- The app uses upsert(notification_id, user_id), which becomes an UPDATE when a
-- read row already exists. Without this policy, repeated mark-read requests can
-- fail under RLS.

alter table public.notification_reads enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'notification_reads'
      and policyname = 'notification_reads_update_mine'
  ) then
    create policy notification_reads_update_mine
      on public.notification_reads
      for update
      to authenticated
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;
