import "server-only";

import {
  createClient as createAdminClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  isReactionTargetType,
  summarizeReactionMap,
  type ReactionRow,
  type ReactionSummary,
  type ReactionTargetType,
} from "@/app/lib/reactions";

type AccessResult =
  | { ok: true }
  | { ok: false; status: number; error: string };

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getReactionAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

export async function loadReactionMap({
  admin,
  targetType,
  targetIds,
  myUserId,
}: {
  admin: SupabaseClient;
  targetType: ReactionTargetType;
  targetIds: Array<string | number>;
  myUserId: string;
}): Promise<Map<string, ReactionSummary[]>> {
  const ids = Array.from(new Set(targetIds.map((id) => String(id)).filter(Boolean)));
  const empty = summarizeReactionMap({ rows: [], targetIds: ids, myUserId });
  if (ids.length === 0) return empty;

  const { data, error } = await admin
    .from("reactions")
    .select("target_id, emoji, user_id")
    .eq("target_type", targetType)
    .in("target_id", ids);

  if (error) {
    console.error("reaction fetch failed:", error.message);
    return empty;
  }

  return summarizeReactionMap({
    rows: (data ?? []) as ReactionRow[],
    targetIds: ids,
    myUserId,
  });
}

export async function validateReactionTargetAccess({
  admin,
  targetType,
  targetId,
  userId,
}: {
  admin: SupabaseClient;
  targetType: string;
  targetId: string;
  userId: string;
}): Promise<AccessResult> {
  if (!isReactionTargetType(targetType)) {
    return { ok: false, status: 400, error: "invalid target type" };
  }

  if (!targetId.trim()) {
    return { ok: false, status: 400, error: "target id is required" };
  }

  if (targetType === "dm_message") {
    const { data: message, error: messageErr } = await admin
      .from("dm_messages")
      .select("id, thread_id, unsent_at")
      .eq("id", targetId)
      .maybeSingle();

    if (messageErr) return { ok: false, status: 500, error: messageErr.message };
    if (!message || message.unsent_at) {
      return { ok: false, status: 404, error: "message not found" };
    }

    const { data: thread, error: threadErr } = await admin
      .from("dm_threads")
      .select("id, user_low, user_high")
      .eq("id", String(message.thread_id))
      .maybeSingle();

    if (threadErr) return { ok: false, status: 500, error: threadErr.message };
    if (!thread || (thread.user_low !== userId && thread.user_high !== userId)) {
      return { ok: false, status: 403, error: "forbidden" };
    }

    return { ok: true };
  }

  if (targetType === "global_chat_message") {
    const { data: message, error } = await admin
      .from("global_chat_messages")
      .select("id")
      .eq("id", targetId)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: error.message };
    if (!message) return { ok: false, status: 404, error: "message not found" };
    return { ok: true };
  }

  if (targetType === "streak_session") {
    const { data: session, error } = await admin
      .from("streak_sessions")
      .select("id, ended_at")
      .eq("id", targetId)
      .maybeSingle();

    if (error) return { ok: false, status: 500, error: error.message };
    if (!session) return { ok: false, status: 404, error: "result not found" };
    if (!session.ended_at) {
      return { ok: false, status: 400, error: "result is not finished" };
    }
    return { ok: true };
  }

  return { ok: false, status: 400, error: "invalid target type" };
}
