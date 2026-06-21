-- Add read receipts for one-to-one DM threads.

alter table public.dm_messages
  add column if not exists read_at timestamptz;

create index if not exists idx_dm_messages_thread_unread
  on public.dm_messages(thread_id, sender_id, read_at)
  where read_at is null and unsent_at is null;

create or replace function public.mark_dm_thread_read(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_member boolean := false;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select exists (
    select 1
      from public.dm_threads t
     where t.id = p_thread_id
       and (t.user_low = v_user_id or t.user_high = v_user_id)
  )
    into v_is_member;

  if not v_is_member then
    raise exception 'dm thread not found or forbidden';
  end if;

  update public.dm_messages m
     set read_at = now()
   where m.thread_id = p_thread_id
     and m.sender_id <> v_user_id
     and m.read_at is null
     and m.unsent_at is null;

  get diagnostics v_count = row_count;

  insert into public.notification_reads (notification_id, user_id)
  select n.id, v_user_id
    from public.notifications n
   where n.type = 'dm'
     and n.thread_id = p_thread_id
     and n.recipient_id = v_user_id
  on conflict (notification_id, user_id) do nothing;

  return v_count;
end;
$$;

grant execute on function public.mark_dm_thread_read(uuid) to authenticated;

drop function if exists public.get_my_dm_threads();
drop function if exists public.get_my_dm_threads(integer);
drop function if exists public.get_my_dm_threads(bigint);

create function public.get_my_dm_threads(limit_count integer default 50)
returns table (
  thread_id uuid,
  other_user_id uuid,
  other_display_name text,
  last_message text,
  last_message_at timestamptz,
  unread_count integer
)
language sql
security definer
set search_path = public
as $$
  with my_threads as (
    select
      t.id,
      case
        when t.user_low = auth.uid() then t.user_high
        else t.user_low
      end as other_user_id
    from public.dm_threads t
    where t.user_low = auth.uid()
       or t.user_high = auth.uid()
  ),
  last_messages as (
    select distinct on (m.thread_id)
      m.thread_id,
      case
        when m.unsent_at is not null then 'Unsent message'
        when nullif(trim(m.body), '') is not null then m.body
        when m.message_type = 'image' then 'Image'
        when m.message_type = 'video' then 'Video'
        when m.message_type = 'file' then coalesce(m.file_name, 'File')
        else 'Message'
      end as last_message,
      m.created_at as last_message_at
    from public.dm_messages m
    join my_threads mt on mt.id = m.thread_id
    order by m.thread_id, m.created_at desc
  ),
  unread_messages as (
    select
      m.thread_id,
      count(*)::integer as unread_count
    from public.dm_messages m
    join my_threads mt on mt.id = m.thread_id
    where m.sender_id <> auth.uid()
      and m.read_at is null
      and m.unsent_at is null
    group by m.thread_id
  )
  select
    mt.id as thread_id,
    mt.other_user_id,
    coalesce(nullif(trim(p.display_name), ''), 'NoName') as other_display_name,
    lm.last_message,
    lm.last_message_at,
    coalesce(um.unread_count, 0) as unread_count
  from my_threads mt
  left join public.profiles p on p.id = mt.other_user_id
  left join last_messages lm on lm.thread_id = mt.id
  left join unread_messages um on um.thread_id = mt.id
  order by lm.last_message_at desc nulls last, mt.id desc
  limit greatest(1, least(coalesce(limit_count, 50), 100));
$$;

grant execute on function public.get_my_dm_threads(integer) to authenticated;
