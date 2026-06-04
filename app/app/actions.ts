"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

async function triggerDispatchSoon(baseUrl: string) {
  await new Promise((r) => setTimeout(r, 500));

  const resp = await fetch(`${baseUrl}/api/push/dispatch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-push-secret": process.env.PUSH_DISPATCH_SECRET ?? "",
    },
    cache: "no-store",
  });

  const text = await resp.text().catch(() => "");
  return {
    ok: resp.ok,
    status: resp.status,
    body: text,
  };
}

function resolveBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
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

  const { error } = await supabase.from("streak_sessions").insert({ user_id: user.id });

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
 * - 終了後、全ユーザー向けの通知を1件追加する
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

  const lastNonEmpty = [...allReasons].reverse().find((v) => v.length > 0) ?? "";
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

  // 全体通知を追加
  try {
    const { error: notifErr } = await supabase.from("notifications").insert({
      type: "streak_end",
      actor_id: user.id,
      recipient_id: null, // 全ユーザー向け
      session_id: finishedSessionId,
      message_preview: reason,
      thread_id: null,
      announcement_id: null,
      support_thread_id: null,
    });

    if (notifErr) {
      console.error("finishSession notifications insert failed:", notifErr.message);
    } else {
      try {
        const baseUrl = resolveBaseUrl();
        const dispatchResult = await triggerDispatchSoon(baseUrl);
        console.log(
          "finishSession triggerDispatchSoon:",
          dispatchResult.status,
          dispatchResult.body
        );
      } catch (dispatchErr) {
        console.error("finishSession triggerDispatchSoon failed:", dispatchErr);
      }
    }
  } catch (e) {
    console.error("finishSession global notification failed:", e);
  }

  revalidatePath("/app");
  revalidatePath("/history");
  revalidatePath(`/results/${finishedSessionId}`);

  redirect(`/results/${finishedSessionId}`);
}

/**
 * 表示名を保存（profiles.display_name）
 * - 空文字は禁止
 * - 長すぎ防止
 * - upsert（無ければ作る、あれば更新）
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
  if (name.length > 20) throw new Error("名前が長すぎます（20文字以内）");

  const { error } = await supabase
    .from("profiles")
    .upsert({ id: user.id, display_name: name }, { onConflict: "id" });

  if (error) throw new Error(error.message);

  revalidatePath("/app");
}
