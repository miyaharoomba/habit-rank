import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing env: ${name}`);
  }
  return value;
}

function createAdminSupabaseClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  const userClient = await createClient();

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

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

  const adminClient = createAdminSupabaseClient();

  const { data: row, error: rowErr } = await adminClient
    .from("global_chat_messages")
    .select("id, user_id")
    .eq("id", messageId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const msg = row as Pick<ChatMessageRow, "id" | "user_id">;

  if (msg.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { error: updateErr } = await adminClient
    .from("global_chat_messages")
    .update({
      body,
      edited_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: messageId });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  // 1) まずは通常のログイン済みユーザーとして認証
  const userClient = await createClient();

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2) 管理者判定（既存の admin ページと同じ is_admin RPC を使う）
  const { data: isAdmin, error: adminErr } = await userClient.rpc("is_admin");

  // 3) 実際の削除は service role で行う（RLS を確実に回避）
  const adminClient = createAdminSupabaseClient();

  // 4) 対象メッセージを取得
  const { data: row, error: rowErr } = await adminClient
    .from("global_chat_messages")
    .select("id, user_id, image_url, file_url")
    .eq("id", messageId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const msg = row as ChatMessageRow;

  if (msg.user_id !== user.id && (adminErr || !isAdmin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 5) DBから削除
  const { error: delErr } = await adminClient
    .from("global_chat_messages")
    .delete()
    .eq("id", messageId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // 6) 添付があれば Storage からも削除
  // global-chat/upload では dm-media を流用していたので同じ bucket を使う
  const paths = [msg.image_url, msg.file_url].filter(Boolean) as string[];

  let storageWarning: string | null = null;
  if (paths.length > 0) {
    const { error: storageErr } = await adminClient.storage
      .from("dm-media")
      .remove(paths);

    if (storageErr) {
      storageWarning = storageErr.message;
    }
  }

  return NextResponse.json({
    ok: true,
    deletedId: messageId,
    storageWarning,
  });
}


type ChatMessageRow = {
  id: string;
  user_id: string;
  image_url: string | null;
  file_url: string | null;
};

