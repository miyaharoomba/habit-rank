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

  // ログインチェック（cookieセッション）
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // multipart/form-data
  const form = await req.formData();
  const threadId = String(form.get("threadId") ?? "");
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("file");

  if (!threadId) {
    return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  // 種別判定（image / video / file）
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const messageType = isImage ? "image" : isVideo ? "video" : "file";

  // 保存パス: "{threadId}/{uuid}.{ext}"
  const ext = safeExt(file.name);
  const objectPath = `${threadId}/${uuidLike()}.${ext}`;

  // 1) Storage にアップロード（dm-media: private bucket）
  // upload(path, fileBody) [1](https://github.com/orgs/vercel/repositories)
  const { error: upErr } = await supabase.storage
    .from("dm-media")
    .upload(objectPath, file, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    // RLS違反や容量制限など
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // 2) dm_messages に保存（あなたが拡張したカラムに合わせる）
  // text: bodyのみ
  // image: image_path/image_mime/image_size
  // video/file: file_path/file_name/file_mime/file_size
  const insertPayload: any = {
    thread_id: threadId,
    sender_id: user.id,
    body: caption || "", // not null対策（空文字OK）
    message_type: messageType,
  };

  if (messageType === "image") {
    insertPayload.image_path = objectPath;
    insertPayload.image_mime = mime;
    insertPayload.image_size = file.size;
    insertPayload.file_path = null;
    insertPayload.file_name = null;
    insertPayload.file_mime = null;
    insertPayload.file_size = null;
  } else {
    insertPayload.file_path = objectPath;
    insertPayload.file_name = file.name;
    insertPayload.file_mime = mime;
    insertPayload.file_size = file.size;
    insertPayload.image_path = null;
    insertPayload.image_mime = null;
    insertPayload.image_size = null;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("dm_messages")
    .insert(insertPayload)
    .select("id, created_at")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
  }

  // 3) 表示用 signed URL を返す（Private bucketのプレビュー用）
  // createSignedUrl(path, expiresIn) [2](https://ihogehoge.hatenablog.com/entry/2025/04/21/153229)[3](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
  const { data: signed, error: sErr } = await supabase.storage
    .from("dm-media")
    .createSignedUrl(objectPath, 60 * 60); // 1時間

  // signed URL生成に失敗しても、DB保存・アップロードは完了している
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