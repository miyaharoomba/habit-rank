"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";
import {
  adjustSession,
  mergeSessionWithNext,
  splitFinishedSession,
} from "@/app/services/sessionCorrectionService";

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

function parseSessionId(raw: FormDataEntryValue | null) {
  const id = Number(String(raw ?? "").trim());
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("session id is invalid");
  }
  return id;
}

function normalizeReason(raw: FormDataEntryValue | null, fallback: string) {
  return String(raw ?? "").trim().slice(0, 200) || fallback;
}

function normalizeComment(raw: FormDataEntryValue | null) {
  const body = String(raw ?? "").trim().slice(0, 280);
  if (!body) {
    throw new Error("comment_empty");
  }
  return body;
}

function errorMessage(e: unknown, fallback: string) {
  return e instanceof Error ? e.message : fallback;
}

async function getUserOrRedirect() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/auth/sign-in");
  }

  return user;
}

async function revalidateAll(sessionId: number, userId: string) {
  revalidatePath(`/results/${sessionId}`);
  revalidatePath("/history");
  revalidatePath("/profile");
  revalidatePath(`/users/${userId}`);
  revalidatePath("/calendar");
  revalidatePath(`/users/${userId}/calendar`);
  revalidatePath("/ranking");
  revalidatePath("/participants");
  revalidatePath("/badges");
  revalidatePath(`/users/${userId}/badges`);
  revalidatePath("/app");
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
  } catch (e) {
    console.error("result comment notification failed:", e);
  }
}

export async function addResultCommentAction(formData: FormData) {
  const user = await getUserOrRedirect();
  const sessionId = parseSessionId(formData.get("session_id"));

  let body: string;
  try {
    body = normalizeComment(formData.get("body"));
  } catch {
    redirect(`/results/${sessionId}?comment_error=empty#comments`);
  }

  const supabase = await createClient();
  const { data: sess, error: sessErr } = await supabase
    .from("streak_sessions")
    .select("id, user_id, ended_at")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessErr || !sess) {
    redirect(`/results/${sessionId}?comment_error=session#comments`);
  }

  if (!sess.ended_at) {
    redirect(`/results/${sessionId}?comment_error=unfinished#comments`);
  }

  const { error: insertErr } = await supabase.from("result_comments").insert({
    session_id: sessionId,
    user_id: user.id,
    body,
  });

  if (insertErr) {
    const message = encodeURIComponent(insertErr.message);
    redirect(`/results/${sessionId}?comment_error=${message}#comments`);
  }

  await createResultCommentNotification({
    sessionId,
    ownerId: String(sess.user_id),
    actorId: user.id,
    body,
  });

  revalidatePath(`/results/${sessionId}`);
  redirect(`/results/${sessionId}?comment=posted#comments`);
}

export async function adjustSessionAction(formData: FormData) {
  const user = await getUserOrRedirect();
  const sessionId = parseSessionId(formData.get("session_id"));
  const newEndedAt = String(formData.get("new_ended_at") ?? "").trim();
  const newEndReason = normalizeReason(formData.get("new_end_reason"), "finished");
  const editReason = normalizeReason(formData.get("edit_reason"), "adjust");

  if (!newEndedAt) {
    redirect(`/results/${sessionId}?correction_error=adjustEndedAt`);
  }

  try {
    await adjustSession({
      sessionId,
      userId: user.id,
      newEndedAt: new Date(newEndedAt).toISOString(),
      newEndReason,
      editReason,
    });
    await revalidateAll(sessionId, user.id);
    redirect(`/results/${sessionId}?corrected=adjust`);
  } catch (e: unknown) {
    const message = encodeURIComponent(errorMessage(e, "adjust_failed"));
    redirect(`/results/${sessionId}?correction_error=${message}`);
  }
}

export async function mergeSessionAction(formData: FormData) {
  const user = await getUserOrRedirect();
  const sessionId = parseSessionId(formData.get("session_id"));
  const editReason = normalizeReason(formData.get("edit_reason"), "merge");

  try {
    const result = await mergeSessionWithNext({
      sessionId,
      userId: user.id,
      editReason,
    });
    await revalidateAll(sessionId, user.id);
    await revalidateAll(result.keptSessionId, user.id);
    redirect(`/results/${result.keptSessionId}?corrected=merge`);
  } catch (e: unknown) {
    const message = encodeURIComponent(errorMessage(e, "merge_failed"));
    redirect(`/results/${sessionId}?correction_error=${message}`);
  }
}

export async function splitSessionAction(formData: FormData) {
  const user = await getUserOrRedirect();
  const sessionId = parseSessionId(formData.get("session_id"));
  const actualEndedAt = String(formData.get("actual_ended_at") ?? "").trim();
  const resumedAt = String(formData.get("resumed_at") ?? "").trim();
  const firstEndReason = normalizeReason(formData.get("first_end_reason"), "manual split");
  const secondEndReason = normalizeReason(formData.get("second_end_reason"), firstEndReason);
  const editReason = normalizeReason(formData.get("edit_reason"), "split");

  if (!actualEndedAt || !resumedAt) {
    redirect(`/results/${sessionId}?correction_error=splitRequired`);
  }

  try {
    const result = await splitFinishedSession({
      sessionId,
      userId: user.id,
      actualEndedAt: new Date(actualEndedAt).toISOString(),
      resumedAt: new Date(resumedAt).toISOString(),
      firstEndReason,
      secondEndReason,
      editReason,
    });
    await revalidateAll(sessionId, user.id);
    await revalidateAll(result.secondSessionId, user.id);
    redirect(`/results/${sessionId}?corrected=split&created=${result.secondSessionId}`);
  } catch (e: unknown) {
    const message = encodeURIComponent(errorMessage(e, "split_failed"));
    redirect(`/results/${sessionId}?correction_error=${message}`);
  }
}
