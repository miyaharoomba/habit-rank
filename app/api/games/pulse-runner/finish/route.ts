import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  awardPulseRunnerBadges,
  getStackGameAdminClient,
  jstDayStartIso,
} from "@/app/lib/stackGameServer";
import {
  LEVEL_DURATION_MS,
  PULSE_GAME_VERSION,
  pulseRewardXp,
  type PulseInput,
} from "@/app/games/pulse-runner/level";
import { levelFromProfileXp } from "@/app/lib/leveling";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type FinishBody = {
  runId?: unknown;
  progressPercent?: unknown;
  completed?: unknown;
  durationMs?: unknown;
  coins?: unknown;
  inputs?: unknown;
};

function validInputs(value: unknown): value is PulseInput[] {
  if (!Array.isArray(value) || value.length > 500) return false;
  let previous = -1;
  for (const item of value) {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    const atMs = Number(row.atMs);
    if (!Number.isInteger(atMs) || atMs < previous || atMs > 120_000) return false;
    if (row.action !== "down" && row.action !== "up") return false;
    previous = atMs;
  }
  return true;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as FinishBody | null;
  const runId = String(body?.runId ?? "");
  const progress = Math.round(Number(body?.progressPercent) * 100) / 100;
  const completed = body?.completed === true;
  const durationMs = Math.round(Number(body?.durationMs));
  const coins = Math.round(Number(body?.coins));
  if (
    !runId ||
    !Number.isFinite(progress) ||
    progress < 0 ||
    progress > 100 ||
    !Number.isInteger(durationMs) ||
    durationMs < 200 ||
    durationMs > 120_000 ||
    !Number.isInteger(coins) ||
    coins < 0 ||
    coins > 3 ||
    !validInputs(body?.inputs)
  ) {
    return NextResponse.json({ error: "invalid run" }, { status: 400 });
  }

  const admin = getStackGameAdminClient();
  const { data: run, error: runError } = await admin
    .from("minigame_runs")
    .select("id, status, started_at, game_version")
    .eq("id", runId)
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .maybeSingle();
  if (runError) return NextResponse.json({ error: runError.message }, { status: 500 });
  if (!run || run.status !== "started" || run.game_version !== PULSE_GAME_VERSION) {
    return NextResponse.json({ error: "run is not active" }, { status: 409 });
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  const expectedMaxProgress = Math.min(100, (durationMs / LEVEL_DURATION_MS) * 100 + 4);
  if (
    durationMs > ageMs + 2_000 ||
    ageMs > 20 * 60_000 ||
    progress > expectedMaxProgress ||
    (completed && (progress < 99.5 || durationMs < LEVEL_DURATION_MS * 0.82))
  ) {
    return NextResponse.json({ error: "invalid run timing" }, { status: 400 });
  }

  const { data: profileBefore } = await admin
    .from("profiles")
    .select("xp_total, level")
    .eq("id", user.id)
    .maybeSingle();

  const { count: runsToday, error: countError } = await admin
    .from("minigame_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .eq("status", "finished")
    .gte("finished_at", jstDayStartIso());
  if (countError) return NextResponse.json({ error: countError.message }, { status: 500 });

  const rewardEligible = (runsToday ?? 0) < 3;
  const rewardXp = rewardEligible ? pulseRewardXp(progress, completed, coins) : 0;
  const { data: updatedRun, error: updateError } = await admin
    .from("minigame_runs")
    .update({
      status: "finished",
      score: completed ? Math.max(1, 100_000 - durationMs) : Math.round(progress * 100),
      progress_percent: progress,
      completed,
      completion_ms: completed ? durationMs : null,
      coins_collected: coins,
      reward_xp: rewardXp,
      replay: body.inputs,
      finished_at: new Date().toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "started")
    .select("id")
    .maybeSingle();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  if (!updatedRun) {
    return NextResponse.json({ error: "run is not active" }, { status: 409 });
  }

  const { data: bestRows, error: bestError } = await admin
    .from("minigame_runs")
    .select("progress_percent")
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .eq("status", "finished")
    .order("progress_percent", { ascending: false })
    .limit(1);
  if (bestError) return NextResponse.json({ error: bestError.message }, { status: 500 });

  const bestProgress = Number(bestRows?.[0]?.progress_percent ?? progress);
  const unlocked = await awardPulseRunnerBadges({ userId: user.id, bestProgress });
  const { data: profileAfter } = await admin
    .from("profiles")
    .select("xp_total, level")
    .eq("id", user.id)
    .maybeSingle();

  if (unlocked.length > 0) await triggerPushDispatchBestEffort("pulse-runner-badge");

  const levelBefore = levelFromProfileXp(profileBefore?.xp_total ?? 0, profileBefore?.level ?? 1);
  const levelAfter = levelFromProfileXp(
    profileAfter?.xp_total ?? profileBefore?.xp_total ?? 0,
    profileAfter?.level ?? levelBefore
  );

  return NextResponse.json({
    ok: true,
    progressPercent: progress,
    completed,
    durationMs,
    coins,
    bestProgress,
    rewardXp,
    rewardEligible,
    rewardedRunsToday: Math.min(3, (runsToday ?? 0) + 1),
    levelBefore,
    levelAfter,
    unlocked: unlocked.map((badge) => ({
      title: badge.title,
      titleLabel: badge.title_label,
      rank: badge.badge_rank,
    })),
  });
}
