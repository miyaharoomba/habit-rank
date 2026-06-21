-- Add message editing and replies for DM messages.

alter table public.dm_messages
  add column if not exists edited_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.dm_messages(id) on delete set null;

create index if not exists idx_dm_messages_reply_to
  on public.dm_messages(reply_to_message_id);

drop function if exists public.send_dm_message(uuid, text);
drop function if exists public.send_dm_message(uuid, text, uuid);

create function public.send_dm_message(
  p_thread_id uuid,
  p_body text,
  p_reply_to_message_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_message_id uuid;
  v_is_member boolean := false;
  v_reply_valid boolean := true;
  v_body text := nullif(trim(coalesce(p_body, '')), '');
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if v_body is null then
    raise exception 'body is required';
  end if;

  if length(v_body) > 200 then
    raise exception 'body must be 200 characters or fewer';
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

  if p_reply_to_message_id is not null then
    select exists (
      select 1
        from public.dm_messages m
       where m.id = p_reply_to_message_id
         and m.thread_id = p_thread_id
         and m.unsent_at is null
    )
      into v_reply_valid;
  end if;

  if not v_reply_valid then
    raise exception 'reply target not found';
  end if;

  insert into public.dm_messages (
    thread_id,
    sender_id,
    body,
    message_type,
    image_path,
    image_mime,
    image_size,
    file_path,
    file_name,
    file_mime,
    file_size,
    reply_to_message_id
  )
  values (
    p_thread_id,
    v_user_id,
    v_body,
    'text',
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    p_reply_to_message_id
  )
  returning id into v_message_id;

  return v_message_id;
end;
$$;

grant execute on function public.send_dm_message(uuid, text, uuid) to authenticated;
