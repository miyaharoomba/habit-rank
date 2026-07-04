import { createClient as createAdminClient } from "@supabase/supabase-js";
import { pulseBadgeThreshold } from "@/app/games/pulse-runner/level";

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

export function getStackGameAdminClient() {
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

export function jstDayStartIso(now = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const date = shifted.toISOString().slice(0, 10);
  return new Date(`${date}T00:00:00+09:00`).toISOString();
}

export function stackDailySeed(now = new Date()) {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dayKey = Number(shifted.toISOString().slice(0, 10).replaceAll("-", ""));
  return Math.abs(Math.imul(dayKey, 2654435761) | 0);
}

type StackBadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  condition_value: number;
};

export async function awardStackBadges({
  userId,
  bestScore,
}: {
  userId: string;
  bestScore: number;
}) {
  const admin = getStackGameAdminClient();
  const { data: badges, error: badgesError } = await admin
    .from("badges")
    .select("id, title, title_label, badge_rank, condition_value")
    .eq("condition_type", "stack_best_score")
    .lte("condition_value", bestScore)
    .order("condition_value", { ascending: true });

  if (badgesError) throw new Error(badgesError.message);

  const rows = (badges ?? []) as StackBadgeRow[];
  if (rows.length === 0) return [];

  const badgeIds = rows.map((badge) => badge.id);
  const { data: owned, error: ownedError } = await admin
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId)
    .in("badge_id", badgeIds);

  if (ownedError) throw new Error(ownedError.message);
  const ownedIds = new Set((owned ?? []).map((row) => String(row.badge_id)));
  const unlocked: StackBadgeRow[] = [];

  for (const badge of rows) {
    if (ownedIds.has(badge.id)) continue;

    const { error: insertError } = await admin.from("user_badges").insert({
      user_id: userId,
      badge_id: badge.id,
    });

    if (insertError) {
      if (insertError.code !== "23505") throw new Error(insertError.message);
      continue;
    }

    unlocked.push(badge);
    const label = (badge.title_label ?? badge.title).trim();
    const { error: notificationError } = await admin.from("notifications").insert({
      recipient_id: userId,
      actor_id: userId,
      type: "trophy_unlock",
      thread_id: null,
      session_id: null,
      announcement_id: null,
      support_thread_id: null,
      message_preview: `Stack Towerで称号「${label}」を獲得しました。`,
    });

    if (notificationError) {
      console.error("stack badge notification failed:", notificationError.message);
    }
  }

  return unlocked;
}

export async function awardPulseRunnerBadges({
  userId,
  bestProgress,
}: {
  userId: string;
  bestProgress: number;
}) {
  const admin = getStackGameAdminClient();
  const { data: badges, error: badgesError } = await admin
    .from("badges")
    .select("id, title, title_label, badge_rank, condition_value")
    .eq("condition_type", "pulse_best_progress")
    .lte("condition_value", pulseBadgeThreshold(bestProgress))
    .order("condition_value", { ascending: true });

  if (badgesError) throw new Error(badgesError.message);
  const rows = (badges ?? []) as StackBadgeRow[];
  if (rows.length === 0) return [];

  const { data: owned, error: ownedError } = await admin
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId)
    .in("badge_id", rows.map((badge) => badge.id));
  if (ownedError) throw new Error(ownedError.message);

  const ownedIds = new Set((owned ?? []).map((row) => String(row.badge_id)));
  const unlocked: StackBadgeRow[] = [];
  for (const badge of rows) {
    if (ownedIds.has(badge.id)) continue;
    const { error: insertError } = await admin.from("user_badges").insert({
      user_id: userId,
      badge_id: badge.id,
    });
    if (insertError) {
      if (insertError.code !== "23505") throw new Error(insertError.message);
      continue;
    }

    unlocked.push(badge);
    const label = (badge.title_label ?? badge.title).trim();
    const { error: notificationError } = await admin.from("notifications").insert({
      recipient_id: userId,
      actor_id: userId,
      type: "trophy_unlock",
      thread_id: null,
      session_id: null,
      announcement_id: null,
      support_thread_id: null,
      message_preview: `Pulse Runnerで称号「${label}」を獲得しました。`,
    });
    if (notificationError) {
      console.error("pulse badge notification failed:", notificationError.message);
    }
  }

  return unlocked;
}
