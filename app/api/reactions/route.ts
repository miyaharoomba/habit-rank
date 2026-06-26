import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  getReactionAdminClient,
  loadReactionMap,
  validateReactionTargetAccess,
} from "@/app/lib/reactionServer";
import { isReactionEmoji, isReactionTargetType } from "@/app/lib/reactions";

async function getUserOrUnauthorized() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;
  return user;
}

export async function GET(request: Request) {
  const user = await getUserOrUnauthorized();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType") ?? "";
  const targetId = url.searchParams.get("targetId") ?? "";

  if (!isReactionTargetType(targetType)) {
    return NextResponse.json({ error: "invalid target type" }, { status: 400 });
  }

  const admin = getReactionAdminClient();
  const access = await validateReactionTargetAccess({
    admin,
    targetType,
    targetId,
    userId: user.id,
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const reactionMap = await loadReactionMap({
    admin,
    targetType,
    targetIds: [targetId],
    myUserId: user.id,
  });

  return NextResponse.json({
    items: reactionMap.get(String(targetId)) ?? [],
  });
}

export async function POST(request: Request) {
  const user = await getUserOrUnauthorized();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    targetType?: unknown;
    targetId?: unknown;
    emoji?: unknown;
  } | null;

  const targetType = String(body?.targetType ?? "");
  const targetId = String(body?.targetId ?? "");
  const emoji = body?.emoji;

  if (!isReactionTargetType(targetType)) {
    return NextResponse.json({ error: "invalid target type" }, { status: 400 });
  }

  if (!isReactionEmoji(emoji)) {
    return NextResponse.json({ error: "invalid emoji" }, { status: 400 });
  }

  const admin = getReactionAdminClient();
  const access = await validateReactionTargetAccess({
    admin,
    targetType,
    targetId,
    userId: user.id,
  });

  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { data: existing, error: existingErr } = await admin
    .from("reactions")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("user_id", user.id)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 500 });
  }

  if (existing) {
    const { error } = await admin.from("reactions").delete().eq("id", existing.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else {
    const { error } = await admin.from("reactions").insert({
      target_type: targetType,
      target_id: targetId,
      user_id: user.id,
      emoji,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const reactionMap = await loadReactionMap({
    admin,
    targetType,
    targetIds: [targetId],
    myUserId: user.id,
  });

  return NextResponse.json({
    ok: true,
    items: reactionMap.get(String(targetId)) ?? [],
  });
}
