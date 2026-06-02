import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
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
    .select("id, user_id, body, created_at")
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

  const items = rows.map((r) => ({
    id: r.id,
    user_id: r.user_id,
    user_name: nameMap.get(r.user_id) ?? "NoName",
    body: r.body,
    created_at: r.created_at,
  }));

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
    })
    .select("id, user_id, body, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}
``