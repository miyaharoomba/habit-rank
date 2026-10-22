import { replayPulse, validPulseInputs, PULSE_STEP_MS } from "@/app/games/pulse-runner/gameEngine";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  awardPulseRunnerBadges,
  getStackGameAdminClient,
} from "@/app/lib/stackGameServer";
import {
  PULSE_GAME_VERSION,
  pulseDistanceFromProgress,
  pulseRewardXp,
} from "@/app/games/pulse-runner/level";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type FinishBody = {
  runId?: unknown;
  progressPercent?: unknown;
  completed?: unknown;
  durationMs?: unknown;
  coins?: unknown;
  inputs?: unknown;
};

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
    !validPulseInputs(body?.inputs)
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
  if (!run || !["started", "finished"].includes(run.status) || run.game_version !== PULSE_GAME_VERSION) {
    return NextResponse.json({ error: "run is not active" }, { status: 409 });
  }

  const ageMs = Date.now() - new Date(run.started_at).getTime();
  if (durationMs > ageMs + 2_000 || (run.status === "started" && ageMs > 20 * 60_000)) {
    return NextResponse.json({ error: "invalid run timing" }, { status: 400 });
  }
  const verified = replayPulse(body.inputs, durationMs);
  if (!verified.finished || Math.abs(verified.durationMs - durationMs) > PULSE_STEP_MS ||
      Math.abs(verified.progressPercent - progress) > .02 || verified.coins !== coins ||
      verified.completed !== completed || verified.consumedInputs !== body.inputs.length) {
    return NextResponse.json({ error: "replay does not match result" }, { status: 400 });
  }
  const distanceMeters = pulseDistanceFromProgress(verified.progressPercent);
  const { data: saved, error: saveError } = await admin.rpc("finalize_minigame_run", {
    p_run_id: run.id, p_user_id: user.id, p_game_key: "pulse_runner", p_game_version: PULSE_GAME_VERSION,
    p_result: { score: distanceMeters, progress: verified.progressPercent, completed: verified.completed,
      completionMs: completed ? verified.durationMs : null, coins: verified.coins },
    p_replay: body.inputs, p_reward: pulseRewardXp(verified.progressPercent, verified.completed, verified.coins),
  });
  if (saveError || !saved) {
    console.error("pulse finalization failed:", saveError);
    return NextResponse.json({ error: "記録の保存に失敗しました。もう一度お試しください。" }, { status: 500 });
  }

  const { data: bestRows, error: bestError } = await admin
    .from("minigame_runs")
    .select("progress_percent")
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .eq("game_version", PULSE_GAME_VERSION)
    .eq("status", "finished")
    .order("progress_percent", { ascending: false })
    .limit(1);
  if (bestError) console.error("pulse best lookup failed after save:", bestError);

  const bestProgress = Number(bestRows?.[0]?.progress_percent ?? progress);
  let unlocked: Awaited<ReturnType<typeof awardPulseRunnerBadges>> = [];
  try {
    unlocked = await awardPulseRunnerBadges({ userId: user.id, bestProgress });
  } catch (badgeError) {
    console.error("pulse runner badge award failed after run save:", badgeError);
  }
  if (unlocked.length > 0) await triggerPushDispatchBestEffort("pulse-runner-badge");

  return NextResponse.json({
    ok: true,
    progressPercent: progress,
    completed,
    durationMs,
    distanceMeters,
    coins,
    bestProgress,
    ...saved,
    unlocked: unlocked.map((badge) => ({
      title: badge.title,
      titleLabel: badge.title_label,
      rank: badge.badge_rank,
    })),
  });
}
