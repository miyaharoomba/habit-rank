import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  message_type: "text" | "image" | "video" | "file";
  image_url: string | null; // 実際は storage path を入れている
  file_url: string | null;  // 実際は storage path を入れている
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const limit = Math.min(Number(requestUrl.searchParams.get("limit") ?? 50), 100);

  const { data, error } = await supabase
    .from("global_chat_messages")
    .select(
      "id, user_id, body, created_at, message_type, image_url, file_url, file_name, file_mime, file_size"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ChatRow[];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    (profiles ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  const bucket = supabase.storage.from("dm-media");

  const items = await Promise.all(
    rows.map(async (r) => {
      let signedImageUrl: string | null = null;
      let signedFileUrl: string | null = null;

      if (r.image_url) {
        const { data: signed } = await bucket.createSignedUrl(r.image_url, 60 * 60);
        signedImageUrl = signed?.signedUrl ?? null;
      }

      if (r.file_url) {
        const { data: signed } = await bucket.createSignedUrl(r.file_url, 60 * 60);
        signedFileUrl = signed?.signedUrl ?? null;
      }

      return {
        id: r.id,
        user_id: r.user_id,
        user_name: nameMap.get(r.user_id) ?? "NoName",
        body: r.body,
        created_at: r.created_at,
        message_type: r.message_type ?? "text",
        image_url: signedImageUrl,
        file_url: signedFileUrl,
        file_name: r.file_name,
        file_mime: r.file_mime,
        file_size: r.file_size,
      };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bodyJson = await request.json().catch(() => null);
  const body = String(bodyJson?.body ?? "").trim();

  if (!body) {
    return NextResponse.json({ error: "本文は必須です。" }, { status: 400 });
  }

  if (body.length > 200) {
    return NextResponse.json({ error: "本文は200文字以内です。" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("global_chat_messages")
    .insert({
      user_id: user.id,
      body,
      message_type: "text",
      image_url: null,
      file_url: null,
      file_name: null,
      file_mime: null,
      file_size: null,
    })
    .select("id, user_id, body, created_at, message_type")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}