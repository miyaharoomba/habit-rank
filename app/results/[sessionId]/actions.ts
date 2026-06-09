"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  adjustSession,
  mergeSessionWithNext,
  splitFinishedSession,
} from "@/app/services/sessionCorrectionService";

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
  } catch (e: any) {
    const message = encodeURIComponent(e?.message ?? "adjust_failed");
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
  } catch (e: any) {
    const message = encodeURIComponent(e?.message ?? "merge_failed");
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
  } catch (e: any) {
    const message = encodeURIComponent(e?.message ?? "split_failed");
    redirect(`/results/${sessionId}?correction_error=${message}`);
  }
}
