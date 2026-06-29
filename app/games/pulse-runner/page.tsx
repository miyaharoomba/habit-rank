import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveBannedUserIds } from "@/lib/bannedUsers";
import { levelFromProfileXp } from "@/app/lib/leveling";
import { jstDayStartIso } from "@/app/lib/stackGameServer";
import { PULSE_GAME_VERSION } from "./level";
import PulseRunnerGame from "./PulseRunnerGame";
import PulseLeaderboard, { type PulseRankingRow } from "./PulseLeaderboard";

type RunRow = {
  user_id: string;
  score: number;
  progress_percent: number | string;
  completed: boolean;
  coins_collected: number;
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
  const daysSinceMonday = (jst.getUTCDay() + 6) % 7;
  jst.setUTCDate(jst.getUTCDate() - daysSinceMonday);
  return new Date(`${jst.toISOString().slice(0, 10)}T00:00:00+09:00`).toISOString();
}

function betterRun(current: RunRow | undefined, next: RunRow) {
  if (!current) return true;
  if (next.score !== current.score) return next.score > current.score;
  if (next.coins_collected !== current.coins_collected) {
    return next.coins_collected > current.coins_collected;
  }
  return Number(next.progress_percent) > Number(current.progress_percent);
}

function bestPerUser(rows: RunRow[]) {
  const best = new Map<string, RunRow>();
  for (const row of rows) if (betterRun(best.get(row.user_id), row)) best.set(row.user_id, row);
  return Array.from(best.values()).sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.coins_collected !== b.coins_collected) return b.coins_collected - a.coins_collected;
    return Number(b.progress_percent) - Number(a.progress_percent);
  });
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
}): PulseRankingRow[] {
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
        distance: Number(run.score),
        progress: Number(run.progress_percent),
        completed: run.completed,
        coins: Number(run.coins_collected),
      };
    });
}

export default async function PulseRunnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const dayStart = jstDayStartIso();
  const [weeklyResult, allResult, bestResult, rewardedResult] = await Promise.all([
    supabase
      .from("minigame_runs")
      .select("user_id, score, progress_percent, completed, coins_collected, finished_at")
      .eq("game_key", "pulse_runner")
      .eq("game_version", PULSE_GAME_VERSION)
      .eq("status", "finished")
      .gte("finished_at", jstWeekStartIso())
      .limit(1000),
    supabase
      .from("minigame_runs")
      .select("user_id, score, progress_percent, completed, coins_collected, finished_at")
      .eq("game_key", "pulse_runner")
      .eq("game_version", PULSE_GAME_VERSION)
      .eq("status", "finished")
      .limit(2000),
    supabase
      .from("minigame_runs")
      .select("progress_percent")
      .eq("user_id", user.id)
      .eq("game_key", "pulse_runner")
      .eq("game_version", PULSE_GAME_VERSION)
      .eq("status", "finished")
      .order("progress_percent", { ascending: false })
      .limit(1),
    supabase
      .from("minigame_runs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("game_key", "pulse_runner")
      .eq("status", "finished")
      .gte("finished_at", dayStart),
  ]);

  const setupError =
    weeklyResult.error ?? allResult.error ?? bestResult.error ?? rewardedResult.error;
  if (setupError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#090d18] px-5 text-white">
        <div className="max-w-lg text-center">
          <h1 className="text-3xl font-black">PULSE RUNNER</h1>
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
  const allRuns = (allResult.data ?? []) as RunRow[];
  const userIds = Array.from(new Set(allRuns.map((run) => run.user_id)));
  const bannedIds = await getActiveBannedUserIds(userIds);

  const profiles = new Map<string, ProfileRow>();
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path, xp_total, level, current_title_badge_id")
      .in("id", userIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ProfileRow[]) profiles.set(row.id, row);
  }

  const badgeIds = Array.from(
    new Set(
      Array.from(profiles.values())
        .map((profile) => profile.current_title_badge_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const badges = new Map<string, BadgeRow>();
  if (badgeIds.length > 0) {
    const { data, error } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as BadgeRow[]) badges.set(row.id, row);
  }

  const shared = { profiles, badges, bannedIds };
  return (
    <main>
      <PulseRunnerGame
        initialBestProgress={Number(bestResult.data?.[0]?.progress_percent ?? 0)}
        rewardedRunsToday={rewardedResult.count ?? 0}
      />
      <PulseLeaderboard
        daily={buildRanking({ runs: dailyRuns, ...shared })}
        weekly={buildRanking({ runs: weeklyRuns, ...shared })}
        allTime={buildRanking({ runs: allRuns, ...shared })}
        myUserId={user.id}
      />
    </main>
  );
}
