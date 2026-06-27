import { NextResponse } from "next/server";
import { levelFromProfileXp, streakSessionXp } from "@/app/lib/leveling";
import {
  getReactionAdminClient,
  loadReactionMap,
} from "@/app/lib/reactionServer";
import { createClient } from "@/lib/supabase/server";
import { getActiveBannedUserIds } from "@/lib/bannedUsers";

type SessionRow = {
  id: number | string;
  user_id: string;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
  result_photo_path: string | null;
  result_photo_captured_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  xp_total: number | string | null;
  level: number | null;
  current_title_badge_id: string | null;
};

type BadgeRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze" | null;
};

type CommentRow = { session_id: number | string };

function clampLimit(raw: string | null) {
  const value = Number(raw ?? 20);
  if (!Number.isFinite(value)) return 20;
  return Math.max(5, Math.min(40, Math.floor(value)));
}

function avatarUrl(path: string | null) {
  return path ? `/api/profile/avatar?path=${encodeURIComponent(path)}` : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const limit = clampLimit(new URL(request.url).searchParams.get("limit"));
  const { data: sessionData, error: sessionError } = await supabase
    .from("streak_sessions")
    .select(
      "id, user_id, started_at, ended_at, end_reason, result_photo_path, result_photo_captured_at"
    )
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit * 3);

  if (sessionError) {
    return NextResponse.json({ error: sessionError.message }, { status: 500 });
  }

  const candidates = (sessionData ?? []) as SessionRow[];
  const bannedIds = await getActiveBannedUserIds(
    candidates.map((session) => session.user_id)
  );
  const sessions = candidates
    .filter((session) => !bannedIds.has(session.user_id))
    .slice(0, limit);
  const userIds = Array.from(new Set(sessions.map((session) => session.user_id)));
  const sessionIds = sessions.map((session) => String(session.id));

  const profileMap = new Map<string, ProfileRow>();
  const badgeMap = new Map<string, BadgeRow>();
  const commentCountMap = new Map<string, number>();

  if (userIds.length > 0) {
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select(
        "id, display_name, avatar_path, xp_total, level, current_title_badge_id"
      )
      .in("id", userIds);

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    ((profileData ?? []) as ProfileRow[]).forEach((profile) => {
      profileMap.set(profile.id, profile);
    });

    const badgeIds = Array.from(
      new Set(
        ((profileData ?? []) as ProfileRow[])
          .map((profile) => profile.current_title_badge_id)
          .filter((id): id is string => Boolean(id))
      )
    );

    if (badgeIds.length > 0) {
      const { data: badgeData, error: badgeError } = await supabase
        .from("badges")
        .select("id, title_label, badge_rank")
        .in("id", badgeIds);

      if (badgeError) {
        return NextResponse.json({ error: badgeError.message }, { status: 500 });
      }

      ((badgeData ?? []) as BadgeRow[]).forEach((badge) => {
        badgeMap.set(badge.id, badge);
      });
    }
  }

  if (sessionIds.length > 0) {
    const { data: commentData, error: commentError } = await supabase
      .from("result_comments")
      .select("session_id")
      .in("session_id", sessionIds);

    if (commentError) {
      return NextResponse.json({ error: commentError.message }, { status: 500 });
    }

    ((commentData ?? []) as CommentRow[]).forEach((comment) => {
      const id = String(comment.session_id);
      commentCountMap.set(id, (commentCountMap.get(id) ?? 0) + 1);
    });
  }

  const reactionMap = await loadReactionMap({
    admin: getReactionAdminClient(),
    targetType: "streak_session",
    targetIds: sessionIds,
    myUserId: user.id,
  });

  const items = sessions.map((session) => {
    const id = String(session.id);
    const profile = profileMap.get(session.user_id);
    const badge = profile?.current_title_badge_id
      ? badgeMap.get(profile.current_title_badge_id)
      : null;

    return {
      id,
      user_id: session.user_id,
      user_name: profile?.display_name?.trim() || "NoName",
      user_avatar_url: avatarUrl(profile?.avatar_path ?? null),
      user_level: levelFromProfileXp(profile?.xp_total, profile?.level),
      user_title_label: badge?.title_label?.trim() || null,
      user_title_rank: badge?.badge_rank ?? null,
      started_at: session.started_at,
      ended_at: session.ended_at,
      end_reason: session.end_reason?.trim() || null,
      xp: streakSessionXp(session.started_at, session.ended_at),
      photo_url: session.result_photo_path
        ? `/api/media/streak-result?sessionId=${encodeURIComponent(id)}&v=${encodeURIComponent(
            session.result_photo_captured_at ?? session.ended_at
          )}`
        : null,
      comment_count: commentCountMap.get(id) ?? 0,
      reactions: reactionMap.get(id) ?? [],
    };
  });

  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, no-store" } }
  );
}
