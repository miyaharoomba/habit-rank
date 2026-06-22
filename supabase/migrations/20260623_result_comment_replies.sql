-- Allow result comments to reply to another result comment.
-- Deleted comments disappear completely; child replies simply lose their
-- preview instead of showing a deleted placeholder.

alter table public.result_comments
  add column if not exists reply_to_comment_id uuid null
  references public.result_comments(id)
  on delete set null;

create index if not exists result_comments_reply_to_idx
  on public.result_comments(reply_to_comment_id);

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
    and (
      reply_to_comment_id is null
      or exists (
        select 1
        from public.result_comments parent
        where parent.id = result_comments.reply_to_comment_id
          and parent.session_id = result_comments.session_id
      )
    )
  );

drop policy if exists result_comments_update_own on public.result_comments;
create policy result_comments_update_own
  on public.result_comments
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      reply_to_comment_id is null
      or exists (
        select 1
        from public.result_comments parent
        where parent.id = result_comments.reply_to_comment_id
          and parent.session_id = result_comments.session_id
      )
    )
  );
