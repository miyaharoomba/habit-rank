import { createClient as createAdminClient } from "@supabase/supabase-js";

type BadgeRank = "platinum" | "gold" | "silver" | "bronze";

type ModernConditionType =
  | "finish_count"
  | "total_minutes"
  | "single_session_minutes"
  | "time_window_finish_count"
  | "same_day_finish_count"
  | "rolling_window_finish_count"
  | "consecutive_days_finish_count"
  | "short_session_finish_count"
  | "dense_finish_count";

type LegacyConditionType =
  | "total_sessions"
  | "total_hours"
  | "max_streak_days"
  | "early_bird_sessions"
  | "complete_all";

type ConditionType = ModernConditionType | LegacyConditionType;

type BadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  description: string;
  badge_rank: BadgeRank;
  condition_type: ConditionType;
  condition_value: number;
  condition_meta: Record<string, any> | null;
  icon_path: string | null;
};

type SessionRow = {
  id: number | string;
  started_at: string;
  ended_at: string | null;
};

type DerivedStats = {
  finish_count: number;
  total_minutes: number;
  single_session_minutes: number;
  early_bird_sessions: number;
  max_streak_days: number;
  max_same_day_finish_count: number;
  sessions: Array<{
    endedAtIso: string;
    endedAtMs: number;
    endedDateJst: string;
    endedHourJst: number;
    durationMinutes: number;
  }>;
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

function toJstDate(iso: string) {
  const d = new Date(iso);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000);
}

function jstHour(iso: string) {
  return toJstDate(iso).getUTCHours();
}

function jstDateKey(iso: string) {
  return toJstDate(iso).toISOString().slice(0, 10);
}

function daysBetweenDateKeys(prevDateKey: string, nextDateKey: string) {
  const prev = new Date(`${prevDateKey}T00:00:00Z`).getTime();
  const next = new Date(`${nextDateKey}T00:00:00Z`).getTime();
  return Math.round((next - prev) / (24 * 60 * 60 * 1000));
}

