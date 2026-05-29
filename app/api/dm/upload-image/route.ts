import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ✅ 追加：send-nowの結果を返す
async function pushDmNow(origin: string, threadId: string) {
  try {
    const resp = await fetch(`${origin}/api/push/send-now`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-push-secret": process.env.PUSH_DISPATCH_SECRET ?? "",
      },
      body: JSON.stringify({ thread_id: threadId }),
      cache: "no-store",
    });

    const text = await resp.text();
    return {
      ok: resp.ok,
      status: resp.status,
      body: text,
    };
  } catch (e: any) {
    return {
      ok: false,
      status: 0,
      body: e?.message ?? String(e),
    };
  }
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
  const file = form.get("file");

  if (!threadId) {
    return NextResponse.json({ ok: false, error: "threadId is required" }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "file is required" }, { status: 400 });
  }

  const mime = (file.type || "application/octet-stream").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const messageType = isImage ? "image" : isVideo ? "video" : "file";

  const ext = safeExt(file.name);
  const objectPath = `${threadId}/${uuidLike()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("dm-media")
    .upload(objectPath, file, {
      contentType: mime,
      upsert: false,
    });

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

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

  // ✅ 即時Pushの結果を取得して返す
  const origin = new URL(req.url).origin;
  const sendNow = await pushDmNow(origin, threadId);

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

    // ✅ これが重要：send-now の結果をそのまま見る
    sendNow,
  });
}
