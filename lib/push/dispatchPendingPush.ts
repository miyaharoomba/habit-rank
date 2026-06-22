import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import webpush from "web-push";

type OutboxRow = {
  id: number;
  notification_id: string;
  recipient_id: string | null;
  payload: unknown;
  attempts: number;
};

type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  thread_id: string | null;
  session_id: number | string | null;
  message_preview: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type PushPayload = {
  title: string;
  body: string;
  url: string;
  [key: string]: unknown;
};

type SubRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushDispatchSummary = {
  ok: boolean;
  version: string;
  processed: number;
  sent: number;
  failed: number;
  error?: string;
};

export const PUSH_DISPATCH_VERSION = "dispatch_v2026_06_19_direct";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
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

function textOr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function payloadObject(value: unknown): PushPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      title: "通知",
      body: "新しい通知があります",
      url: "/app",
    };
  }

  const maybe = value as Record<string, unknown>;
  return {
    ...maybe,
    title: textOr(maybe.title, "通知"),
    body: textOr(maybe.body, "新しい通知があります"),
    url: textOr(maybe.url, "/app"),
  };
}

async function buildPayloadMap(
  supabase: SupabaseClient,
  rows: OutboxRow[]
) {
  const map = new Map<number, PushPayload>();
  const notificationIds = Array.from(new Set(rows.map((row) => row.notification_id)));

  if (notificationIds.length === 0) {
    rows.forEach((row) => map.set(row.id, payloadObject(row.payload)));
    return map;
  }

  const { data: notifications, error: nErr } = await supabase
    .from("notifications")
    .select("id, type, actor_id, thread_id, session_id, message_preview")
    .in("id", notificationIds);

  if (nErr) {
    rows.forEach((row) => map.set(row.id, payloadObject(row.payload)));
    return map;
  }

  const notificationMap = new Map(
    ((notifications ?? []) as NotificationRow[]).map((n) => [n.id, n])
  );
  const actorIds = Array.from(
    new Set(
      ((notifications ?? []) as NotificationRow[])
        .map((n) => n.actor_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const actorMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);

    ((actors ?? []) as ProfileRow[]).forEach((actor) => {
      actorMap.set(actor.id, textOr(actor.display_name, "NoName"));
    });
  }

  for (const row of rows) {
    const base = payloadObject(row.payload);
    const notification = notificationMap.get(row.notification_id);

    if (!notification) {
      map.set(row.id, base);
      continue;
    }

    const actorName = notification.actor_id
      ? actorMap.get(notification.actor_id) ?? "NoName"
      : "誰か";
    const preview = (notification.message_preview ?? "").trim();

    if (notification.type === "dm" && notification.thread_id) {
      map.set(row.id, {
        ...base,
        title: `${actorName}からDM`,
        body: preview || "新しいDMがあります",
        url: `/dm/${notification.thread_id}`,
      });
      continue;
    }

    if (notification.type === "result_comment" && notification.session_id !== null) {
      map.set(row.id, {
        ...base,
        title: `${actorName} がリザルトにコメント`,
        body: preview || "コメントが届きました",
        url: `/results/${notification.session_id}`,
      });
      continue;
    }

    if (notification.type === "streak_end" && notification.session_id !== null) {
      map.set(row.id, {
        ...base,
        title: `${actorName}が継続を終了`,
        body: `理由: ${preview || "finished"}`,
        url: `/results/${notification.session_id}`,
      });
      continue;
    }

    map.set(row.id, base);
  }

  return map;
}

export async function dispatchPendingPush({
  limit = 25,
}: {
  limit?: number;
} = {}): Promise<PushDispatchSummary> {
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

  const batchLimit = Math.max(1, Math.min(limit, 100));

  const { data: outbox, error: oErr } = await supabase
    .from("push_outbox")
    .select("id, notification_id, recipient_id, payload, attempts")
    .is("sent_at", null)
    .lt("attempts", 8)
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (oErr) {
    return {
      ok: false,
      version: PUSH_DISPATCH_VERSION,
      processed: 0,
      sent: 0,
      failed: 0,
      error: oErr.message,
    };
  }

  const rows = (outbox ?? []) as OutboxRow[];
  if (rows.length === 0) {
    return {
      ok: true,
      version: PUSH_DISPATCH_VERSION,
      processed: 0,
      sent: 0,
      failed: 0,
    };
  }

  const payloadMap = await buildPayloadMap(supabase, rows);

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

    const payload = JSON.stringify(payloadMap.get(row.id) ?? payloadObject(row.payload));

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

  return {
    ok: true,
    version: PUSH_DISPATCH_VERSION,
    processed,
    sent,
    failed,
  };
}
