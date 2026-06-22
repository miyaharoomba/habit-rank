import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type CommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
};

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

function parseSessionId(raw: string) {
  const id = Number(String(raw ?? "").trim());
  return Number.isFinite(id) && id > 0 ? id : null;
}

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function toProfileHref(userId: string, currentUserId: string) {
  return userId === currentUserId ? "/profile" : `/users/${encodeURIComponent(userId)}`;
}

async function loadCommentItems({
  supabase,
  sessionId,
  currentUserId,
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  sessionId: number;
  currentUserId: string;
}) {
  const { data: rows, error } = await supabase
    .from("result_comments")
    .select("id, user_id, body, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const comments = ((rows ?? []) as CommentRow[]).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const userIds = Array.from(new Set(comments.map((comment) => comment.user_id)));
  const profileMap = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profiles, error: profileErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path")
      .in("id", userIds);

    if (profileErr) throw new Error(profileErr.message);

    ((profiles ?? []) as ProfileRow[]).forEach((profile) => {
      profileMap.set(profile.id, profile);
    });
  }

  return comments.map((comment) => {
    const profile = profileMap.get(comment.user_id);
    const userName = (profile?.display_name ?? "").trim() || "NoName";

    return {
      id: comment.id,
      user_id: comment.user_id,
      user_name: userName,
      user_avatar_url: avatarUrl(profile?.avatar_path ?? null),
      user_profile_href: toProfileHref(comment.user_id, currentUserId),
      body: comment.body,
      created_at: comment.created_at,
    };
  });
}

async function createResultCommentNotification({
  sessionId,
  ownerId,
  actorId,
  body,
}: {
  sessionId: number;
  ownerId: string;
  actorId: string;
  body: string;
}) {
  if (ownerId === actorId) return;

  try {
    const admin = getAdminClient();
    const { error } = await admin.from("notifications").insert({
      recipient_id: ownerId,
      actor_id: actorId,
      type: "result_comment",
      thread_id: null,
      session_id: sessionId,
      announcement_id: null,
      support_thread_id: null,
      message_preview: body.slice(0, 200),
    });

    if (error) {
      console.error("result comment notification insert failed:", error);
      return;
    }

    await triggerPushDispatchBestEffort("resultComment");
  } catch (error) {
    console.error("result comment notification failed:", error);
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = parseSessionId(rawSessionId);

  if (!sessionId) {
    return NextResponse.json({ error: "invalid session id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const items = await loadCommentItems({
      supabase,
      sessionId,
      currentUserId: user.id,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId: rawSessionId } = await params;
  const sessionId = parseSessionId(rawSessionId);

  if (!sessionId) {
    return NextResponse.json({ error: "invalid session id" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bodyJson = await request.json().catch(() => null);
  const body = String(bodyJson?.body ?? "").trim().slice(0, 280);

  if (!body) {
    return NextResponse.json({ error: "コメントを入力してください。" }, { status: 400 });
  }

  const { data: sess, error: sessErr } = await supabase
    .from("streak_sessions")
    .select("id, user_id, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  if (!sess) {
    return NextResponse.json({ error: "リザルトが見つかりません。" }, { status: 404 });
  }

  if (!sess.ended_at) {
    return NextResponse.json(
      { error: "終了済みのリザルトにだけコメントできます。" },
      { status: 400 }
    );
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("result_comments")
    .insert({
      session_id: sessionId,
      user_id: user.id,
      body,
    })
    .select("id, user_id, body, created_at")
    .single();

  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: insertErr?.message ?? "insert failed" },
      { status: 500 }
    );
  }

  await createResultCommentNotification({
    sessionId,
    ownerId: String(sess.user_id),
    actorId: user.id,
    body,
  });

  revalidatePath(`/results/${sessionId}`);

  const items = await loadCommentItems({
    supabase,
    sessionId,
    currentUserId: user.id,
  });

  return NextResponse.json({
    ok: true,
    item: items.find((item) => item.id === (inserted as CommentRow).id) ?? null,
    items,
  });
}
