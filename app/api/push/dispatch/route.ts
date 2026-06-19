import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import webpush from "web-push";

type OutboxRow = {
  id: number;
  recipient_id: string | null;
  payload: unknown;
  attempts: number;
};

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

const DISPATCH_VERSION = "dispatch_v2026_06_19_auth";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function bearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isDispatchAuthorized(request: Request) {
  const pushSecret = process.env.PUSH_DISPATCH_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-push-secret");
  const token = bearerToken(request);

  return Boolean(
    (pushSecret && headerSecret === pushSecret) ||
      (cronSecret && token === cronSecret)
  );
}

function forbidden() {
  return NextResponse.json(
    { ok: false, version: DISPATCH_VERSION, error: "forbidden" },
    { status: 403 }
  );
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

function pushErrorDetails(e: unknown) {
  if (!e || typeof e !== "object") {
    return { message: errorMessage(e), statusCode: null };
  }

  const maybe = e as { body?: unknown; message?: unknown; statusCode?: unknown };
  const body = typeof maybe.body === "string" ? maybe.body : null;
  const message = typeof maybe.message === "string" ? maybe.message : null;
  const statusCode =
    typeof maybe.statusCode === "number" ? maybe.statusCode : null;

  return {
    message: body ?? message ?? errorMessage(e),
    statusCode,
  };
}

async function runDispatch() {
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

  if (oErr) {
    return NextResponse.json(
      { ok: false, version: DISPATCH_VERSION, error: oErr.message },
      { status: 500 }
    );
  }

  const rows = (outbox ?? []) as OutboxRow[];
  if (rows.length === 0) {
    return NextResponse.json({
      ok: true,
      version: DISPATCH_VERSION,
      processed: 0,
      sent: 0,
      failed: 0,
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
        .update({
          attempts: row.attempts + 1,
          last_error: "recipient_id is null (skip)",
        })
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
        .update({
          attempts: row.attempts + 1,
          last_error: sErr.message,
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const subscriptions = (subs ?? []) as SubRow[];
    if (subscriptions.length === 0) {
      await supabase
        .from("push_outbox")
        .update({
          attempts: row.attempts + 1,
          last_error: "no subscriptions",
        })
        .eq("id", row.id);
      failed++;
      continue;
    }

    const payload = JSON.stringify(
      row.payload ?? {
        title: "通知",
        body: "新しい通知があります",
        url: "/app",
      }
    );

    let anySent = false;
    let lastErr: string | null = null;

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          } as Parameters<typeof webpush.sendNotification>[0],
          payload
        );
        anySent = true;
      } catch (e: unknown) {
        const details = pushErrorDetails(e);
        lastErr = details.message;
        const statusCode = details.statusCode;

        if (statusCode === 404 || statusCode === 410) {
          await supabase
            .from("push_subscriptions")
            .update({
              disabled: true,
              last_seen_at: new Date().toISOString(),
            })
            .eq("user_id", row.recipient_id)
            .eq("endpoint", sub.endpoint);
        }
      }
    }

    if (anySent) {
      await supabase
        .from("push_outbox")
        .update({
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq("id", row.id);
      sent++;
    } else {
      await supabase
        .from("push_outbox")
        .update({
          attempts: row.attempts + 1,
          last_error: lastErr ?? "send failed",
        })
        .eq("id", row.id);
      failed++;
    }
  }

  return NextResponse.json({
    ok: true,
    version: DISPATCH_VERSION,
    processed,
    sent,
    failed,
  });
}

/**
 * GET = Cron用
 * Authorization が無い / 間違い → 401
 * 正しい → dispatch 実行
 */
export async function GET(request: Request) {
  try {
    if (!isDispatchAuthorized(request)) {
      return forbidden();
    }

    return await runDispatch();
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, version: DISPATCH_VERSION, error: errorMessage(e) },
      { status: 500 }
    );
  }
}

/**
 * POST = 手動実行 / 内部実行用
 */
export async function POST(req: Request) {
  try {
    if (!isDispatchAuthorized(req)) {
      return forbidden();
    }

    return await runDispatch();
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, version: DISPATCH_VERSION, error: errorMessage(e) },
      { status: 500 }
    );
  }
}
