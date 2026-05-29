import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type SendDmPushNowArgs = {
  threadId: string;
  senderId: string;
  body: string;
};

type PushSubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function sendDmPushNow({
  threadId,
  senderId,
  body,
}: SendDmPushNowArgs) {
  // VAPID
  webpush.setVapidDetails(
    mustEnv("VAPID_SUBJECT"),
    mustEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
    mustEnv("VAPID_PRIVATE_KEY")
  );

  // service_role でDBを読む
  const supabase = createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );

  // 1) スレッドから相手ユーザーIDを特定
  // ※ テーブル名が違うならここだけ直す
  const { data: thread, error: threadErr } = await supabase
    .from("dm_threads")
    .select("id, user_low, user_high")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) throw new Error(threadErr.message);
  if (!thread) throw new Error("DM thread not found");

  const recipientId =
    thread.user_low === senderId ? thread.user_high : thread.user_low;

  // 2) 送信者表示名（任意）
  const { data: senderProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", senderId)
    .maybeSingle();

  const senderName =
    senderProfile?.display_name?.trim() || "NoName";

  // 3) 宛先ユーザーのPush購読
  const { data: subs, error: subsErr } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", recipientId)
    .eq("disabled", false);

  if (subsErr) throw new Error(subsErr.message);

  const subscriptions = (subs ?? []) as PushSubRow[];
  if (subscriptions.length === 0) {
    return {
      ok: true,
      sent: 0,
      skipped: true,
      reason: "no subscriptions",
      recipientId,
    };
  }

  // 4) Push payload
  const payload = JSON.stringify({
    title: `${senderName} からDM`,
    body: body || "新しいDMがあります",
    url: `/dm/${threadId}`,
  });

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        } as any,
        payload
      );
      sent++;
    } catch (e: any) {
      failed++;
      lastError = e?.body || e?.message || String(e);

      const statusCode = e?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // 失効購読を無効化
        await supabase
          .from("push_subscriptions")
          .update({
            disabled: true,
            last_seen_at: new Date().toISOString(),
          })
          .eq("user_id", recipientId)
          .eq("endpoint", sub.endpoint);
      }
    }
  }

  return {
    ok: true,
    sent,
    failed,
    recipientId,
    lastError,
  };
}
