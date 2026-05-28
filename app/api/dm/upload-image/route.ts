import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Nodeでも動く簡易UUID（依存なし）
function uuidLike() {
  // crypto.randomUUID があれば使う（Node 18+ / ブラウザ）
  // なければ簡易生成
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

export async function POST(req: Request) {
  const supabase = await createClient();

  // ログインチェック（cookieセッション）
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // multipart/form-data を受け取る
  const form = await req.formData();
  const threadId = String(form.get("threadId") ?? "");
  const caption = String(form.get("caption") ?? "").trim();
  const file = form.get("file");

  if (!threadId) {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  // 画像だけ許可（必要なら増やせる）
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "only image files allowed" }, { status: 400 });
  }

  // 保存パス: "{threadId}/{uuid}.{ext}"
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const objectPath = `${threadId}/${uuidLike()}.${ext}`;

  // 1) Storageにアップロード（dm-mediaはPrivate bucket想定）
  // storage upload API: from(bucket).upload(path, fileBody) [2](https://github.com/orgs/vercel/repositories)
  const { error: upErr } = await supabase.storage
    .from("dm-media")
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (upErr) {
    // ここでRLS違反なら storage.objects のポリシーを疑う（参加者判定など）
    return NextResponse.json({ error: upErr.message }, { status: 400 });
  }

  // 2) dm_messages に「画像メッセージ」をINSERT
  // message_type='image' / image_path 必須（あなたが追加した制約に合わせる）
  const { data: inserted, error: insErr } = await supabase
    .from("dm_messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      body: caption || "", // bodyはnot null対策（空文字OK）
      message_type: "image",
      image_path: objectPath,
      image_mime: file.type,
      image_size: file.size,
    })
    .select("id, created_at")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 400 });
  }

  // 3) 表示用に signed URL を返す（Private bucketの表示向け）
  // createSignedUrl(path, expiresIn) [3](https://ihogehoge.hatenablog.com/entry/2025/04/21/153229)[4](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
  const { data: signed, error: sErr } = await supabase.storage
    .from("dm-media")
    .createSignedUrl(objectPath, 60 * 60); // 1時間

  if (sErr) {
    // signed URL が失敗しても、パス自体は保存できているので返す
    return NextResponse.json({
      ok: true,
      messageId: inserted?.id ?? null,
      createdAt: inserted?.created_at ?? null,
      path: objectPath,
      signedUrl: null,
      warning: sErr.message,
    });
  }

  return NextResponse.json({
    ok: true,
    messageId: inserted?.id ?? null,
    createdAt: inserted?.created_at ?? null,
    path: objectPath,
    signedUrl: signed?.signedUrl ?? null,
  });
}