function getNumberMeta(meta: Record<string, any> | null | undefined, key: string, fallback: number) {
  const raw = meta?.[key];
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

function getDurationMinutes(startedAt: string, endedAt: string | null) {
  if (!endedAt) return 0;
  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(0, diffMs / (60 * 1000));
}

async function getFinishedSessions(userId: string): Promise<SessionRow[]> {
  const admin = getAdminClient();

  const { data: sessions, error } = await admin
    .from("streak_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (sessions ?? []) as SessionRow[];
}

function deriveStatsFromSessions(rows: SessionRow[]): DerivedStats {
  let finish_count = 0;
  let total_minutes = 0;
  let single_session_minutes = 0;
  let early_bird_sessions = 0;

  const sessions = rows
    .filter((row) => !!row.ended_at)
    .map((row) => {
      const endedAtIso = row.ended_at as string;
      const durationMinutes = getDurationMinutes(row.started_at, endedAtIso);
      const endedHourJst = jstHour(endedAtIso);
      const endedDateJst = jstDateKey(endedAtIso);
      const endedAtMs = new Date(endedAtIso).getTime();

      finish_count += 1;
      total_minutes += durationMinutes;
      single_session_minutes = Math.max(single_session_minutes, durationMinutes);
      if (endedHourJst >= 6 && endedHourJst < 9) {
        early_bird_sessions += 1;
      }

      return {
        endedAtIso,
        endedAtMs,
        endedDateJst,
        endedHourJst,
        durationMinutes,
      };
    });

  const dayCounts = new Map<string, number>();
  for (const s of sessions) {
    dayCounts.set(s.endedDateJst, (dayCounts.get(s.endedDateJst) ?? 0) + 1);
  }
  const max_same_day_finish_count = Math.max(0, ...Array.from(dayCounts.values()), 0);

  const uniqueDays = Array.from(new Set(sessions.map((s) => s.endedDateJst))).sort();
  let max_streak_days = 0;
  let currentStreak = 0;
  let previousDay: string | null = null;

  for (const day of uniqueDays) {
    if (!previousDay) {
      currentStreak = 1;
    } else {
      const gap = daysBetweenDateKeys(previousDay, day);
      if (gap === 1) {
        currentStreak += 1;
      } else if (gap === 0) {
        // no-op
      } else {
        currentStreak = 1;
      }
    }
    previousDay = day;
    max_streak_days = Math.max(max_streak_days, currentStreak);
  }

  return {
    finish_count,
    total_minutes,
    single_session_minutes,
    early_bird_sessions,
    max_streak_days,
    max_same_day_finish_count,
    sessions,
  };
}

function qualifyTimeWindowFinishCount(
  stats: DerivedStats,
  badge: BadgeRow
) {
  const startHour = getNumberMeta(badge.condition_meta, "startHour", 0);
  const endHour = getNumberMeta(badge.condition_meta, "endHour", 24);

  const count = stats.sessions.filter((s) => {
    if (endHour >= 24) {
      return s.endedHourJst >= startHour && s.endedHourJst <= 23;
    }
    return s.endedHourJst >= startHour && s.endedHourJst < endHour;
  }).length;

  return count >= badge.condition_value;
}

function qualifySameDayFinishCount(stats: DerivedStats, badge: BadgeRow) {
  return stats.max_same_day_finish_count >= badge.condition_value;
}

function qualifyRollingWindowFinishCount(stats: DerivedStats, badge: BadgeRow) {
  const days = getNumberMeta(badge.condition_meta, "days", 7);
  const windowMs = days * 24 * 60 * 60 * 1000;
  const endedMs = stats.sessions.map((s) => s.endedAtMs).sort((a, b) => a - b);

  let left = 0;
  let best = 0;
  for (let right = 0; right < endedMs.length; right += 1) {
    while (endedMs[right] - endedMs[left] > windowMs) {
      left += 1;
    }
    best = Math.max(best, right - left + 1);
  }

  return best >= badge.condition_value;
}

function qualifyConsecutiveDays(stats: DerivedStats, badge: BadgeRow) {
  return stats.max_streak_days >= badge.condition_value;
}

function qualifyShortSessionCount(stats: DerivedStats, badge: BadgeRow) {
  const maxMinutes = getNumberMeta(badge.condition_meta, "maxMinutes", 15);
  const count = stats.sessions.filter((s) => s.durationMinutes <= maxMinutes).length;
  return count >= badge.condition_value;
}

function qualifyDenseFinishCount(stats: DerivedStats, badge: BadgeRow) {
  const withinMinutes = getNumberMeta(badge.condition_meta, "withinMinutes", 20);
  const windowMs = withinMinutes * 60 * 1000;
  const endedMs = stats.sessions.map((s) => s.endedAtMs).sort((a, b) => a - b);
  const needed = badge.condition_value;

  let left = 0;
  for (let right = 0; right < endedMs.length; right += 1) {
    while (endedMs[right] - endedMs[left] > windowMs) {
      left += 1;
    }
    if (right - left + 1 >= needed) {
      return true;
    }
  }
  return false;
}

function qualifies(badge: BadgeRow, stats: DerivedStats) {
  switch (badge.condition_type) {
    // modern condition types
    case "finish_count":
      return stats.finish_count >= badge.condition_value;
    case "total_minutes":
      return stats.total_minutes >= badge.condition_value;
    case "single_session_minutes":
      return stats.single_session_minutes >= badge.condition_value;
    case "time_window_finish_count":
      return qualifyTimeWindowFinishCount(stats, badge);
    case "same_day_finish_count":
      return qualifySameDayFinishCount(stats, badge);
    case "rolling_window_finish_count":
      return qualifyRollingWindowFinishCount(stats, badge);
    case "consecutive_days_finish_count":
      return qualifyConsecutiveDays(stats, badge);
    case "short_session_finish_count":
      return qualifyShortSessionCount(stats, badge);
    case "dense_finish_count":
      return qualifyDenseFinishCount(stats, badge);

    // legacy condition types (backward compatibility)
    case "total_sessions":
      return stats.finish_count >= badge.condition_value;
    case "total_hours":
      return stats.total_minutes / 60 >= badge.condition_value;
    case "max_streak_days":
      return stats.max_streak_days >= badge.condition_value;
    case "early_bird_sessions":
      return stats.early_bird_sessions >= badge.condition_value;
    case "complete_all":
      return false;
    default:
      return false;
  }
}

function unlockMessage(badge: BadgeRow) {
  const titleLabel = (badge.title_label ?? "").trim();
  if (titleLabel) {
    return `「${badge.title}」を獲得しました。称号「${titleLabel}」が使えるようになりました。`;
  }
  return `「${badge.title}」を獲得しました。`;
}

export async function checkAndAwardBadges(userId: string) {
  const admin = getAdminClient();
  const sessions = await getFinishedSessions(userId);
  const stats = deriveStatsFromSessions(sessions);

  const { data: badges, error: badgeErr } = await admin
    .from("badges")
    .select(
      "id, title, title_label, description, badge_rank, condition_type, condition_value, condition_meta, icon_path"
    )
    .order("created_at", { ascending: true });

  if (badgeErr) throw new Error(badgeErr.message);

  const { data: userBadges, error: ubErr } = await admin
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);

  if (ubErr) throw new Error(ubErr.message);

  const badgeRows = (badges ?? []) as BadgeRow[];
  const owned = new Set((userBadges ?? []).map((x: any) => x.badge_id));
  const unlocked: BadgeRow[] = [];

  for (const badge of badgeRows) {
    if (owned.has(badge.id)) continue;
    if (badge.condition_type === "complete_all") continue;
    if (!qualifies(badge, stats)) continue;

    const { error: insertErr } = await admin.from("user_badges").insert({
      user_id: userId,
      badge_id: badge.id,
    });

    if (insertErr) {
      if ((insertErr as any).code !== "23505") {
        console.error("user_badges insert failed:", insertErr.message);
      }
      continue;
    }

    unlocked.push(badge);

    const { error: notifErr } = await admin.from("notifications").insert({
      recipient_id: userId,
      actor_id: userId,
      type: "trophy_unlock",
      thread_id: null,
      session_id: null,
      announcement_id: null,
      support_thread_id: null,
      message_preview: unlockMessage(badge),
    });

    if (notifErr) {
      console.error("trophy_unlock notification insert failed:", notifErr.message);
    }
  }

  // legacy / optional special badge support
  const platinum = badgeRows.find((b) => b.condition_type === "complete_all");
  if (platinum && !owned.has(platinum.id)) {
    const nonPlatinumIds = badgeRows
      .filter((b) => b.id !== platinum.id)
      .map((b) => b.id);

    const hasAll = nonPlatinumIds.every(
      (id) => owned.has(id) || unlocked.some((u) => u.id === id)
    );

    if (hasAll) {
      const { error: insertErr } = await admin.from("user_badges").insert({
        user_id: userId,
        badge_id: platinum.id,
      });

      if (!insertErr) {
        unlocked.push(platinum);
      }
    }
  }

  return {
    unlocked,
    stats,
  };
}
