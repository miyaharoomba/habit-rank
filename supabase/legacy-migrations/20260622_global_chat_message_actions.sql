-- Add message editing and replies for global chat messages.

alter table public.global_chat_messages
  add column if not exists edited_at timestamptz,
  add column if not exists reply_to_message_id uuid references public.global_chat_messages(id) on delete set null;

create index if not exists idx_global_chat_messages_reply_to
  on public.global_chat_messages(reply_to_message_id);
