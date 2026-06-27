import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_CAPTURE_AGE_MS = 2 * 60 * 1000;
const RESULT_MEDIA_BUCKET = "dm-media";

type ActiveSessionRow = {
  id: number | string;
  user_id: string;
  ended_at: string | null;
  result_photo_path: string | null;
};

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function validSessionId(value: string) {
  return /^\d+$/.test(value);
}

async function authenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return error ? null : user;
}

async function activeSessionForUser(
  sessionId: string,
  userId: string
): Promise<ActiveSessionRow | null> {
  const admin = getAdminClient();
  const { data, error } = await admin
    .from("streak_sessions")
    .select("id, user_id, ended_at, result_photo_path")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ActiveSessionRow | null;
}

export async function POST(request: Request) {
  const user = await authenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const sessionId = String(form.get("sessionId") ?? "").trim();
  const capturedAtRaw = String(form.get("capturedAt") ?? "").trim();
  const photo = form.get("photo");

  if (!validSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "invalid session" }, { status: 400 });
  }
  if (!(photo instanceof File)) {
    return NextResponse.json({ ok: false, error: "camera photo is required" }, { status: 400 });
  }
  if (photo.type.toLowerCase() !== "image/jpeg") {
    return NextResponse.json({ ok: false, error: "JPEG camera photo required" }, { status: 415 });
  }
  if (photo.size <= 0 || photo.size > MAX_PHOTO_BYTES) {
    return NextResponse.json({ ok: false, error: "photo is too large" }, { status: 413 });
  }

  const capturedAt = new Date(capturedAtRaw);
  const captureAge = Date.now() - capturedAt.getTime();
  if (
    !Number.isFinite(capturedAt.getTime()) ||
    captureAge < -10_000 ||
    captureAge > MAX_CAPTURE_AGE_MS
  ) {
    return NextResponse.json(
      { ok: false, error: "photo must be captured immediately before upload" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(await photo.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return NextResponse.json({ ok: false, error: "invalid JPEG data" }, { status: 415 });
  }

  let session: ActiveSessionRow | null;
  try {
    session = await activeSessionForUser(sessionId, user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "session lookup failed";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
  if (!session) {
    return NextResponse.json({ ok: false, error: "active session not found" }, { status: 409 });
  }

  const admin = getAdminClient();
  const objectPath = `streak-results/${user.id}/${sessionId}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await admin.storage
    .from(RESULT_MEDIA_BUCKET)
    .upload(objectPath, bytes, {
      contentType: "image/jpeg",
      cacheControl: "604800",
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ ok: false, error: uploadError.message }, { status: 400 });
  }

  const serverCapturedAt = new Date().toISOString();
  const { data: updated, error: updateError } = await admin
    .from("streak_sessions")
    .update({
      result_photo_path: objectPath,
      result_photo_captured_at: serverCapturedAt,
    })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("ended_at", null)
    .select("id")
    .maybeSingle();

  if (updateError || !updated) {
    await admin.storage.from(RESULT_MEDIA_BUCKET).remove([objectPath]);
    return NextResponse.json(
      { ok: false, error: updateError?.message ?? "session was already finished" },
      { status: 409 }
    );
  }

  if (session.result_photo_path && session.result_photo_path !== objectPath) {
    const { error: removeError } = await admin.storage
      .from(RESULT_MEDIA_BUCKET)
      .remove([session.result_photo_path]);
    if (removeError) {
      console.error("old streak result photo cleanup failed:", removeError.message);
    }
  }

  return NextResponse.json({
    ok: true,
    capturedAt: serverCapturedAt,
    mediaUrl: `/api/media/streak-result?sessionId=${encodeURIComponent(sessionId)}`,
  });
}

export async function DELETE(request: Request) {
  const user = await authenticatedUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { sessionId?: unknown }
    | null;
  const sessionId = String(body?.sessionId ?? "").trim();
  if (!validSessionId(sessionId)) {
    return NextResponse.json({ ok: false, error: "invalid session" }, { status: 400 });
  }

  const session = await activeSessionForUser(sessionId, user.id);
  if (!session) {
    return NextResponse.json({ ok: false, error: "active session not found" }, { status: 409 });
  }

  const admin = getAdminClient();
  const { error: updateError } = await admin
    .from("streak_sessions")
    .update({ result_photo_path: null, result_photo_captured_at: null })
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .is("ended_at", null);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 400 });
  }

  if (session.result_photo_path) {
    const { error: removeError } = await admin.storage
      .from(RESULT_MEDIA_BUCKET)
      .remove([session.result_photo_path]);
    if (removeError) {
      console.error("streak result photo delete failed:", removeError.message);
    }
  }

  return NextResponse.json({ ok: true });
}
