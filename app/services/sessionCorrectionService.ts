import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAndAwardBadges } from "@/app/services/badgeService";

type SessionRow = {
  id: number;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

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

function toMs(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).getTime();
}

function overlaps(
  aStart: string,
  aEnd: string | null,
  bStart: string,
  bEnd: string | null
) {
  const aS = toMs(aStart)!;
  const aE = aEnd ? toMs(aEnd)! : Number.POSITIVE_INFINITY;
  const bS = toMs(bStart)!;
  const bE = bEnd ? toMs(bEnd)! : Number.POSITIVE_INFINITY;
  return aS < bE && bS < aE;
}

async function getOwnedSessionOrThrow(sessionId: number, userId: string) {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("streak_sessions")
    .select("id, user_id, started_at, ended_at, end_reason")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("対象の継続履歴が見つかりません。");

  return data as SessionRow;
}

async function assertNoOverlap({
  userId,
  nextStart,
  nextEnd,
  excludeIds = [],
}: {
  userId: string;
  nextStart: string;
  nextEnd: string | null;
  excludeIds?: number[];
}) {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("streak_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .order("started_at", { ascending: true });

  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Array<Pick<SessionRow, "id" | "started_at" | "ended_at">>) {
    if (excludeIds.includes(Number(row.id))) continue;
    if (overlaps(nextStart, nextEnd, row.started_at, row.ended_at)) {
      throw new Error("他の継続履歴と時間が重複するため保存できません。");
    }
  }
}

async function writeEditLog({
  sessionId,
  userId,
  actionType,
  beforePayload,
  afterPayload,
  editReason,
}: {
  sessionId: number | null;
  userId: string;
  actionType: "adjust" | "merge" | "split" | "delete" | "create";
  beforePayload: unknown;
  afterPayload: unknown;
  editReason: string;
}) {
  const admin = getAdminClient();
  const { error } = await admin.from("streak_session_edits").insert({
    session_id: sessionId,
    user_id: userId,
    action_type: actionType,
    before_payload: beforePayload,
    after_payload: afterPayload,
    edit_reason: editReason,
  });

  if (error) {
    console.error("streak_session_edits insert failed:", error.message);
  }
}

