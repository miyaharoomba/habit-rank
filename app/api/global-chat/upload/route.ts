import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Nodeでも動く簡易UUID
function uuidLike() {
  // @ts-ignore
  if (globalThis.crypto?.randomUUID) {
    // @ts-ignore
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function safeExt(filename: string) {
  const last = filename.split(".").pop() || "";
  const ext = last.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

export async function POST(req: Request) {
  const supabase = await createClient();

  // ログインチェック
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // multipart/form-data
  const form = await req.formData();
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  if (caption.length > 200) {
    return NextResponse.json({ ok: false, error: "caption is too long" }, { status: 400 });
  }

  // 種別判定（image / video / file）
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const messageType = isImage ? "image" : isVideo ? "video" : "file";

  // 既存 DM と同じ bucket を流用
  const ext = safeExt(file.name);
  const objectPath = `global/${uuidLike()}.${ext}`;

  // 1) Storage にアップロード
  const { error: upErr } = await supabase.storage
    .from("dm-media")
    .upload(objectPath, file, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // 2) global_chat_messages に保存
  const insertPayload: any = {
    user_id: user.id,
    body: caption || "",
    message_type: messageType,
    file_name: null,
    file_mime: null,
    file_size: null,
    image_url: null,
    file_url: null,
  };

  if (messageType === "image") {
    insertPayload.image_url = objectPath;
  } else {
    insertPayload.file_url = objectPath;
    insertPayload.file_name = file.name;
    insertPayload.file_mime = mime;
    insertPayload.file_size = file.size;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("global_chat_messages")
    .insert(insertPayload)
    .select("id, created_at")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
  }

  // 3) 表示用 signed URL を返す
  const { data: signed, error: sErr } = await supabase.storage
    .from("dm-media")
    .createSignedUrl(objectPath, 60 * 60);

  return NextResponse.json({
    ok: true,
    messageType,
    messageId: inserted?.id ?? null,
    createdAt: inserted?.created_at ?? null,
    path: objectPath,
    signedUrl: sErr ? null : signed?.signedUrl ?? null,
    fileName: file.name,
    mime,
    size: file.size,
    warning: sErr ? sErr.message : null,
  });
}