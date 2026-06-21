import { NextResponse } from "next/server";
import { triggerPushDispatchSoon } from "@/lib/push/triggerDispatchSoon";
import { createClient } from "@/lib/supabase/server";

type MessageType = "image" | "video" | "file";

type DmMessageInsert = {
  thread_id: string;
  sender_id: string;
  body: string;
  message_type: MessageType;
  image_path: string | null;
  image_mime: string | null;
  image_size: number | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  reply_to_message_id: string | null;
};

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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const threadId = String(form.get("threadId") ?? "");
  const caption = String(form.get("caption") ?? "").trim();
  const replyToMessageId = String(form.get("replyToMessageId") ?? "").trim();
  const file = form.get("file");

  if (!threadId) {
    return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  if (replyToMessageId) {
    const { data: replyTarget, error: replyErr } = await supabase
      .from("dm_messages")
      .select("id")
      .eq("id", replyToMessageId)
      .eq("thread_id", threadId)
      .is("unsent_at", null)
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
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const messageType: MessageType = isImage ? "image" : isVideo ? "video" : "file";
  const ext = safeExt(file.name);
  const objectPath = `${threadId}/${uuidLike()}.${ext}`;

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

  const insertPayload: DmMessageInsert = {
    thread_id: threadId,
    sender_id: user.id,
    body: caption || "",
    message_type: messageType,
    image_path: messageType === "image" ? objectPath : null,
    image_mime: messageType === "image" ? mime : null,
    image_size: messageType === "image" ? file.size : null,
    file_path: messageType === "image" ? null : objectPath,
    file_name: messageType === "image" ? null : file.name,
    file_mime: messageType === "image" ? null : mime,
    file_size: messageType === "image" ? null : file.size,
    reply_to_message_id: replyToMessageId || null,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("dm_messages")
    .insert(insertPayload)
    .select("id, created_at")
    .maybeSingle();

  if (insErr) {
    return NextResponse.json({ ok: false, error: insErr.message }, { status: 400 });
  }

  const origin = new URL(req.url).origin;
  let dispatchResult: { ok: boolean; status: number; body: string } | null = null;

  try {
    dispatchResult = await triggerPushDispatchSoon({ baseUrl: origin });
    console.log("upload-image triggerPushDispatchSoon:", dispatchResult.status, dispatchResult.body);
  } catch (e) {
    console.error("upload-image triggerPushDispatchSoon failed:", e);
  }

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
    dispatchResult,
  });
}
