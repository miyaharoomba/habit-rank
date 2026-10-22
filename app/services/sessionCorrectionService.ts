import { createClient } from "@/lib/supabase/server";
import { checkAndAwardBadges } from "@/app/services/badgeService";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type CorrectionResult = {
  sessionId: number;
  keptSessionId: number;
  removedSessionId: number;
  firstSessionId: number;
  secondSessionId: number;
};

async function correct(userId: string, sessionId: number, action: "adjust" | "merge" | "split", values: Record<string, string>, editReason: string) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || user.id !== userId) throw new Error("ログイン情報を確認できません。");
  if (!Number.isSafeInteger(sessionId) || sessionId <= 0) throw new Error("記録IDが不正です。");

  const { data, error } = await supabase.rpc("correct_streak_session", {
    p_session_id: sessionId, p_action: action, p_values: values, p_edit_reason: editReason,
  });
  if (error) {
    if (error.code === "PGRST202") throw new Error("記録補正のデータベース更新が未適用です。管理者に連絡してください。");
    throw new Error(error.message);
  }
  // A committed correction remains successful if an optional badge or push step fails.
  try { await checkAndAwardBadges(userId); }
  catch (error) { console.error("correction badge update failed:", error); }
  await triggerPushDispatchBestEffort(action + "Session");
  return data as CorrectionResult;
}

export function adjustSession(args: {
  sessionId: number; userId: string; newEndedAt: string; newEndReason: string; editReason: string;
}) {
  return correct(args.userId, args.sessionId, "adjust", {
    newEndedAt: args.newEndedAt, newEndReason: args.newEndReason,
  }, args.editReason);
}

export function mergeSessionWithNext(args: { sessionId: number; userId: string; editReason: string }) {
  return correct(args.userId, args.sessionId, "merge", {}, args.editReason);
}

export function splitFinishedSession(args: {
  sessionId: number; userId: string; actualEndedAt: string; resumedAt: string;
  firstEndReason: string; secondEndReason: string; editReason: string;
}) {
  return correct(args.userId, args.sessionId, "split", {
    actualEndedAt: args.actualEndedAt, resumedAt: args.resumedAt,
    firstEndReason: args.firstEndReason, secondEndReason: args.secondEndReason,
  }, args.editReason);
}
