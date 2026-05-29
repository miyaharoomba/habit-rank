import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function triggerDispatchSoon(origin: string) {
  // notifications / push_outbox がDB側で確定するのを少し待つ
  await new Promise((r) => setTimeout(r, 500));

  const resp = await fetch(`${origin}/api/push/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-push-secret": process.env.PUSH_DISPATCH_SECRET ?? "",
    },
    cache: "no-store",
  });

  const text = await resp.text().catch(() => "");
  return {
    ok: resp.ok,
    status: resp.status,
    body: text,
  };
}

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

  // 保存パス
  const ext = safeExt(file.name);
  const objectPath = `${threadId}/${uuidLike()}.${ext}`;

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

  // 2) dm_messages に保存
  const insertPayload: any = {
    thread_id: threadId,
    sender_id: user.id,
    body: caption || "",
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

  // ✅ 即時通知：動作実績のある dispatch を叩く
  const origin = new URL(req.url).origin;
  let dispatchResult: { ok: boolean; status: number; body: string } | null = null;
  try {
    dispatchResult = await triggerDispatchSoon(origin);
    console.log("upload-image triggerDispatchSoon:", dispatchResult.status, dispatchResult.body);
  } catch (e) {
    console.error("upload-image triggerDispatchSoon failed:", e);
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

    // 確認用：あとで不要になったら消してOK
    dispatchResult,
  });
}
``