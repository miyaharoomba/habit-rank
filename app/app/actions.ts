"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAndAwardBadges } from "@/app/services/badgeService";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
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

  // 継続中1個制限に引っかかったら開始済み扱い
  if (error) {
    const anyErr = error as any;
    if (anyErr?.code === "23505") {
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
 * 管理者は profiles.suppress_global_streak_end_notification = true の時だけ
 * 全体通知を飛ばさない
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

  // 管理者の通知抑制フラグ確認
  let shouldBroadcast = true;

  try {
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");

    if (!adminErr && isAdmin) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("suppress_global_streak_end_notification")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileErr && profile?.suppress_global_streak_end_notification) {
        shouldBroadcast = false;
      }
    }
  } catch (e) {
    console.error("admin suppress flag check failed:", e);
  }

  // 全体通知
  if (shouldBroadcast) {
    try {
      const admin = getAdminClient();

      const { error: notifErr } = await admin.from("notifications").insert({
        type: "streak_end",
        actor_id: user.id,
        recipient_id: null,
        thread_id: null,
        session_id: finishedSessionId,
        announcement_id: null,
        support_thread_id: null,
        message_preview: reason,
      });

      if (notifErr) {
        console.error("finishSession notifications insert failed:", notifErr.message);
      }
    } catch (e) {
      console.error("finishSession notification service-role insert failed:", e);
    }
  }

  // 称号判定
  try {
    await checkAndAwardBadges(user.id);
  } catch (e) {
    console.error("checkAndAwardBadges failed:", e);
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