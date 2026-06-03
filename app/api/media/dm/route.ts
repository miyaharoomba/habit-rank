import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const path = String(url.searchParams.get("path") ?? "").trim();

  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from("dm-media")
    .createSignedUrl(path, 60 * 10); // 10分で十分。クライアントURL自体は固定

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? "signed url create failed" },
      { status: 400 }
    );
  }

  return NextResponse.redirect(data.signedUrl, 307);
}
``