import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "/api/push/dispatch", methods: ["GET", "POST"] });
}

export async function POST(req: Request) {
  const secret = mustEnv("PUSH_DISPATCH_SECRET");
  const got = req.headers.get("x-push-secret");
  if (got !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
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

  const { data: outbox, error: oErr } = await supabase
    .from("push_outbox")
    .select("id, recipient_id, payload, attempts")
    .is("sent_at", null)
    .lt("attempts", 8)
    .order("created_at", { ascending: true })
    .limit(25);

  if (oErr) return NextResponse.json({ ok: false, error: oErr.message }, { status: 500 });

  if (!outbox || outbox.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, sent: 0, failed: 0 });
  }

  let processed = 0, sent = 0, failed = 0;

  for (const row of outbox as any[]) {
    processed++;

    if (!row.recipient_id) {
      await supabase.from("push_outbox").update({
        attempts: row.attempts + 1,
        last_error: "recipient_id is null (skip)"
      }).eq("id", row.id);
      failed++;
      continue;
    }

    const { data: subs, error: sErr } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", row.recipient_id)
      .eq("disabled", false);

    if (sErr) {
      await supabase.from("push_outbox").update({
        attempts: row.attempts + 1,
        last_error: sErr.message
      }).eq("id", row.id);
      failed++;
      continue;
    }

    if (!subs || subs.length === 0) {
      await supabase.from("push_outbox").update({
        attempts: row.attempts + 1,
        last_error: "no subscriptions"
      }).eq("id", row.id);
      failed++;
      continue;
    }

    const payload = JSON.stringify(row.payload ?? { title: "通知", body: "新しい通知があります", url: "/app" });

    let anySent = false;
    let lastErr: string | null = null;

    for (const sub of subs as any[]) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } } as any,
          payload
        );
        anySent = true;
      } catch (e: any) {
        lastErr = e?.body || e?.message || String(e);
      }
    }

    if (anySent) {
      await supabase.from("push_outbox").update({
        sent_at: new Date().toISOString(),
        last_error: null
      }).eq("id", row.id);
      sent++;
    } else {
      await supabase.from("push_outbox").update({
        attempts: row.attempts + 1,
        last_error: lastErr ?? "send failed"
      }).eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed, sent, failed });
}
