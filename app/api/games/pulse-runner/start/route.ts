import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStackGameAdminClient, stackDailySeed } from "@/app/lib/stackGameServer";
import { PULSE_GAME_VERSION } from "@/app/games/pulse-runner/level";

export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getStackGameAdminClient();
  const { error: abandonError } = await admin
    .from("minigame_runs")
    .update({ status: "abandoned" })
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .eq("status", "started");
  if (abandonError) {
    return NextResponse.json({ error: abandonError.message }, { status: 500 });
  }

  const { data: run, error } = await admin
    .from("minigame_runs")
    .insert({
      user_id: user.id,
      game_key: "pulse_runner",
      game_version: PULSE_GAME_VERSION,
      seed: stackDailySeed(),
      status: "started",
    })
    .select("id, started_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ runId: run.id, startedAt: run.started_at });
}
