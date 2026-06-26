import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type MessageType = "image" | "video" | "file";

type GlobalChatMessageInsert = {
  user_id: string;
  body: string;
  message_type: MessageType;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  image_url: string | null;
  file_url: string | null;
  reply_to_message_id: string | null;
};

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function createGlobalChatReplyNotification({
  recipientId,
  actorId,
  preview,
}: {
  recipientId: string | null;
  actorId: string;
  preview: string;
}) {
  if (!recipientId || recipientId === actorId) return;

  try {
    const admin = getAdminClient();
    const { error } = await admin.from("notifications").insert({
      recipient_id: recipientId,
      actor_id: actorId,
      type: "global_chat",
      thread_id: null,
      session_id: null,
      announcement_id: null,
      support_thread_id: null,
      message_preview: preview.slice(0, 200),
    });

    if (error) {
      console.error("global chat upload notification insert failed:", error.message);
      return;
    }

    await triggerPushDispatchBestEffort("globalChatUploadReply");
  } catch (error) {
    console.error("global chat upload notification failed:", error);
  }
}

// Nodeでも動く簡易UUID
function uuidLike() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
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
  const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  if (caption.length > 200) {
    return NextResponse.json({ ok: false, error: "caption is too long" }, { status: 400 });
  }

  let replyOwnerId: string | null = null;

  if (replyToMessageId) {
    const { data: replyTarget, error: replyErr } = await supabase
      .from("global_chat_messages")
      .select("id, user_id")
      .eq("id", replyToMessageId)
      .maybeSingle();

    if (replyErr) {
      return NextResponse.json({ ok: false, error: replyErr.message }, { status: 400 });
    }

    if (!replyTarget) {
      return NextResponse.json(
        { ok: false, error: "reply target not found" },
        { status: 400 }
      );
    }

    replyOwnerId = String(replyTarget.user_id ?? "");
  }

  // 種別判定（image / video / file）
  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const messageType: MessageType = isImage ? "image" : isVideo ? "video" : "file";

  // 既存 DM と同じ bucket を流用
  const ext = safeExt(file.name);
  const objectPath = `global/${uuidLike()}.${ext}`;

  // 1) Storage にアップロード
  const { error: upErr } = await supabase.storage
    .from("dm-media")
    .upload(objectPath, file, {
      contentType: mime,
      cacheControl: "604800",
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // 2) global_chat_messages に保存
  const insertPayload: GlobalChatMessageInsert = {
    user_id: user.id,
    body: caption || "",
    message_type: messageType,
    file_name: null,
    file_mime: null,
    file_size: null,
    image_url: null,
    file_url: null,
    reply_to_message_id: replyToMessageId || null,
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
  const preview =
    caption ||
    (messageType === "image"
      ? "画像"
      : messageType === "video"
      ? "動画"
      : file.name || "ファイル");

  await createGlobalChatReplyNotification({
    recipientId: replyOwnerId,
    actorId: user.id,
    preview,
  });

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
