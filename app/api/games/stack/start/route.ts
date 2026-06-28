import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getStackGameAdminClient,
  stackDailySeed,
} from "@/app/lib/stackGameServer";
import { STACK_GAME_VERSION } from "@/app/games/stack/gameEngine";

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
  await admin
    .from("minigame_runs")
    .update({ status: "abandoned" })
    .eq("user_id", user.id)
    .eq("game_key", "stack_tower")
    .eq("status", "started");

  const seed = stackDailySeed();
  const { data: run, error } = await admin
    .from("minigame_runs")
    .insert({
      user_id: user.id,
      game_key: "stack_tower",
      game_version: STACK_GAME_VERSION,
      seed,
      status: "started",
    })
    .select("id, seed, started_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    runId: run.id,
    seed: run.seed,
    startedAt: run.started_at,
  });
}
