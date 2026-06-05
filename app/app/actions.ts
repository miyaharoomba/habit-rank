"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
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

  if (userError || !user) throw new Error("ログイン情報が取れません");

  const { error } = await supabase
    .from("streak_sessions")
    .insert({ user_id: user.id });

  // 継続中1個制限に引っかかったら開始済み扱いでOK
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
 * - mode=restart: 終了して次を自動開始
 * - mode=stop:    完全に終了
 * - 一般ユーザーでも確実に通知が入るよう、notifications への insert は service role で実行
 */
export async function finishSession(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error("ログイン情報が取れません");

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

  if (error) throw new Error(error.message);

  const finishedSessionId = data?.[0]?.finished_session_id as string | undefined;
  if (!finishedSessionId) {
    throw new Error("finished session id not found");
  }

  // ここが重要:
  // 一般ユーザーでも絶対に通知が入るよう、service role で全体通知を insert
  try {
    const admin = getAdminClient();

    const { error: notifErr } = await admin.from("notifications").insert({
      type: "streak_end",
      actor_id: user.id,
      recipient_id: null, // 全体通知
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

  revalidatePath("/app");
  revalidatePath("/history");
  revalidatePath(`/results/${finishedSessionId}`);
  redirect(`/results/${finishedSessionId}`);
}

/**
 * 表示名を保存（profiles.display_name）
 */
export async function setDisplayName(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) throw new Error("ログイン情報が取れません");

  const raw = String(formData.get("displayName") ?? "");
  const name = raw.trim();

  if (!name) throw new Error("名前が空です");
  if (name.length > 20) {
    throw new Error("名前が長すぎます（20文字以内）");
  }

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: name }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  revalidatePath("/app");
}