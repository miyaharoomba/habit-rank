import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Body = {
  thread_id: string;
};

type OutboxRow = {
  id: number;
  notification_id: string;
  recipient_id: string | null;
  payload: unknown;
  attempts: number;
};

type NotificationIdRow = {
  id: string;
};

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(req: Request) {
  try {
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

    webpush.setVapidDetails(
      mustEnv("VAPID_SUBJECT"),
      mustEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
      mustEnv("VAPID_PRIVATE_KEY")
    );

    const supabase = createAdminClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // 1) このthreadのDM通知を探す
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

    const notifIds = ((notifs ?? []) as NotificationIdRow[]).map((x) => x.id);

    // ✅ ここが重要：
    // outboxがトリガーで作られるのを少し待つ（最大2秒）
    let rows: OutboxRow[] = [];
    for (let i = 0; i < 10; i++) {
      if (notifIds.length > 0) {
        const { data: outbox } = await supabase
          .from("push_outbox")
          .select("id, notification_id, recipient_id, payload, attempts")
          .in("notification_id", notifIds)
          .is("sent_at", null)
          .lt("attempts", 8)
          .order("created_at", { ascending: true })
          .limit(25);

        rows = (outbox ?? []) as OutboxRow[];
        if (rows.length > 0) break;
      }

      await sleep(200);
    }

    if (rows.length === 0) {
      return NextResponse.json({
        ok: true,
        processed: 0,
        sent: 0,
        failed: 0,
        note: "no pending outbox yet",
      });
    }

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

      const { data: disabledDm } = await supabase
        .from("notification_preferences")
        .select("enabled")
        .eq("user_id", row.recipient_id)
        .eq("notification_type", "dm")
        .eq("enabled", false)
        .maybeSingle();

      if (disabledDm) {
        await supabase
          .from("push_outbox")
          .update({
            sent_at: new Date().toISOString(),
            last_error: "notification disabled by user",
          })
          .eq("id", row.id);
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

      const payload = JSON.stringify(
        row.payload ?? { title: "DM", body: "新しいDMがあります", url: `/dm/${threadId}` }
      );

      let anySent = false;
      let lastErr: string | null = null;

      for (const sub of subscriptions) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            } as Parameters<typeof webpush.sendNotification>[0],
            payload
          );
          anySent = true;
        } catch (e: unknown) {
          const maybe =
            e && typeof e === "object"
              ? (e as { body?: unknown; message?: unknown; statusCode?: unknown })
              : null;
          lastErr =
            (typeof maybe?.body === "string" && maybe.body) ||
            (typeof maybe?.message === "string" && maybe.message) ||
            String(e);
          const statusCode =
            typeof maybe?.statusCode === "number" ? maybe.statusCode : null;

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
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
