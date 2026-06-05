import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ChatMessageRow = {
  id: string;
  image_url: string | null;
  file_url: string | null;
};

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 管理者チェック
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 対象メッセージを取得
  const { data: row, error: rowErr } = await supabase
    .from("global_chat_messages")
    .select("id, image_url, file_url")
    .eq("id", messageId)
    .maybeSingle();

  if (rowErr) {
    return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const msg = row as ChatMessageRow;

  // 先にDB削除
  const { error: delErr } = await supabase
    .from("global_chat_messages")
    .delete()
    .eq("id", messageId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // 画像 / ファイルがあれば Storage からも削除（失敗してもメッセージ削除は成功扱い）
  const paths = [msg.image_url, msg.file_url].filter(Boolean) as string[];

  let storageWarning: string | null = null;
  if (paths.length > 0) {
    const { error: storageErr } = await supabase.storage.from("dm-media").remove(paths);
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