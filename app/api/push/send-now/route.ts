import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type Body = {
  thread_id: string; // DMスレッドID
};

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

export async function POST(req: Request) {
  try {
    // --- 1) 認証（合言葉）
    const secret = mustEnv("PUSH_DISPATCH_SECRET");
    const got = req.headers.get("x-push-secret");
    if (got !== secret) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    const threadId = body?.thread_id?.trim();
    if (!threadId) {
      return NextResponse.json({ ok: false, error: "thread_id required" }, { status: 400 });
    }

    // --- 2) VAPID（subject + public + private）
    webpush.setVapidDetails(
      mustEnv("VAPID_SUBJECT"),
      mustEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
      mustEnv("VAPID_PRIVATE_KEY")
    ); // web-push の基本設定 [2](https://qiita.com/junko5/items/1d548583b949cf5c624c)[6](https://eastondev.com/blog/ja/posts/dev/20260421-supabase-auth-oauth-sso-rls/)

    // --- 3) Supabase admin（service_role）
    const supabase = createAdminClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    ); // service_role はRLSをバイパスできる特権キーなのでサーバー専用 [7](https://unwiredlearning.com/blog/extend-tailwind-css)[8](https://deepwiki.com/vercel/vercel/3.2-deploy-command)

    // --- 4) この thread_id のDM通知（最新いくつか）を探す
    const { data: notifs, error: nErr } = await supabase
      .from("notifications")
      .select("id")
      .eq("type", "dm")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (nErr) {
      return NextResponse.json({ ok: false, error: nErr.message }, { status: 500 });
    }
    const notifIds = (notifs ?? []).map((x: any) => x.id);
    if (notifIds.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, note: "no dm notifications" });
    }

    // --- 5) その通知IDに紐づく outbox（未送信）だけ取得
    const { data: outbox, error: oErr } = await supabase
      .from("push_outbox")
      .select("id, notification_id, recipient_id, payload, attempts")
      .in("notification_id", notifIds)
      .is("sent_at", null)
      .lt("attempts", 8)
      .order("created_at", { ascending: true })
      .limit(25);

    if (oErr) {
      return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });
    }

    const rows = (outbox ?? []) as OutboxRow[];
    if (rows.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0, note: "no pending outbox" });
    }

    // --- 6) 送信
    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      processed++;

      if (!row.recipient_id) {
        await supabase
          .from("push_outbox")
          .update({ attempts: row.attempts + 1, last_error: "recipient_id is null (skip)" })
          .eq("id", row.id);
        failed++;
        continue;
      }

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

      const payload = JSON.stringify(row.payload ?? { title: "DM", body: "新しいDMがあります", url: `/dm/${threadId}` });

      let anySent = false;
      let lastErr: string | null = null;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any,
            payload
          ); // Web PushはPushSubscription(endpoint+keys)へ送る [1](https://zenn.dev/moton/articles/a9190b25faf3de)[2](https://qiita.com/junko5/items/1d548583b949cf5c624c)
          anySent = true;
        } catch (e: any) {
          lastErr = e?.body || e?.message || String(e);
          const statusCode = e?.statusCode;

          // 404/410 は購読失効として無効化
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 500 });
  }
}
