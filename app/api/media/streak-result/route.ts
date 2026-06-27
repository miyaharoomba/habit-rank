import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

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

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim() ?? "";
  if (!/^\d+$/.test(sessionId)) {
    return NextResponse.json({ error: "invalid session" }, { status: 400 });
  }

  const admin = getAdminClient();
  const { data: session, error } = await admin
    .from("streak_sessions")
    .select("result_photo_path")
    .eq("id", sessionId)
    .maybeSingle();
  if (error || !session?.result_photo_path) {
    return NextResponse.json({ error: "photo not found" }, { status: 404 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from("dm-media")
    .createSignedUrl(session.result_photo_path, 60 * 5);
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signedError?.message ?? "signed URL failed" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
