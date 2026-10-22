-- Atomic history corrections. Existing rows and function names are preserved.
-- Run this migration before deploying application code that calls the new RPC.
begin;

alter table public.streak_session_edits enable row level security;
revoke all on public.streak_session_edits from anon;
drop policy if exists streak_session_edits_select_own on public.streak_session_edits;
create policy streak_session_edits_select_own on public.streak_session_edits
  for select to authenticated using (user_id = auth.uid());

create or replace function public.correct_streak_session(
  p_session_id bigint,
  p_action text,
  p_values jsonb default '{}'::jsonb,
  p_edit_reason text default 'correction'
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_target public.streak_sessions%rowtype;
  v_next public.streak_sessions%rowtype;
  v_inserted public.streak_sessions%rowtype;
  v_end timestamptz;
  v_resume timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_reason text;
begin
  if v_uid is null then raise exception 'ログインが必要です。' using errcode = '42501'; end if;
  if p_action not in ('adjust', 'merge', 'split') then raise exception 'invalid correction'; end if;
  perform pg_advisory_xact_lock(hashtextextended('habit-user:' || v_uid::text, 0));
  select * into v_target from public.streak_sessions
    where id = p_session_id and user_id = v_uid for update;
  if not found then raise exception '対象の継続履歴が見つかりません。'; end if;
  if v_target.ended_at is null then raise exception '継続中の記録は補正できません。'; end if;
  v_before := to_jsonb(v_target);
  v_reason := left(coalesce(nullif(trim(p_edit_reason), ''), 'correction'), 200);

  if p_action = 'adjust' then
    v_end := (p_values->>'newEndedAt')::timestamptz;
    if v_end is null or v_end <= v_target.started_at or v_end > now() then
      raise exception '終了時刻は開始時刻より後かつ現在以前にしてください。';
    end if;
    if exists (
      select 1 from public.streak_sessions s where s.user_id = v_uid and s.id <> p_session_id
        and s.started_at < v_end and coalesce(s.ended_at, 'infinity'::timestamptz) > v_target.started_at
    ) then raise exception '他の継続履歴と時間が重複するため保存できません。'; end if;
    update public.streak_sessions set ended_at = v_end,
      end_reason = left(coalesce(nullif(trim(p_values->>'newEndReason'), ''), 'finished'), 200)
      where id = p_session_id and user_id = v_uid returning * into v_target;
    v_after := to_jsonb(v_target);

  elsif p_action = 'merge' then
    select * into v_next from public.streak_sessions
      where user_id = v_uid and id <> p_session_id and started_at >= v_target.ended_at
      order by started_at, id limit 1 for update;
    if not found then raise exception '結合できる次の継続履歴が見つかりません。'; end if;
    if exists (
      select 1 from public.streak_sessions s where s.user_id = v_uid
        and s.id not in (p_session_id, v_next.id)
        and s.started_at < coalesce(v_next.ended_at, 'infinity'::timestamptz)
        and coalesce(s.ended_at, 'infinity'::timestamptz) > v_target.started_at
    ) then raise exception '他の継続履歴と時間が重複するため保存できません。'; end if;
    v_before := jsonb_build_object('current', to_jsonb(v_target), 'next', to_jsonb(v_next));
    -- Delete first so an interval exclusion constraint can also be added safely.
    delete from public.streak_sessions where id = p_session_id and user_id = v_uid;
    update public.streak_sessions set started_at = v_target.started_at
      where id = v_next.id and user_id = v_uid returning * into v_next;
    v_after := jsonb_build_object('merged_into_session_id', v_next.id,
      'started_at', v_next.started_at, 'ended_at', v_next.ended_at, 'end_reason', v_next.end_reason);

  else
    v_end := (p_values->>'actualEndedAt')::timestamptz;
    v_resume := (p_values->>'resumedAt')::timestamptz;
    if v_end is null or v_resume is null or
      not (v_target.started_at < v_end and v_end < v_resume and v_resume < v_target.ended_at) then
      raise exception '分割の終了・再開時刻を元の記録の範囲内で指定してください。';
    end if;
    update public.streak_sessions set ended_at = v_end,
      end_reason = left(coalesce(nullif(trim(p_values->>'firstEndReason'), ''), 'manual split'), 200)
      where id = p_session_id and user_id = v_uid;
    insert into public.streak_sessions(user_id, started_at, ended_at, end_reason)
      values(v_uid, v_resume, v_target.ended_at,
        left(coalesce(nullif(trim(p_values->>'secondEndReason'), ''), 'manual split'), 200))
      returning * into v_inserted;
    select * into v_target from public.streak_sessions where id = p_session_id;
    v_after := jsonb_build_object('first', to_jsonb(v_target), 'second', to_jsonb(v_inserted));
  end if;

  insert into public.streak_session_edits
    (session_id, user_id, action_type, before_payload, after_payload, edit_reason)
    values(p_session_id, v_uid, p_action, v_before, v_after, v_reason);
  return jsonb_build_object('sessionId', p_session_id,
    'keptSessionId', v_next.id, 'removedSessionId', case when p_action = 'merge' then p_session_id end,
    'firstSessionId', p_session_id, 'secondSessionId', v_inserted.id);
end;
$$;
revoke all on function public.correct_streak_session(bigint, text, jsonb, text) from public, anon;
grant execute on function public.correct_streak_session(bigint, text, jsonb, text) to authenticated;

-- Claim an outbox item before network I/O. A token protects updates by stale workers.
alter table public.push_outbox add column if not exists claimed_by uuid;
alter table public.push_outbox add column if not exists claimed_until timestamptz;
alter table public.push_outbox add column if not exists next_attempt_at timestamptz;
alter table public.push_outbox add column if not exists delivered_to text[] not null default '{}';
create or replace function public.claim_push_outbox(p_worker uuid, p_limit integer default 25)
returns setof public.push_outbox
language sql security definer set search_path = public, pg_temp
as $$
  with candidates as (
    select id from public.push_outbox
    where sent_at is null and attempts < 8
      and (next_attempt_at is null or next_attempt_at <= now())
      and (claimed_until is null or claimed_until < now())
    order by created_at, id
    for update skip locked limit greatest(1, least(p_limit, 100))
  )
  update public.push_outbox o set claimed_by = p_worker,
    claimed_until = now() + interval '10 minutes', attempts = o.attempts + 1
  from candidates c where o.id = c.id returning o.*;
$$;
revoke all on function public.claim_push_outbox(uuid, integer) from public, anon, authenticated;
grant execute on function public.claim_push_outbox(uuid, integer) to service_role;

create index if not exists idx_push_outbox_unclaimed
  on public.push_outbox(created_at) where sent_at is null;

notify pgrst, 'reload schema';
commit;
