-- Service-only, idempotent finalization. Daily reward slots cannot race.
begin;
alter table public.minigame_runs add column if not exists reward_eligible boolean not null default false;
alter table public.minigame_runs add column if not exists reward_slot integer;
create or replace function public.finalize_minigame_run(
  p_run_id uuid, p_user_id uuid, p_game_key text, p_game_version text,
  p_result jsonb, p_replay jsonb, p_reward numeric
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_run public.minigame_runs%rowtype;
  v_count integer;
  v_before public.profiles%rowtype;
  v_after public.profiles%rowtype;
  v_day timestamptz := date_trunc('day', now() at time zone 'Asia/Tokyo') at time zone 'Asia/Tokyo';
begin
  if p_user_id is null or p_game_key not in ('stack_tower','pulse_runner')
    or p_reward is null or p_reward < 0 or p_reward > 22 then raise exception 'invalid game'; end if;
  perform pg_advisory_xact_lock(hashtextextended('habit-user:' || p_user_id::text, 0));
  select * into v_run from public.minigame_runs
    where id=p_run_id and user_id=p_user_id and game_key=p_game_key and game_version=p_game_version for update;
  if not found then raise exception 'run is not active'; end if;
  select * into v_before from public.profiles where id=p_user_id;
  if v_run.status='finished' then
    if v_run.replay is distinct from p_replay then raise exception 'replay mismatch'; end if;
  elsif v_run.status='started' then
    select count(*) into v_count from public.minigame_runs where user_id=p_user_id
      and game_key=p_game_key and status='finished' and finished_at>=v_day;
    update public.minigame_runs set status='finished', finished_at=now(),
      score=(p_result->>'score')::integer,
      blocks_stacked=coalesce((p_result->>'blocks')::integer,0),
      perfect_count=coalesce((p_result->>'perfects')::integer,0),
      max_combo=coalesce((p_result->>'maxCombo')::integer,0),
      progress_percent=coalesce((p_result->>'progress')::numeric,0),
      completed=coalesce((p_result->>'completed')::boolean,false),
      completion_ms=(p_result->>'completionMs')::integer,
      coins_collected=coalesce((p_result->>'coins')::integer,0),
      reward_xp=case when v_count<3 then p_reward else 0 end,
      reward_eligible=v_count<3, reward_slot=least(3,v_count+1), replay=p_replay
      where id=p_run_id returning * into v_run;
  else raise exception 'run is not active';
  end if;
  select * into v_after from public.profiles where id=p_user_id;
  return jsonb_build_object('rewardXp',v_run.reward_xp,'rewardEligible',v_run.reward_eligible,
    'rewardedRunsToday',v_run.reward_slot,
    'levelBefore',coalesce(v_before.level,1),'levelAfter',coalesce(v_after.level,1));
end;
$$;
revoke all on function public.finalize_minigame_run(uuid,uuid,text,text,jsonb,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.finalize_minigame_run(uuid,uuid,text,text,jsonb,jsonb,numeric) to service_role;

-- Profiles are editable, earned XP and levels are not. Keep onboarding upserts working.
revoke insert, update on public.profiles from anon, authenticated;
grant insert (id,display_name,avatar_path,status_message,current_title_badge_id,suppress_global_streak_end_notification)
  on public.profiles to authenticated;
grant update (id,display_name,avatar_path,status_message,current_title_badge_id,suppress_global_streak_end_notification,updated_at)
  on public.profiles to authenticated;

CREATE OR REPLACE FUNCTION public.refresh_profile_level(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
 v_xp numeric(12, 1);
begin
 perform pg_advisory_xact_lock(hashtextextended('habit-user:' || p_user_id::text, 0));
 if p_user_id is null then
 return;
 end if;

 select (
 coalesce((
 select sum(public.streak_session_scaled_xp(s.started_at, s.ended_at))
 from public.streak_sessions s
 where s.user_id = p_user_id and s.ended_at is not null
 ), 0)
 +
 coalesce((
 select sum(r.reward_xp)
 from public.minigame_runs r
 where r.user_id = p_user_id and r.status = 'finished'
 ), 0)
 )::numeric(12, 1)
 into v_xp;

 update public.profiles
 set xp_total = v_xp,
 level = public.profile_level_from_xp(v_xp)
 where id = p_user_id;
end;
$function$;

-- A direct REST update must not bypass the title API's ownership check.
create or replace function public.check_profile_title_ownership()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.current_title_badge_id is not null and not exists (
    select 1 from public.user_badges where user_id=new.id and badge_id=new.current_title_badge_id
  ) then raise exception 'title badge is not owned' using errcode='42501'; end if;
  return new;
end;
$$;
revoke all on function public.check_profile_title_ownership() from public, anon, authenticated;
drop trigger if exists trg_check_profile_title_ownership on public.profiles;
create trigger trg_check_profile_title_ownership before insert or update of current_title_badge_id
on public.profiles for each row execute function public.check_profile_title_ownership();

-- Internal aggregate refreshes are not public RPCs.
revoke all on function public.refresh_profile_level(uuid) from public,anon,authenticated;
grant execute on function public.refresh_profile_level(uuid) to service_role;
notify pgrst, 'reload schema';
commit;
