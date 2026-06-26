-- Rebuild profile XP/level consistency.
-- This keeps the materialized profiles.xp_total/profiles.level values aligned
-- with the scaled XP formula used by the application.

alter table public.profiles
  alter column xp_total type numeric(12, 1) using xp_total::numeric(12, 1),
  alter column xp_total set default 0;

create or replace function public.profile_level_from_xp(p_xp numeric)
returns integer
language sql
immutable
as $function$
  select greatest(
    1,
    floor(
      (1 + sqrt(1 + (8 * greatest(coalesce(p_xp, 0), 0) / 100.0))) / 2
    )::integer
  );
$function$;

create or replace function public.streak_session_scaled_xp(
  p_started_at timestamptz,
  p_ended_at timestamptz
)
returns numeric
language sql
immutable
as $function$
  with duration as (
    select greatest(
      0,
      extract(epoch from (p_ended_at - p_started_at)) / 60.0
    ) as minutes
  )
  select case
    when p_started_at is null or p_ended_at is null then 0::numeric
    when minutes <= 0 then 0::numeric
    else round(
      (
        minutes
        * least(
          2.2,
          0.1 + (1.1 * ln(greatest(minutes, 1)) / ln(1440))
        )
      )::numeric,
      1
    )
  end
  from duration;
$function$;

create or replace function public.refresh_profile_level(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_xp numeric(12, 1);
begin
  if p_user_id is null then
    return;
  end if;

  select coalesce(
    sum(public.streak_session_scaled_xp(s.started_at, s.ended_at)),
    0
  )::numeric(12, 1)
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
      sum(public.streak_session_scaled_xp(s.started_at, s.ended_at))
        filter (where s.ended_at is not null),
      0
    )::numeric(12, 1) as xp_total
  from public.profiles p
  left join public.streak_sessions s on s.user_id = p.id
  group by p.id
)
update public.profiles p
   set xp_total = profile_xp.xp_total,
       level = public.profile_level_from_xp(profile_xp.xp_total)
  from profile_xp
 where p.id = profile_xp.id;
