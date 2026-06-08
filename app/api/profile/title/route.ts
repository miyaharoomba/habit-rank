import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const badgeId = String(body?.badgeId ?? "").trim();

  if (!badgeId) {
    return NextResponse.json({ error: "badgeId is required" }, { status: 400 });
  }

  // そのバッジを獲得済みか確認
  const { data: userBadge, error: ubErr } = await supabase
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", user.id)
    .eq("badge_id", badgeId)
    .maybeSingle();

  if (ubErr) {
    return NextResponse.json({ error: ubErr.message }, { status: 500 });
  }

  if (!userBadge) {
    return NextResponse.json(
      { error: "その称号はまだ設定できません。" },
      { status: 403 }
    );
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ current_title_badge_id: badgeId })
    .eq("id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, badgeId });
}

export async function DELETE() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({ current_title_badge_id: null })
    .eq("id", user.id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}