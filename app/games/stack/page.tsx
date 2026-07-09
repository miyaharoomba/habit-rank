import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBannedUserIds } from "@/lib/bannedUsers";
import { levelFromProfileXp } from "@/app/lib/leveling";
import { jstDayStartIso } from "@/app/lib/stackGameServer";
import { STACK_GAME_VERSION } from "./gameEngine";
import StackTowerGame from "./StackTowerGame";
import StackLeaderboard, { type StackRankingRow } from "./StackLeaderboard";

type RunRow = {
  user_id: string;
  score: number;
  blocks_stacked: number;
  perfect_count: number;
  finished_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  xp_total: number | string | null;
  level: number | null;
  current_title_badge_id: string | null;
};

type BadgeRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

function jstWeekStartIso() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const day = jst.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(jst);
  monday.setUTCDate(jst.getUTCDate() - daysSinceMonday);
  const date = monday.toISOString().slice(0, 10);
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

function bestPerUser(rows: RunRow[]) {
  const best = new Map<string, RunRow>();
  for (const row of rows) {
    const current = best.get(row.user_id);
    if (!current || row.score > current.score) best.set(row.user_id, row);
  }
  return Array.from(best.values()).sort(
    (a, b) => b.score - a.score || b.blocks_stacked - a.blocks_stacked
  );
}

function buildRanking({
  runs,
  profiles,
  badges,
  bannedIds,
}: {
  runs: RunRow[];
  profiles: Map<string, ProfileRow>;
  badges: Map<string, BadgeRow>;
  bannedIds: Set<string>;
}): StackRankingRow[] {
  return bestPerUser(runs)
    .filter((run) => !bannedIds.has(run.user_id))
    .slice(0, 50)
    .map((run, index) => {
      const profile = profiles.get(run.user_id);
      const title = profile?.current_title_badge_id
        ? badges.get(profile.current_title_badge_id) ?? null
        : null;
      return {
        rank: index + 1,
        userId: run.user_id,
        displayName: profile?.display_name?.trim() || "NoName",
        avatarPath: profile?.avatar_path ?? null,
        level: levelFromProfileXp(profile?.xp_total, profile?.level),
        titleLabel: title?.title_label ?? null,
        titleRank: title?.badge_rank ?? null,
        score: Number(run.score),
        blocks: Number(run.blocks_stacked),
        perfects: Number(run.perfect_count),
      };
    });
}

export default async function StackTowerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const dayStart = jstDayStartIso();
  const weekStart = jstWeekStartIso();

  const [weeklyResult, allTimeResult, myBestResult, rewardedResult] = await Promise.all([
    supabase
      .from("minigame_runs")
      .select("user_id, score, blocks_stacked, perfect_count, finished_at")
      .eq("game_key", "stack_tower")
      .eq("game_version", STACK_GAME_VERSION)
      .eq("status", "finished")
      .gte("finished_at", weekStart)
      .order("score", { ascending: false })
      .limit(500),
    supabase
      .from("minigame_runs")
      .select("user_id, score, blocks_stacked, perfect_count, finished_at")
      .eq("game_key", "stack_tower")
      .eq("game_version", STACK_GAME_VERSION)
      .eq("status", "finished")
      .order("score", { ascending: false })
      .limit(500),
    supabase
      .from("minigame_runs")
      .select("score")
      .eq("user_id", user.id)
      .eq("game_key", "stack_tower")
      .eq("game_version", STACK_GAME_VERSION)
      .eq("status", "finished")
      .order("score", { ascending: false })
      .limit(1),
    supabase
      .from("minigame_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("game_key", "stack_tower")
      .eq("status", "finished")
      .gte("finished_at", dayStart),
  ]);

  const setupError = weeklyResult.error ?? allTimeResult.error ?? myBestResult.error;
  if (setupError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090d18] px-5 text-white">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl font-black">STACK TOWER</h1>
          <p className="mt-4 text-sm leading-6 text-white/65">
            ゲームデータベースを準備できませんでした。最新のSupabaseマイグレーションを適用してください。
          </p>
          <p className="mt-3 break-words text-xs text-red-300">{setupError.message}</p>
        </div>
      </main>
    );
  }

  const weeklyRuns = (weeklyResult.data ?? []) as RunRow[];
  const dailyRuns = weeklyRuns.filter(
    (run) => new Date(run.finished_at).getTime() >= new Date(dayStart).getTime()
  );
  const allTimeRuns = (allTimeResult.data ?? []) as RunRow[];
  const userIds = Array.from(new Set(allTimeRuns.map((run) => run.user_id)));
  const bannedIds = await getActiveBannedUserIds(userIds);

  const profileMap = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path, xp_total, level, current_title_badge_id")
      .in("id", userIds);
    if (error) throw new Error(error.message);
    for (const profile of (data ?? []) as ProfileRow[]) profileMap.set(profile.id, profile);
  }

  const badgeIds = Array.from(
    new Set(
      Array.from(profileMap.values())
        .map((profile) => profile.current_title_badge_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const badgeMap = new Map<string, BadgeRow>();
  if (badgeIds.length > 0) {
    const { data, error } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);
    if (error) throw new Error(error.message);
    for (const badge of (data ?? []) as BadgeRow[]) badgeMap.set(badge.id, badge);
  }

  const rankingArgs = { profiles: profileMap, badges: badgeMap, bannedIds };
  const daily = buildRanking({ runs: dailyRuns, ...rankingArgs });
  const weekly = buildRanking({ runs: weeklyRuns, ...rankingArgs });
  const allTime = buildRanking({ runs: allTimeRuns, ...rankingArgs });
  const initialBestScore = Number(myBestResult.data?.[0]?.score ?? 0);

  return (
    <main>
      <StackTowerGame
        initialBestScore={initialBestScore}
        rewardedRunsToday={rewardedResult.count ?? 0}
      />
      <StackLeaderboard
        daily={daily}
        weekly={weekly}
        allTime={allTime}
        myUserId={user.id}
      />
    </main>
  );
}
