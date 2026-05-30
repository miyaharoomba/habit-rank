import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/notifications?limit=20
 * - notifications を新しい順で返す
 * - notification_reads を見て未読数を返す
 * - 各通知に url を付けて返す
 *
 * POST /api/notifications
 * body: { ids: string[] }
 * - 指定IDを既読にする（notification_reads に挿入）
 */
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
  const limit = Math.min(Number(requestUrl.searchParams.get("limit") ?? 20), 50);

  const { data: notifs, error: nErr } = await supabase
    .from("notifications")
    .select(
      "id, type, actor_id, recipient_id, thread_id, session_id, announcement_id, support_thread_id, message_preview, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (nErr) {
    return NextResponse.json({ error: nErr.message }, { status: 500 });
  }

  const notifications = notifs ?? [];
  const ids = notifications.map((n: any) => n.id);

  const { data: reads, error: rErr } = await supabase
    .from("notification_reads")
    .select("notification_id")
    .eq("user_id", user.id)
    .in(
      "notification_id",
      ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]
    );

  if (rErr) {
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  const readSet = new Set((reads ?? []).map((r: any) => r.notification_id));

  const actorIds = Array.from(
    new Set(
      notifications
        .map((n: any) => n.actor_id)
        .filter(Boolean)
    )
  ) as string[];

  const actorMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: actors } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", actorIds);

    (actors ?? []).forEach((a: any) => {
      actorMap.set(a.id, (a.display_name ?? "").trim() || "NoName");
    });
  }

  const items = notifications.map((n: any) => {
    const notificationUrl =
      n.type === "streak_end" && n.session_id
        ? `/results/${n.session_id}`
        : n.type === "dm" && n.thread_id
        ? `/dm/${n.thread_id}`
        : n.type === "admin_broadcast" && n.announcement_id
        ? `/announcements/${n.announcement_id}`
        : n.type === "support_reply" && n.support_thread_id
        ? `/support/${n.support_thread_id}`
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

  const unreadCount = items.reduce(
    (acc: number, it: any) => acc + (it.read ? 0 : 1),
    0
  );

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

  const body = await request.json().catch(() => null);
  const ids = (body?.ids ?? []) as string[];

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