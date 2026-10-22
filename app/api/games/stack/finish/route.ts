import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  awardStackBadges,
  getStackGameAdminClient,
} from "@/app/lib/stackGameServer";
import {
  evaluateReplay,
  MAX_REPLAY_TAPS,
  stackRewardXp,
  STACK_GAME_VERSION,
} from "@/app/games/stack/gameEngine";
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
  if (!run || !["started", "finished"].includes(run.status) || run.game_version !== STACK_GAME_VERSION) {
    return NextResponse.json({ error: "run is not active" }, { status: 409 });
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  const replayMs = tapsMs.reduce((sum, tap) => sum + tap, 0);
  if (ageMs < replayMs - 2_000 || (run.status === "started" && ageMs > 20 * 60_000)) {
    return NextResponse.json({ error: "invalid run timing" }, { status: 400 });
  }

  const result = evaluateReplay(tapsMs, Number(run.seed));
  if (!result.gameOver) {
    return NextResponse.json({ error: "run is not finished" }, { status: 400 });
  }

  const { data: saved, error: saveError } = await admin.rpc("finalize_minigame_run", {
    p_run_id: run.id, p_user_id: user.id, p_game_key: "stack_tower", p_game_version: STACK_GAME_VERSION,
    p_result: { score: result.score, blocks: result.blocks, perfects: result.perfects, maxCombo: result.maxCombo },
    p_replay: tapsMs, p_reward: stackRewardXp(result.score),
  });
  if (saveError || !saved) {
    console.error("stack finalization failed:", saveError);
    return NextResponse.json({ error: "記録の保存に失敗しました。もう一度お試しください。" }, { status: 500 });
  }

  const { data: bestRows, error: bestError } = await admin
    .from("minigame_runs")
    .select("score")
    .eq("user_id", user.id)
    .eq("game_key", "stack_tower")
    .eq("game_version", STACK_GAME_VERSION)
    .eq("status", "finished")
    .order("score", { ascending: false })
    .limit(1);

  if (bestError) console.error("stack best lookup failed after save:", bestError);

  const bestScore = Number(bestRows?.[0]?.score ?? result.score);
  let unlocked: Awaited<ReturnType<typeof awardStackBadges>> = [];
  try { unlocked = await awardStackBadges({ userId: user.id, bestScore }); }
  catch (error) { console.error("stack badge award failed after save:", error); }

  if (unlocked.length > 0) {
    await triggerPushDispatchBestEffort("stack-tower-badge");
  }

  return NextResponse.json({
    ok: true,
    score: result.score,
    blocks: result.blocks,
    perfects: result.perfects,
    maxCombo: result.maxCombo,
    bestScore,
    ...saved,
    unlocked: unlocked.map((badge) => ({
      title: badge.title,
      titleLabel: badge.title_label,
      rank: badge.badge_rank,
    })),
  });
}
