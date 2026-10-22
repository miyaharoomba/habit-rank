import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import webpush from "web-push";
import { randomUUID } from "node:crypto";
import { deliverPushDevices } from "./deliverPushDevices";

type OutboxRow = {
  id: number;
  notification_id: string;
  recipient_id: string | null;
  payload: unknown;
  attempts: number;
  delivered_to: string[];
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

export const PUSH_DISPATCH_VERSION = "dispatch_v2026_10_22_leases";

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

    if (notification.type === "global_chat") {
      map.set(row.id, {
        ...base,
        title: `${actorName} が掲示板で返信`,
        body: preview || "掲示板に返信が届きました",
        url: "/app",
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

export async function dispatchPendingPush({ limit = 25 }: { limit?: number } = {}): Promise<PushDispatchSummary> {
  webpush.setVapidDetails(mustEnv("VAPID_SUBJECT"), mustEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY"), mustEnv("VAPID_PRIVATE_KEY"));
  const supabase = createAdminClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const worker = randomUUID();
  const { data, error } = await supabase.rpc("claim_push_outbox", {
    p_worker: worker, p_limit: Math.max(1, Math.min(limit, 25)),
  });
  if (error) return { ok: false, version: PUSH_DISPATCH_VERSION, processed: 0, sent: 0, failed: 0, error: error.message };
  const rows = (data ?? []) as OutboxRow[];
  const payloadMap = await buildPayloadMap(supabase, rows);
  let sent = 0;
  let failed = 0;

  async function release(row: OutboxRow, values: Record<string, unknown>) {
    const { error } = await supabase.from("push_outbox").update({
      ...values, claimed_by: null, claimed_until: null,
    }).eq("id", row.id).eq("claimed_by", worker);
    if (error) throw new Error(error.message);
  }

  async function deliver(row: OutboxRow) {
    try {
      if (!row.recipient_id) {
        await release(row, { sent_at: new Date().toISOString(), last_error: "no recipient" });
        return;
      }
      const { data: notification, error: nErr } = await supabase.from("notifications")
        .select("type").eq("id", row.notification_id).maybeSingle();
      if (nErr) throw new Error(nErr.message);
      if (!notification) {
        await release(row, { sent_at: new Date().toISOString(), last_error: "notification removed" });
        return;
      }
      const { data: preference, error: pErr } = await supabase.from("notification_preferences")
        .select("enabled").eq("user_id", row.recipient_id).eq("notification_type", notification.type).maybeSingle();
      // A preference lookup failure must not send a notification the user disabled.
      if (pErr) throw new Error(pErr.message);
      if (preference?.enabled === false) {
        await release(row, { sent_at: new Date().toISOString(), last_error: "notification disabled by user" });
        return;
      }
      const { data: subs, error: sErr } = await supabase.from("push_subscriptions")
        .select("endpoint, p256dh, auth").eq("user_id", row.recipient_id).eq("disabled", false);
      if (sErr) throw new Error(sErr.message);
      const payload = JSON.stringify({
        ...(payloadMap.get(row.id) ?? payloadObject(row.payload)), notificationId: row.notification_id,
      });
      const {deliveredTo, lastError} = await deliverPushDevices({
        devices: (subs ?? []) as SubRow[], deliveredTo: row.delivered_to ?? [], payload,
        send: (sub, message) => webpush.sendNotification({
          endpoint: sub.endpoint, keys: {p256dh:sub.p256dh,auth:sub.auth},
        }, message, {timeout:5000}),
        disable: async (endpoint) => {
          const {error} = await supabase.from("push_subscriptions").update({disabled:true})
            .eq("user_id",row.recipient_id).eq("endpoint",endpoint);
          if(error) throw new Error(error.message);
        },
      });
      await release(row, {
        delivered_to: deliveredTo, last_error: lastError,
        next_attempt_at: lastError ? new Date(Date.now() + Math.min(3600000, 60000 * 2 ** (row.attempts - 1))).toISOString() : null,
        ...(lastError ? {} : { sent_at: new Date().toISOString() }),
      });
      if (lastError) failed++; else sent++;
    } catch (error) {
      failed++;
      await release(row, { last_error: errorMessage(error).slice(0, 1000),
        next_attempt_at: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** (row.attempts - 1))).toISOString() });
    }
  }

  // Bound concurrent batches and individual network waits to stay within the lease.
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(5, rows.length) }, async () => {
    while (cursor < rows.length) {
      const row = rows[cursor++];
      await deliver(row);
    }
  }));
  return { ok: failed === 0, version: PUSH_DISPATCH_VERSION, processed: rows.length, sent, failed };
}
