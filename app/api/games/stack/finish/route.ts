import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  awardStackBadges,
  getStackGameAdminClient,
  jstDayStartIso,
} from "@/app/lib/stackGameServer";
import {
  evaluateReplay,
  MAX_REPLAY_TAPS,
  stackRewardXp,
  STACK_GAME_VERSION,
} from "@/app/games/stack/gameEngine";
import { levelFromProfileXp } from "@/app/lib/leveling";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type FinishBody = {
  runId?: unknown;
  tapsMs?: unknown;
};

function validReplay(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= MAX_REPLAY_TAPS &&
    value.every(
      (tap) => Number.isInteger(tap) && Number(tap) >= 50 && Number(tap) <= 60_000
    )
  );
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
  if (!runId || !validReplay(body?.tapsMs)) {
    return NextResponse.json({ error: "invalid replay" }, { status: 400 });
  }

  const tapsMs = body.tapsMs;
  const admin = getStackGameAdminClient();
  const { data: run, error: runError } = await admin
    .from("minigame_runs")
    .select("id, seed, status, started_at, game_version")
    .eq("id", runId)
    .eq("user_id", user.id)
    .eq("game_key", "stack_tower")
    .maybeSingle();

  if (runError) {
    return NextResponse.json({ error: runError.message }, { status: 500 });
  }
  if (!run || run.status !== "started" || run.game_version !== STACK_GAME_VERSION) {
    return NextResponse.json({ error: "run is not active" }, { status: 409 });
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  const replayMs = tapsMs.reduce((sum, tap) => sum + tap, 0);
  if (ageMs < replayMs - 2_000 || ageMs > 20 * 60_000) {
    return NextResponse.json({ error: "invalid run timing" }, { status: 400 });
  }

  const result = evaluateReplay(tapsMs, Number(run.seed));
  if (!result.gameOver) {
    return NextResponse.json({ error: "run is not finished" }, { status: 400 });
  }

  const { data: profileBefore } = await admin
    .from("profiles")
    .select("xp_total, level")
    .eq("id", user.id)
    .maybeSingle();

  const dayStart = jstDayStartIso();
  const { count: rewardedCount, error: countError } = await admin
    .from("minigame_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("game_key", "stack_tower")
    .eq("status", "finished")
    .gte("finished_at", dayStart);

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 500 });
  }

  const rewardEligible = (rewardedCount ?? 0) < 3;
  const rewardXp = rewardEligible ? stackRewardXp(result.score) : 0;
  const finishedAt = new Date().toISOString();

  const { error: updateError } = await admin
    .from("minigame_runs")
    .update({
      status: "finished",
      score: result.score,
      blocks_stacked: result.blocks,
      perfect_count: result.perfects,
      max_combo: result.maxCombo,
      reward_xp: rewardXp,
      replay: tapsMs,
      finished_at: finishedAt,
    })
    .eq("id", run.id)
    .eq("status", "started");

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { data: bestRows, error: bestError } = await admin
    .from("minigame_runs")
    .select("score")
    .eq("user_id", user.id)
    .eq("game_key", "stack_tower")
    .eq("status", "finished")
    .order("score", { ascending: false })
    .limit(1);

  if (bestError) {
    return NextResponse.json({ error: bestError.message }, { status: 500 });
  }

  const bestScore = Number(bestRows?.[0]?.score ?? result.score);
  const unlocked = await awardStackBadges({ userId: user.id, bestScore });

  const { data: profileAfter } = await admin
    .from("profiles")
    .select("xp_total, level")
    .eq("id", user.id)
    .maybeSingle();

  if (unlocked.length > 0) {
    await triggerPushDispatchBestEffort("stack-tower-badge");
  }

  const levelBefore = levelFromProfileXp(
    profileBefore?.xp_total ?? 0,
    profileBefore?.level ?? 1
  );
  const levelAfter = levelFromProfileXp(
    profileAfter?.xp_total ?? profileBefore?.xp_total ?? 0,
    profileAfter?.level ?? levelBefore
  );

  return NextResponse.json({
    ok: true,
    score: result.score,
    blocks: result.blocks,
    perfects: result.perfects,
    maxCombo: result.maxCombo,
    bestScore,
    rewardXp,
    rewardEligible,
    rewardedRunsToday: Math.min(3, (rewardedCount ?? 0) + 1),
    levelBefore,
    levelAfter,
    unlocked: unlocked.map((badge) => ({
      title: badge.title,
      titleLabel: badge.title_label,
      rank: badge.badge_rank,
    })),
  });
}
