-- Hide actively banned users from both leaderboard RPCs.
-- A ban is active when is_banned is true and banned_until is either null or in
-- the future. Expired temporary bans are allowed back into the rankings.

drop function if exists public.get_best_leaderboard();
drop function if exists public.get_best_leaderboard(integer);
drop function if exists public.get_best_leaderboard(bigint);
drop function if exists public.get_current_leaderboard();
drop function if exists public.get_current_leaderboard(integer);
drop function if exists public.get_current_leaderboard(bigint);

create function public.get_best_leaderboard(limit_count integer default 50)
returns table (
  rank_no integer,
  user_id uuid,
  display_name text,
  best_seconds bigint
)
language sql
security definer
set search_path = public
as $$
  with eligible_best as (
    select
      s.user_id,
      coalesce(nullif(trim(p.display_name), ''), 'NoName')::text as display_name,
      max(floor(extract(epoch from (s.ended_at - s.started_at)))::bigint) as best_seconds
    from public.streak_sessions s
    join public.profiles p on p.id = s.user_id
    left join public.user_flags uf on uf.user_id = s.user_id
    where s.ended_at is not null
      and not (
        coalesce(uf.is_banned, false)
        and (uf.banned_until is null or uf.banned_until > now())
      )
    group by s.user_id, p.display_name
  ),
  ranked as (
    select
      row_number() over (order by best_seconds desc, user_id)::integer as rank_no,
      user_id,
      display_name,
      best_seconds
    from eligible_best
  )
  select rank_no, user_id, display_name, best_seconds
  from ranked
  order by rank_no
  limit greatest(1, least(coalesce(limit_count, 50), 100));
$$;

create function public.get_current_leaderboard(limit_count integer default 50)
returns table (
  rank_no integer,
  user_id uuid,
  display_name text,
  current_seconds bigint,
  started_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest_active as (
    select distinct on (s.user_id)
      s.user_id,
      coalesce(nullif(trim(p.display_name), ''), 'NoName')::text as display_name,
      s.started_at
    from public.streak_sessions s
    join public.profiles p on p.id = s.user_id
    left join public.user_flags uf on uf.user_id = s.user_id
    where s.ended_at is null
      and not (
        coalesce(uf.is_banned, false)
        and (uf.banned_until is null or uf.banned_until > now())
      )
    order by s.user_id, s.started_at desc
  ),
  ranked as (
    select
      row_number() over (
        order by floor(extract(epoch from (now() - started_at))) desc, user_id
      )::integer as rank_no,
      user_id,
      display_name,
      greatest(0, floor(extract(epoch from (now() - started_at)))::bigint) as current_seconds,
      started_at
    from latest_active
  )
  select rank_no, user_id, display_name, current_seconds, started_at
  from ranked
  order by rank_no
  limit greatest(1, least(coalesce(limit_count, 50), 100));
$$;

grant execute on function public.get_best_leaderboard(integer) to authenticated;
grant execute on function public.get_current_leaderboard(integer) to authenticated;
