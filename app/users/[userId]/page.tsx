import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import LinkifiedText from "@/app/components/LinkifiedText";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
  updated_at?: string | null;
};

type SessionRow = {
  id: number | string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: string;
};

type BadgeRow = {
  id: string;
  title: string;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function durationSeconds(startedAt: string, endedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
}

function formatDuration(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function rankLabel(rank: BadgeRow["badge_rank"]) {
  switch (rank) {
    case "platinum":
      return "プラチナ";
    case "gold":
      return "ゴールド";
    case "silver":
      return "シルバー";
    default:
      return "ブロンズ";
  }
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  if (userId === user.id) {
    redirect("/profile");
  }

  const [
    profileRes,
    recentRes,
    allRes,
    badgeMasterRes,
    userBadgeRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_path, status_message, updated_at")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("streak_sessions")
      .select("id, started_at, ended_at, end_reason")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false })
      .limit(20),
    supabase
      .from("streak_sessions")
      .select("id, started_at, ended_at")
      .eq("user_id", userId)
      .not("ended_at", "is", null)
      .order("ended_at", { ascending: false }),
    supabase
      .from("badges")
      .select("id, title, badge_rank"),
    supabase
      .from("user_badges")
      .select("badge_id, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false }),
  ]);

  if (profileRes.error) throw new Error(profileRes.error.message);

  const profile = profileRes.data;
  if (!profile) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ユーザープロフィール</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">
              プロフィールが見つかりません。
            </p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/participants">
                /participants へ戻る
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/app">
                /app
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  if (recentRes.error) throw new Error(recentRes.error.message);
  if (allRes.error) throw new Error(allRes.error.message);
  if (badgeMasterRes.error) throw new Error(badgeMasterRes.error.message);
  if (userBadgeRes.error) throw new Error(userBadgeRes.error.message);

  const row = profile as ProfileRow;
  const avatar = avatarUrl(row.avatar_path);
  const history = (recentRes.data ?? []) as SessionRow[];
  const allHistory = (allRes.data ?? []) as Array<
    Pick<SessionRow, "id" | "started_at" | "ended_at">
  >;

  const sessionCount = allHistory.length;
  const durations = allHistory.map((s) =>
    durationSeconds(s.started_at, s.ended_at)
  );
  const bestSeconds = durations.length > 0 ? Math.max(...durations) : 0;
  const totalSeconds = durations.reduce((sum, sec) => sum + sec, 0);

  const badgeMaster = (badgeMasterRes.data ?? []) as BadgeRow[];
  const userBadges = (userBadgeRes.data ?? []) as UserBadgeRow[];
  const badgeMap = new Map<string, BadgeRow>();
  badgeMaster.forEach((b) => badgeMap.set(b.id, b));

  const latestBadges = userBadges
    .map((ub) => {
      const badge = badgeMap.get(ub.badge_id);
      if (!badge) return null;
      return {
        ...badge,
        unlocked_at: ub.unlocked_at,
      };
    })
    .filter(Boolean)
    .slice(0, 3) as Array<BadgeRow & { unlocked_at: string }>;

  const badgeCounts = {
    platinum: userBadges.filter((ub) => badgeMap.get(ub.badge_id)?.badge_rank === "platinum").length,
    gold: userBadges.filter((ub) => badgeMap.get(ub.badge_id)?.badge_rank === "gold").length,
    silver: userBadges.filter((ub) => badgeMap.get(ub.badge_id)?.badge_rank === "silver").length,
    bronze: userBadges.filter((ub) => badgeMap.get(ub.badge_id)?.badge_rank === "bronze").length,
  };

  const statusText =
    (row.status_message ?? "").trim() ||
    "ステータスメッセージはまだ設定されていません。";

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ユーザープロフィール</h1>
          <p className="text-sm text-muted-foreground">
            他の参加者のプロフィール情報です。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/participants">
            /participants
          </Link>
          <Link
            className="text-sm text-primary hover:underline"
            href={`/dm?userId=${encodeURIComponent(userId)}`}
          >
            DMを送る
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        {/* プロフィール情報 */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">プロフィール情報</h2>
          </CardHeader>

          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {avatar ? (
                  <img
                    src={avatar}
                    alt={(row.display_name ?? "avatar").trim() || "avatar"}
                    className="h-24 w-24 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {(row.display_name ?? "?").trim().slice(0, 1) || "?"}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold break-words">
                  {(row.display_name ?? "").trim() || "NoName"}
                </div>

                <div className="mt-2 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm break-words">
                  <LinkifiedText text={statusText} showPreview />
                </div>

                {/* 導線 */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link
                    href={`/users/${encodeURIComponent(userId)}/calendar`}
                    className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                  >
                    カレンダーを見る
                  </Link>
                  <Link
                    href={`/users/${encodeURIComponent(userId)}/badges`}
                    className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                  >
                    トロフィーを見る
                  </Link>
                </div>

                {/* サマリー */}
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">継続回数</div>
                    <div className="mt-1 text-lg font-bold tabular-nums">
                      {sessionCount}回
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">最長記録</div>
                    <div className="mt-1 text-sm font-bold tabular-nums break-words">
                      {sessionCount > 0 ? formatDuration(bestSeconds) : "記録なし"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">総継続時間</div>
                    <div className="mt-1 text-sm font-bold tabular-nums break-words">
                      {sessionCount > 0 ? formatDuration(totalSeconds) : "記録なし"}
                    </div>
                  </div>
                </div>

                {/* トロフィー概要 */}
                <div className="mt-4 rounded-xl border border-border bg-background/60 px-4 py-3">
                  <div className="text-sm font-semibold">トロフィー概要</div>

                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full border border-border bg-background px-3 py-1">
                      🏆 プラチナ {badgeCounts.platinum}
                    </span>
                    <span className="rounded-full border border-border bg-background px-3 py-1">
                      🥇 ゴールド {badgeCounts.gold}
                    </span>
                    <span className="rounded-full border border-border bg-background px-3 py-1">
                      🥈 シルバー {badgeCounts.silver}
                    </span>
                    <span className="rounded-full border border-border bg-background px-3 py-1">
                      🥉 ブロンズ {badgeCounts.bronze}
                    </span>
                  </div>

                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">最新獲得トロフィー</div>

                    {latestBadges.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        まだ獲得したトロフィーがありません。
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-2">
                        {latestBadges.map((badge) => (
                          <li
                            key={`${badge.id}-${badge.unlocked_at}`}
                            className="rounded-lg border border-border bg-background px-3 py-2"
                          >
                            <div className="text-sm font-semibold break-words">
                              {badge.title}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {rankLabel(badge.badge_rank)} / 獲得日: {formatJst(badge.unlocked_at)}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
                  <div>ユーザーID: {row.id}</div>
                  <div>更新日時: {row.updated_at ? formatJst(row.updated_at) : "-"}</div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 継続履歴 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">継続履歴</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                直近20件
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ表示できる継続履歴がありません。
              </p>
            ) : (
              <ul className="space-y-3">
                {history.map((s) => (
                  <li key={String(s.id)}>
                    <Link href={`/results/${s.id}`} className="block rounded-xl border border-border bg-background/40 px-4 py-3 hover:bg-secondary/30">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold tabular-nums">
                          継続時間:{" "}
                          {formatDuration(durationSeconds(s.started_at, s.ended_at))}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          開始: {formatJst(s.started_at)}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          終了: {s.ended_at ? formatJst(s.ended_at) : "-"}
                        </div>

                        <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          理由: {(s.end_reason ?? "").trim() || "記録なし"}
                        </div>

                        <div className="mt-2 text-[11px] text-primary font-semibold">
                          結果画面を見る →
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
