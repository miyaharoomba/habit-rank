import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getStackGameAdminClient } from "@/app/lib/stackGameServer";

type AbandonBody = {
  runId?: unknown;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as AbandonBody | null;
  const runId = String(body?.runId ?? "");
  if (!UUID_PATTERN.test(runId)) {
    return NextResponse.json({ error: "invalid run" }, { status: 400 });
  }

  const admin = getStackGameAdminClient();
  const { error } = await admin
    .from("minigame_runs")
    .update({ status: "abandoned" })
    .eq("id", runId)
    .eq("user_id", user.id)
    .eq("game_key", "pulse_runner")
    .eq("status", "started");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
