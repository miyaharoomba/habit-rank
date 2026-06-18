import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type NotificationRow = {
  id: string;
  type: string;
  actor_id: string | null;
  recipient_id: string | null;
  thread_id: string | null;
  session_id: string | null;
  announcement_id: string | null;
  support_thread_id: string | null;
  message_preview: string | null;
  created_at: string;
};

type NotificationReadRow = {
  notification_id: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const rawLimit = Number(requestUrl.searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, 50))
    : 20;

  const fetchLimit = Math.max(limit * 5, 100);

  let notificationQuery = supabase
    .from("notifications")
    .select(
      "id, type, actor_id, recipient_id, thread_id, session_id, announcement_id, support_thread_id, message_preview, created_at"
    )
    .or(`recipient_id.eq.${user.id},recipient_id.is.null`)
    .order("created_at", { ascending: false });

  if (user.created_at) {
    notificationQuery = notificationQuery.gte("created_at", user.created_at);
  }

  const { data: notifs, error: nErr } = await notificationQuery.limit(fetchLimit);

  if (nErr) {
    return NextResponse.json({ error: nErr.message }, { status: 500 });
  }

  const notifications = (notifs ?? []) as NotificationRow[];

  // streak_end の重複整理
  const deduped: NotificationRow[] = [];
  const streakMap = new Map<string, NotificationRow>();

  for (const n of notifications) {
    if (n.type !== "streak_end" || !n.session_id) {
      deduped.push(n);
      continue;
    }

    const key = `${n.actor_id ?? "no-actor"}:${n.session_id}`;
    const prev = streakMap.get(key);

    if (!prev) {
      streakMap.set(key, n);
      continue;
    }

    const prevIsGlobal = prev.recipient_id === null;
    const nextIsGlobal = n.recipient_id === null;

    if (!prevIsGlobal && nextIsGlobal) {
      streakMap.set(key, n);
      continue;
    }

    if (
      prevIsGlobal === nextIsGlobal &&
      new Date(n.created_at).getTime() > new Date(prev.created_at).getTime()
    ) {
      streakMap.set(key, n);
    }
  }

  const merged = [...deduped, ...Array.from(streakMap.values())].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const selected = merged.slice(0, limit);
  const ids = selected.map((n) => n.id);

  const readIdsTarget =
    ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];

  const { data: reads, error: rErr } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("user_id", user.id)
    .in("notification_id", readIdsTarget);

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const readSet = new Set(
    ((reads ?? []) as NotificationReadRow[]).map((r) => r.notification_id)
  );

  const actorIds = Array.from(
    new Set(selected.map((n) => n.actor_id).filter(Boolean))
  ) as string[];

  const actorMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actors, error: aErr } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);

    if (aErr) {
      return NextResponse.json({ error: aErr.message }, { status: 500 });
    }

    ((actors ?? []) as ProfileRow[]).forEach((a) => {
      actorMap.set(a.id, (a.display_name ?? "").trim() || "NoName");
    });
  }

  const items = selected.map((n) => {
    const notificationUrl =
      n.type === "streak_end" && n.session_id
        ? `/results/${n.session_id}`
        : n.type === "dm" && n.thread_id
        ? `/dm/${n.thread_id}`
        : n.type === "admin_broadcast" && n.announcement_id
        ? `/announcements/${n.announcement_id}`
        : n.type === "support_reply" && n.support_thread_id
        ? `/support/${n.support_thread_id}`
        : n.type === "trophy_unlock"
        ? "/badges"
        : "/app";

    return {
      id: n.id,
      type: n.type,
      created_at: n.created_at,
      message_preview: n.message_preview ?? "",
      thread_id: n.thread_id,
      session_id: n.session_id,
      announcement_id: n.announcement_id ?? null,
      support_thread_id: n.support_thread_id ?? null,
      actor_id: n.actor_id,
      actor_name: n.actor_id ? actorMap.get(n.actor_id) ?? "NoName" : null,
      read: readSet.has(n.id),
      url: notificationUrl,
    };
  });

  const unreadCount = items.reduce((acc, it) => acc + (it.read ? 0 : 1), 0);

  return NextResponse.json({ unreadCount, items });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    ids?: unknown;
  } | null;
  const rawIds = Array.isArray(body?.ids) ? body.ids : [];
  const ids = rawIds.filter(
    (id): id is string => typeof id === "string" && id.length > 0
  );

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const payload = ids.map((notification_id) => ({
    notification_id,
    user_id: user.id,
  }));

  const { error } = await supabase
    .from("notification_reads")
    .upsert(payload, { onConflict: "notification_id,user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: ids.length });
}
