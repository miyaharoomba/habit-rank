import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

type DmMessageRow = {
  id: string;
  sender_id: string;
  thread_id: string;
  image_path: string | null;
  file_path: string | null;
  unsent_at: string | null;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;

  const userClient = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 自分の送信メッセージか確認
  const { data: row, error: rowErr } = await userClient
    .from("dm_messages")
    .select("id, sender_id, thread_id, image_path, file_path, unsent_at")
    .eq("id", messageId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "message not found" }, { status: 404 });
  }

  const msg = row as DmMessageRow;

  if (msg.sender_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (msg.unsent_at) {
    return NextResponse.json({ ok: true, alreadyUnsent: true });
  }

  const admin = createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  const removePaths = [msg.image_path, msg.file_path].filter(Boolean) as string[];

  const { error: updErr } = await admin
    .from("dm_messages")
    .update({
      body: "",
      message_type: "text",
      image_path: null,
      file_path: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      unsent_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  let storageWarning: string | null = null;
  if (removePaths.length > 0) {
    const { error: storageErr } = await admin.storage
      .from("dm-media")
      .remove(removePaths);

    if (storageErr) {
      storageWarning = storageErr.message;
    }
  }

  return NextResponse.json({
    ok: true,
    unsentId: messageId,
    storageWarning,
  });
}
