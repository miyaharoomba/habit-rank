-- Profile XP / level system.
-- 1 completed minute = 1 XP.
-- Level thresholds use triangular growth:
--   Lv2: 100 XP, Lv3: 300 XP, Lv4: 600 XP, ...

alter table public.profiles
  add column if not exists xp_total integer not null default 0,
  add column if not exists level integer not null default 1;

create index if not exists idx_profiles_level
  on public.profiles(level desc, xp_total desc);

create or replace function public.profile_level_from_xp(p_xp integer)
returns integer
language sql
immutable
as $function$
  select greatest(
    1,
    floor((1 + sqrt(1 + (8 * greatest(coalesce(p_xp, 0), 0)::numeric / 100.0))) / 2)::integer
  );
$function$;

create or replace function public.streak_session_xp(
  p_started_at timestamptz,
  p_ended_at timestamptz
)
returns integer
language sql
immutable
as $function$
  select case
    when p_started_at is null or p_ended_at is null then 0
    else greatest(
      0,
      floor(extract(epoch from (p_ended_at - p_started_at)) / 60)::integer
    )
  end;
$function$;

create or replace function public.refresh_profile_level(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_xp integer;
begin
  if p_user_id is null then
    return;
  end if;

  select coalesce(
    sum(public.streak_session_xp(s.started_at, s.ended_at)),
    0
  )::integer
  into v_xp
  from public.streak_sessions s
  where s.user_id = p_user_id
    and s.ended_at is not null;

  update public.profiles
     set xp_total = v_xp,
         level = public.profile_level_from_xp(v_xp)
   where id = p_user_id;
end;
$function$;

create or replace function public.refresh_profile_level_from_streak_session()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    perform public.refresh_profile_level(old.user_id);
    return old;
  end if;

  perform public.refresh_profile_level(new.user_id);

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform public.refresh_profile_level(old.user_id);
  end if;

  return new;
end;
$function$;

drop trigger if exists trg_refresh_profile_level_from_streak_session
  on public.streak_sessions;

create trigger trg_refresh_profile_level_from_streak_session
after insert or delete or update of user_id, started_at, ended_at
on public.streak_sessions
for each row
execute function public.refresh_profile_level_from_streak_session();

with profile_xp as (
  select
    p.id,
    coalesce(
      sum(public.streak_session_xp(s.started_at, s.ended_at))
        filter (where s.ended_at is not null),
      0
    )::integer as xp_total
  from public.profiles p
  left join public.streak_sessions s on s.user_id = p.id
  group by p.id
)
update public.profiles p
   set xp_total = profile_xp.xp_total,
       level = public.profile_level_from_xp(profile_xp.xp_total)
  from profile_xp
 where p.id = profile_xp.id;
