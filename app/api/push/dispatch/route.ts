import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

type OutboxRow = {
  id: number;
  notification_id: string;
  recipient_id: string | null;
  payload: any;
  attempts: number;
};

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  // 1) dispatch endpoint 保護
  const secret = mustEnv("PUSH_DISPATCH_SECRET");
  const got = req.headers.get("x-push-secret");
  if (got !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // 2) VAPID 設定
  const vapidSubject = mustEnv("VAPID_SUBJECT");
  const vapidPublic = mustEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY");
  const vapidPrivate = mustEnv("VAPID_PRIVATE_KEY");
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  // 3) Supabase service role（サーバー専用）
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 4) outbox 未送信を取得
  const { data: outbox, error: oErr } = await supabase
    .from("push_outbox")
    .select("id, notification_id, recipient_id, payload, attempts")
    .is("sent_at", null)
    .lt("attempts", 8)
    .order("created_at", { ascending: true })
    .limit(25);

  if (oErr) {
    return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
  }

  const rows = (outbox ?? []) as OutboxRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0 });

  let processed = 0;
  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    processed++;

    // recipient_id が無い通知（全体通知）は今はスキップ（大量送信対策）
    if (!row.recipient_id) {
      await supabase
        .from("push_outbox")
        .update({ attempts: row.attempts + 1, last_error: "recipient_id is null (skip)" })
        .eq("id", row.id);
      failed++;
      continue;
    }

    // 5) 宛先ユーザーの購読（push_subscriptions）取得
    const { data: subs, error: sErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", row.recipient_id)
      .eq("disabled", false);

    if (sErr) {
      await supabase
        .from("push_outbox")
        .update({ attempts: row.attempts + 1, last_error: sErr.message })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const subscriptions = (subs ?? []) as SubRow[];
    if (subscriptions.length === 0) {
      await supabase
        .from("push_outbox")
        .update({ attempts: row.attempts + 1, last_error: "no subscriptions" })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const payload = JSON.stringify(
      row.payload ?? { title: "通知", body: "新しい通知があります", url: "/app" }
    );

    let anySent = false;
    let lastErr: string | null = null;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any,
          payload
        );
        anySent = true;
      } catch (e: any) {
        const statusCode = e?.statusCode;
        lastErr = e?.body || e?.message || String(e);

        // 404/410 = 購読が失効 → disabled=true
        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({ disabled: true, last_seen_at: new Date().toISOString() })
            .eq("user_id", row.recipient_id)
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    if (anySent) {
      await supabase
        .from("push_outbox")
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq("id", row.id);
      sent++;
    } else {
      await supabase
        .from("push_outbox")
        .update({ attempts: row.attempts + 1, last_error: lastErr ?? "send failed" })
        .eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed, sent, failed });
}
