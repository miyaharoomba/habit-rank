"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAndAwardBadges } from "@/app/services/badgeService";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

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

async function suppressStreakEndNotification(sessionId: string, userId: string) {
  let admin: ReturnType<typeof getAdminClient>;

  try {
    admin = getAdminClient();
  } catch (e) {
    console.error("streak_end cleanup admin client failed:", e);
    return;
  }

  const { data: notifications, error: fetchErr } = await admin
    .from("notifications")
    .select("id")
    .eq("type", "streak_end")
    .eq("session_id", sessionId)
    .eq("actor_id", userId);

  if (fetchErr) {
    console.error("streak_end notification lookup failed:", fetchErr);
    return;
  }

  const ids = ((notifications ?? []) as Array<{ id: string }>).map((n) => n.id);
  if (ids.length === 0) return;

  const { error: outboxErr } = await admin
    .from("push_outbox")
    .delete()
    .in("notification_id", ids);

  if (outboxErr) {
    console.error("streak_end push_outbox cleanup failed:", outboxErr);
  }

  const { error: notifErr } = await admin
    .from("notifications")
    .delete()
    .in("id", ids);

  if (notifErr) {
    console.error("streak_end notification cleanup failed:", notifErr);
  }
}

/**
 * 継続開始
 */
export async function startSession() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログイン情報が取れません");
  }

  const { error } = await supabase.from("streak_sessions").insert({
    user_id: user.id,
  });

  if (error) {
    if (error.code === "23505") {
      revalidatePath("/app");
      return;
    }
    throw new Error(error.message);
  }

  revalidatePath("/app");
}

/**
 * 継続終了
 * - mode=restart: 終了して次を開始
 * - mode=stop: 完全に終了
 *
 * 管理者が profiles.suppress_global_streak_end_notification = true のときは
 * デバッグ扱いとして通知も称号判定も走らせない
 */
export async function finishSession(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログイン情報が取れません");
  }

  const allReasons = formData
    .getAll("end_reason")
    .map((v) => String(v ?? "").trim());

  const lastNonEmpty =
    [...allReasons].reverse().find((v) => v.length > 0) ?? "";
  const reason = lastNonEmpty.slice(0, 200) || "finished";

  const mode = String(formData.get("mode") ?? "restart").trim();
  const autoRestart = mode !== "stop";

  // 管理者デバッグ設定確認
  let suppressAllNotificationsForDebug = false;

  try {
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");

    if (!adminErr && isAdmin) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("suppress_global_streak_end_notification")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileErr && profile?.suppress_global_streak_end_notification) {
        suppressAllNotificationsForDebug = true;
      }
    }
  } catch (e) {
    console.error("admin suppress flag check failed:", e);
  }

  const { data, error } = await supabase.rpc("finish_and_maybe_restart_session", {
    end_reason_input: reason,
    auto_restart: autoRestart,
  });

  if (error) {
    console.error("finish_and_maybe_restart_session error:", error);
    throw new Error(error.message);
  }

  const finishedSessionId = data?.[0]?.finished_session_id as string | undefined;

  if (!finishedSessionId) {
    console.error("finishSession RPC data:", data);
    throw new Error("finished session id not found");
  }

  if (suppressAllNotificationsForDebug) {
    await suppressStreakEndNotification(finishedSessionId, user.id);
  }

  // 称号判定（管理者デバッグ時はスキップ）
  if (!suppressAllNotificationsForDebug) {
    try {
      await checkAndAwardBadges(user.id);
    } catch (e) {
      console.error("checkAndAwardBadges failed:", e);
    }

    await triggerPushDispatchBestEffort("finishSession");
  }

  revalidatePath("/app");
  revalidatePath("/history");
  revalidatePath("/badges");
  revalidatePath(`/users/${user.id}/badges`);
  revalidatePath(`/results/${finishedSessionId}`);

  redirect(`/results/${finishedSessionId}`);
}

/**
 * 表示名保存
 */
export async function setDisplayName(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("ログイン情報が取れません");
  }

  const raw = String(formData.get("displayName") ?? "");
  const name = raw.trim();

  if (!name) throw new Error("名前が空です");
  if (name.length > 20) throw new Error("名前が長すぎます（20文字以内）");

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: name }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  revalidatePath("/app");
}