export async function adjustSession({
  sessionId,
  userId,
  newEndedAt,
  newEndReason,
  editReason,
}: {
  sessionId: number;
  userId: string;
  newEndedAt: string;
  newEndReason: string;
  editReason: string;
}) {
  const admin = getAdminClient();
  const target = await getOwnedSessionOrThrow(sessionId, userId);

  if (!target.ended_at) {
    throw new Error("継続中の記録はこの画面から補正できません。");
  }

  if (new Date(newEndedAt).getTime() <= new Date(target.started_at).getTime()) {
    throw new Error("終了時刻は開始時刻より後にしてください。");
  }

  await assertNoOverlap({
    userId,
    nextStart: target.started_at,
    nextEnd: newEndedAt,
    excludeIds: [sessionId],
  });

  const beforePayload = target;
  const afterPayload = {
    ...target,
    ended_at: newEndedAt,
    end_reason: newEndReason,
  };

  const { error } = await admin
    .from("streak_sessions")
    .update({
      ended_at: newEndedAt,
      end_reason: newEndReason,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  await writeEditLog({
    sessionId,
    userId,
    actionType: "adjust",
    beforePayload,
    afterPayload,
    editReason,
  });

  await checkAndAwardBadges(userId);

  return {
    sessionId,
  };
}

export async function mergeSessionWithNext({
  sessionId,
  userId,
  editReason,
}: {
  sessionId: number;
  userId: string;
  editReason: string;
}) {
  const admin = getAdminClient();
  const current = await getOwnedSessionOrThrow(sessionId, userId);

  if (!current.ended_at) {
    throw new Error("継続中の記録は結合できません。");
  }

  const { data: nextRows, error: nextErr } = await admin
    .from("streak_sessions")
    .select("id, user_id, started_at, ended_at, end_reason")
    .eq("user_id", userId)
    .gte("started_at", current.ended_at)
    .neq("id", sessionId)
    .order("started_at", { ascending: true })
    .limit(1);

  if (nextErr) throw new Error(nextErr.message);

  const next = (nextRows ?? [])[0] as SessionRow | undefined;
  if (!next) {
    throw new Error("結合できる次の継続履歴が見つかりません。");
  }

  await assertNoOverlap({
    userId,
    nextStart: current.started_at,
    nextEnd: next.ended_at,
    excludeIds: [sessionId, Number(next.id)],
  });

  const beforePayload = { current, next };
  const afterPayload = {
    merged_into_session_id: next.id,
    started_at: current.started_at,
    ended_at: next.ended_at,
    end_reason: next.end_reason,
  };

  const { error: updateErr } = await admin
    .from("streak_sessions")
    .update({ started_at: current.started_at })
    .eq("id", next.id)
    .eq("user_id", userId);

  if (updateErr) throw new Error(updateErr.message);

  const { error: deleteErr } = await admin
    .from("streak_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (deleteErr) throw new Error(deleteErr.message);

  await writeEditLog({
    sessionId,
    userId,
    actionType: "merge",
    beforePayload,
    afterPayload,
    editReason,
  });

  await checkAndAwardBadges(userId);

  return {
    keptSessionId: Number(next.id),
    removedSessionId: sessionId,
  };
}

export async function splitFinishedSession({
  sessionId,
  userId,
  actualEndedAt,
  resumedAt,
  firstEndReason,
  secondEndReason,
  editReason,
}: {
  sessionId: number;
  userId: string;
  actualEndedAt: string;
  resumedAt: string;
  firstEndReason: string;
  secondEndReason: string;
  editReason: string;
}) {
  const admin = getAdminClient();
  const target = await getOwnedSessionOrThrow(sessionId, userId);

  if (!target.ended_at) {
    throw new Error("継続中の記録はこの画面から分割できません。");
  }

  const startMs = new Date(target.started_at).getTime();
  const endMs = new Date(target.ended_at).getTime();
  const actualEndMs = new Date(actualEndedAt).getTime();
  const resumeMs = new Date(resumedAt).getTime();

  if (!(startMs < actualEndMs && actualEndMs < endMs)) {
    throw new Error("本来の終了時刻は、開始時刻より後かつ元の終了時刻より前にしてください。");
  }

  if (!(actualEndMs < resumeMs && resumeMs < endMs)) {
    throw new Error("再開時刻は、本来の終了時刻より後かつ元の終了時刻より前にしてください。");
  }

  await assertNoOverlap({
    userId,
    nextStart: target.started_at,
    nextEnd: actualEndedAt,
    excludeIds: [sessionId],
  });

  await assertNoOverlap({
    userId,
    nextStart: resumedAt,
    nextEnd: target.ended_at,
    excludeIds: [sessionId],
  });

  const beforePayload = target;

  const { error: updateErr } = await admin
    .from("streak_sessions")
    .update({
      ended_at: actualEndedAt,
      end_reason: firstEndReason,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (updateErr) throw new Error(updateErr.message);

  const { data: inserted, error: insertErr } = await admin
    .from("streak_sessions")
    .insert({
      user_id: userId,
      started_at: resumedAt,
      ended_at: target.ended_at,
      end_reason: secondEndReason,
    })
    .select("id, user_id, started_at, ended_at, end_reason")
    .single();

  if (insertErr) throw new Error(insertErr.message);

  const afterPayload = {
    first: {
      id: sessionId,
      user_id: userId,
      started_at: target.started_at,
      ended_at: actualEndedAt,
      end_reason: firstEndReason,
    },
    second: inserted,
  };

  await writeEditLog({
    sessionId,
    userId,
    actionType: "split",
    beforePayload,
    afterPayload,
    editReason,
  });

  await checkAndAwardBadges(userId);

  return {
    firstSessionId: sessionId,
    secondSessionId: Number((inserted as any).id),
  };
}
