"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function triggerDispatchSoon(baseUrl: string) {
  // notifications / push_outbox がDB側で確定するのを少し待つ
  await new Promise((r) => setTimeout(r, 500));

  const resp = await fetch(`${baseUrl}/api/push/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-push-secret": process.env.PUSH_DISPATCH_SECRET ?? "",
    },
    cache: "no-store",
  });

  // 即時通知が失敗してもDM送信自体は成功扱いにしたいので、
  // ここではthrowせずログ用途の文字列だけ返す
  const text = await resp.text().catch(() => "");
  return {
    ok: resp.ok,
    status: resp.status,
    body: text,
  };
}

function resolveBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not logged in");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  // DM保存本体（DB側RPC）
  const { error } = await supabase.rpc("send_dm_message", {
    p_thread_id: threadId,
    p_body: body,
  });

  if (error) throw new Error(error.message);

  // ✅ 即時通知：動作実績のある dispatch を叩く
  try {
    const baseUrl = resolveBaseUrl();
    const result = await triggerDispatchSoon(baseUrl);
    console.log("sendDm triggerDispatchSoon:", result.status, result.body);
  } catch (e) {
    console.error("sendDm triggerDispatchSoon failed:", e);
  }

  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}
``