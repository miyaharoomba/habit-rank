import { createClient as createAdminClient } from "@supabase/supabase-js";

type BadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  description: string;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  condition_type:
    | "total_sessions"
    | "total_hours"
    | "max_streak_days"
    | "early_bird_sessions"
    | "complete_all";
  condition_value: number;
  icon_path: string | null;
};

type UserStats = {
  total_sessions: number;
  total_hours: number;
  max_streak_days: number;
  early_bird_sessions: number;
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

function jstHour(iso: string) {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours();
}

function daysBetween(startIso: string, endIso: string) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

async function getUserStats(userId: string): Promise<UserStats> {
  const admin = getAdminClient();

  const { data: sessions, error } = await admin
    .from("streak_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", userId)
    .not("ended_at", "is", null);

  if (error) throw new Error(error.message);

  const rows = sessions ?? [];
  const total_sessions = rows.length;

  let total_hours = 0;
  let max_streak_days = 0;
  let early_bird_sessions = 0;

  for (const row of rows as Array<{ started_at: string; ended_at: string | null }>) {
    if (!row.ended_at) continue;

    const sec =
      Math.max(
        0,
        new Date(row.ended_at).getTime() - new Date(row.started_at).getTime()
      ) / 1000;

    total_hours += sec / 3600;
    max_streak_days = Math.max(
      max_streak_days,
      daysBetween(row.started_at, row.ended_at)
    );

    const hour = jstHour(row.ended_at);
    if (hour >= 5 && hour <= 7) {
      early_bird_sessions += 1;
    }
  }

  return {
    total_sessions,
    total_hours,
    max_streak_days,
    early_bird_sessions,
  };
}

function qualifies(badge: BadgeRow, stats: UserStats) {
  switch (badge.condition_type) {
    case "total_sessions":
      return stats.total_sessions >= badge.condition_value;
    case "total_hours":
      return stats.total_hours >= badge.condition_value;
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
  const stats = await getUserStats(userId);

  const { data: badges, error: badgeErr } = await admin
    .from("badges")
    .select(
      "id, title, title_label, description, badge_rank, condition_type, condition_value, icon_path"
    )
    .order("created_at", { ascending: true });

  if (badgeErr) throw new Error(badgeErr.message);

  const { data: userBadges, error: ubErr } = await admin
    .from("user_badges")
    .select("badge_id")
    .eq("user_id", userId);

  if (ubErr) throw new Error(ubErr.message);

  const owned = new Set((userBadges ?? []).map((x: any) => x.badge_id));
  const unlocked: BadgeRow[] = [];

  for (const badge of (badges ?? []) as BadgeRow[]) {
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

  // プラチナ特殊判定
  const platinum = ((badges ?? []) as BadgeRow[]).find(
    (b) => b.condition_type === "complete_all"
  );

  if (platinum && !owned.has(platinum.id)) {
    const nonPlatinumIds = ((badges ?? []) as BadgeRow[])
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