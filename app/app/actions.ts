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

async function refreshProfileLevel(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_profile_level", {
    p_user_id: userId,
  });

  if (error) {
    console.error("refresh_profile_level failed:", error);
  }
}

async function discardStaleResultPhoto(userId: string) {
  const admin = getAdminClient();
  const { data: session, error } = await admin
    .from("streak_sessions")
    .select("id, result_photo_path, result_photo_captured_at")
    .eq("user_id", userId)
    .is("ended_at", null)
    .maybeSingle();

  if (error) {
    console.error("streak result photo freshness check failed:", error.message);
    return;
  }
  if (!session?.result_photo_path || !session.result_photo_captured_at) return;

  const capturedAt = new Date(session.result_photo_captured_at).getTime();
  const isStale =
    !Number.isFinite(capturedAt) || Date.now() - capturedAt > 10 * 60 * 1000;
  if (!isStale) return;

  const { error: clearError } = await admin
    .from("streak_sessions")
    .update({ result_photo_path: null, result_photo_captured_at: null })
    .eq("id", session.id)
    .eq("user_id", userId)
    .is("ended_at", null);

  if (clearError) {
    console.error("stale streak result photo clear failed:", clearError.message);
    return;
  }

  const { error: removeError } = await admin.storage
    .from("dm-media")
    .remove([session.result_photo_path]);
  if (removeError) {
    console.error("stale streak result photo cleanup failed:", removeError.message);
  }
}

export async function startSession() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("login required");
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

export async function finishSession(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("login required");
  }

  const allReasons = formData
    .getAll("end_reason")
    .map((v) => String(v ?? "").trim());
  const lastNonEmpty =
    [...allReasons].reverse().find((v) => v.length > 0) ?? "";
  const reason = lastNonEmpty.slice(0, 200) || "finished";

  const mode = String(formData.get("mode") ?? "restart").trim();
  const autoRestart = mode !== "stop";
  let suppressAllNotificationsForDebug = false;

  await discardStaleResultPhoto(user.id);

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

  const finishedSessionId = data?.[0]?.finished_session_id as
    | string
    | undefined;

  if (!finishedSessionId) {
    console.error("finishSession RPC data:", data);
    throw new Error("finished session id not found");
  }

  if (suppressAllNotificationsForDebug) {
    await suppressStreakEndNotification(finishedSessionId, user.id);
  }

  await refreshProfileLevel(user.id);

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
  revalidatePath("/profile");
  revalidatePath("/participants");
  revalidatePath("/ranking");
  revalidatePath("/dm");
  revalidatePath(`/users/${user.id}/badges`);
  revalidatePath(`/users/${user.id}`);
  revalidatePath(`/results/${finishedSessionId}`);

  redirect(`/results/${finishedSessionId}`);
}

export async function setDisplayName(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("login required");
  }

  const raw = String(formData.get("displayName") ?? "");
  const name = raw.trim();

  if (!name) throw new Error("display name is required");
  if (name.length > 20) {
    throw new Error("display name must be 20 characters or fewer");
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: name }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  revalidatePath("/app");
}
