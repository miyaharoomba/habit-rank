import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import {
  DmLink,
  MainLink,
  PageHeader,
  SettingsLink,
} from "@/app/components/AppPageHeader";
import { formatJstStartLabel } from "@/lib/time";
import TitleBadge from "@/app/components/TitleBadge";
import LevelBadge from "@/app/components/LevelBadge";
import { getActiveBannedUserIds } from "@/lib/bannedUsers";
import { formatXp, levelFromProfileXp, levelProgress } from "@/app/lib/leveling";

type BestRow = {
  rank_no: number;
  user_id: string;
  display_name: string;
  best_seconds: number;
};

type CurrentRow = {
  rank_no: number;
  user_id: string;
  display_name: string;
  current_seconds: number;
  started_at: string;
};

type XpRow = {
  rank_no: number;
  user_id: string;
  display_name: string;
  xp_total: number | string;
  level: number;
};

type ProfileRow = {
  id: string;
  avatar_path: string | null;
  current_title_badge_id: string | null;
  xp_total: number | string | null;
  level: number | null;
};

type BadgeLiteRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function profileHref(userId: string, myUserId: string) {
  return userId === myUserId ? "/profile" : `/users/${encodeURIComponent(userId)}`;
}

function rerankBestRows(rows: BestRow[]) {
  return rows.map((row, index) => ({ ...row, rank_no: index + 1 }));
}

function rerankCurrentRows(rows: CurrentRow[]) {
  return rows.map((row, index) => ({ ...row, rank_no: index + 1 }));
}

function rerankXpRows(rows: XpRow[]) {
  return rows.map((row, index) => ({ ...row, rank_no: index + 1 }));
}

function Avatar({
  href,
  avatar,
  displayName,
}: {
  href: string;
  avatar: string | null;
  displayName: string;
}) {
  const initial = (displayName ?? "?").trim().slice(0, 1) || "?";

  return (
    <Link href={href} className="shrink-0">
      {avatar ? (
        <img
          src={avatar}
          alt={displayName || "avatar"}
          className="h-12 w-12 rounded-full object-cover border border-border"
        />
      ) : (
        <div className="h-12 w-12 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-base font-bold text-muted-foreground">
          {initial}
        </div>
      )}
    </Link>
  );
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "current" || tab === "xp" ? tab : "best";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");

  const displayLimit = 50;
  const limit_count = 200;

  const bestRes =
    activeTab === "best"
      ? await supabase.rpc("get_best_leaderboard", { limit_count })
      : { data: null, error: null };

  const currentRes =
    activeTab === "current"
      ? await supabase.rpc("get_current_leaderboard", { limit_count })
      : { data: null, error: null };

  const xpRes =
    activeTab === "xp"
      ? await supabase
          .from("profiles")
          .select("id, display_name, xp_total, level")
          .order("xp_total", { ascending: false })
          .order("level", { ascending: false })
          .limit(limit_count)
      : { data: null, error: null };

  const error = bestRes.error ?? currentRes.error ?? xpRes.error;

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ランキング</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
            <div className="mt-3 flex gap-3">
              <MainLink />
              <SettingsLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rawBestRows = (bestRes.data ?? []) as BestRow[];
  const rawCurrentRows = (currentRes.data ?? []) as CurrentRow[];
  const rawXpRows = ((xpRes.data ?? []) as Array<{
    id: string;
    display_name: string | null;
    xp_total: number | string | null;
    level: number | null;
  }>).map((row, index) => ({
    rank_no: index + 1,
    user_id: row.id,
    display_name: (row.display_name ?? "").trim() || "NoName",
    xp_total: row.xp_total ?? 0,
    level: levelFromProfileXp(row.xp_total, row.level),
  })) satisfies XpRow[];

  const rawRows =
    activeTab === "best"
      ? rawBestRows
      : activeTab === "current"
        ? rawCurrentRows
        : rawXpRows;
  const rawUserIds = Array.from(new Set(rawRows.map((r) => r.user_id)));
  const bannedUserIds = await getActiveBannedUserIds(rawUserIds);

  const bestRows =
    activeTab === "best"
      ? rerankBestRows(rawBestRows.filter((r) => !bannedUserIds.has(r.user_id))).slice(
          0,
          displayLimit
        )
      : [];

  const currentRows =
    activeTab === "current"
      ? rerankCurrentRows(
          rawCurrentRows.filter((r) => !bannedUserIds.has(r.user_id))
        ).slice(0, displayLimit)
      : [];

  const xpRows =
    activeTab === "xp"
      ? rerankXpRows(rawXpRows.filter((r) => !bannedUserIds.has(r.user_id))).slice(
          0,
          displayLimit
        )
      : [];

  const targetRows =
    activeTab === "best"
      ? bestRows
      : activeTab === "current"
        ? currentRows
        : xpRows;
  const targetUserIds = Array.from(new Set(targetRows.map((r) => r.user_id)));

  const avatarMap = new Map<string, string | null>();
  const titleBadgeIdMap = new Map<string, string | null>();
  const levelMap = new Map<string, number | null>();

  if (targetUserIds.length > 0) {
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, avatar_path, current_title_badge_id, xp_total, level")
      .in("id", targetUserIds);

    if (profilesErr) {
      throw new Error(profilesErr.message);
    }

    ((profiles ?? []) as ProfileRow[]).forEach((row) => {
      avatarMap.set(row.id, row.avatar_path ?? null);
      titleBadgeIdMap.set(row.id, row.current_title_badge_id ?? null);
      levelMap.set(row.id, levelFromProfileXp(row.xp_total, row.level));
    });
  }

  const badgeIds = Array.from(
    new Set(Array.from(titleBadgeIdMap.values()).filter(Boolean))
  ) as string[];

  const badgeMap = new Map<string, BadgeLiteRow>();

  if (badgeIds.length > 0) {
    const { data: badges, error: badgesErr } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);

    if (badgesErr) {
      throw new Error(badgesErr.message);
    }

    ((badges ?? []) as BadgeLiteRow[]).forEach((row) => {
      badgeMap.set(row.id, row);
    });
  }

  return (
    <Container>
      <PageHeader
        title="ランキング"
        description={
          <>
            {activeTab === "best"
              ? "ベスト（過去最高）順"
              : activeTab === "current"
                ? "継続中（現在経過）順"
                : "累計XP・レベル順"}
          </>
        }
        actions={
          <>
            <MainLink />
            <DmLink />
            <SettingsLink />
          </>
        }
      />

      <div className="mt-4 flex gap-2">
        <Link
          href="/ranking?tab=best"
          className={[
            "inline-flex rounded-lg border px-4 py-2 text-sm font-semibold transition",
            activeTab === "best"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-secondary/40",
          ].join(" ")}
        >
          ベスト
        </Link>

        <Link
          href="/ranking?tab=current"
          className={[
            "inline-flex rounded-lg border px-4 py-2 text-sm font-semibold transition",
            activeTab === "current"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-secondary/40",
          ].join(" ")}
        >
          継続中
        </Link>

        <Link
          href="/ranking?tab=xp"
          className={[
            "inline-flex rounded-lg border px-4 py-2 text-sm font-semibold transition",
            activeTab === "xp"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-secondary/40",
          ].join(" ")}
        >
          経験値
        </Link>
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">
              TOP{" "}
              {Math.min(
                50,
                activeTab === "best"
                  ? bestRows.length
                  : activeTab === "current"
                    ? currentRows.length
                    : xpRows.length
              )}
            </h2>
          </CardHeader>

          <CardBody>
            {activeTab === "best" ? (
              bestRows.length === 0 ? (
                <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                  まだベスト記録がありません。開始→終了で記録を作ってみて！
                </div>
              ) : (
                <ul className="space-y-3">
                  {bestRows.map((r) => {
                    const isMe = r.user_id === user.id;
                    const href = profileHref(r.user_id, user.id);
                    const avatar = avatarUrl(avatarMap.get(r.user_id));
                    const badgeId = titleBadgeIdMap.get(r.user_id) ?? null;
                    const title = badgeId ? badgeMap.get(badgeId) ?? null : null;
                    const level = levelMap.get(r.user_id) ?? 1;

                    return (
                      <li
                        key={`${r.rank_no}-${r.user_id}`}
                        className="rounded-xl border border-border bg-background/60 px-4 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 text-lg font-bold tabular-nums w-8 text-center">
                            {r.rank_no}
                          </div>

                          <Avatar
                            href={href}
                            avatar={avatar}
                            displayName={r.display_name}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={href}
                                className="text-sm font-semibold hover:underline break-all"
                              >
                                {r.display_name}
                                {isMe ? "（あなた）" : ""}
                              </Link>

                              <LevelBadge level={level} compact />

                              <TitleBadge
                                label={title?.title_label ?? null}
                                rank={title?.badge_rank ?? null}
                                compact
                              />
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                              ベスト記録
                            </div>

                            <div className="mt-1 text-base font-bold tabular-nums">
                              {formatTime(Number(r.best_seconds))}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : activeTab === "current" ? (
              currentRows.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                継続中の人がいません（誰も継続中状態ではない）。
              </div>
              ) : (
                <ul className="space-y-3">
                  {currentRows.map((r) => {
                    const isMe = r.user_id === user.id;
                    const href = profileHref(r.user_id, user.id);
                    const avatar = avatarUrl(avatarMap.get(r.user_id));
                    const badgeId = titleBadgeIdMap.get(r.user_id) ?? null;
                    const title = badgeId ? badgeMap.get(badgeId) ?? null : null;
                    const level = levelMap.get(r.user_id) ?? 1;

                    return (
                      <li
                        key={`${r.rank_no}-${r.user_id}`}
                        className="rounded-xl border border-border bg-background/60 px-4 py-4"
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0 text-lg font-bold tabular-nums w-8 text-center">
                            {r.rank_no}
                          </div>

                          <Avatar
                            href={href}
                            avatar={avatar}
                            displayName={r.display_name}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={href}
                                className="text-sm font-semibold hover:underline break-all"
                              >
                                {r.display_name}
                                {isMe ? "（あなた）" : ""}
                              </Link>

                              <LevelBadge level={level} compact />

                              <TitleBadge
                                label={title?.title_label ?? null}
                                rank={title?.badge_rank ?? null}
                                compact
                              />

                              <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                                継続中
                              </span>
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                              開始：{formatJstStartLabel(r.started_at)}
                            </div>

                            <div className="mt-1 text-base font-bold tabular-nums">
                              {formatTime(Number(r.current_seconds))}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : xpRows.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                まだ経験値ランキングに表示できるユーザーがいません。
              </div>
            ) : (
              <ul className="space-y-3">
                {xpRows.map((r) => {
                  const isMe = r.user_id === user.id;
                  const href = profileHref(r.user_id, user.id);
                  const avatar = avatarUrl(avatarMap.get(r.user_id));
                  const badgeId = titleBadgeIdMap.get(r.user_id) ?? null;
                  const title = badgeId ? badgeMap.get(badgeId) ?? null : null;
                  const level = levelMap.get(r.user_id) ?? r.level;
                  const progress = levelProgress(r.xp_total, level);

                  return (
                    <li
                      key={`${r.rank_no}-${r.user_id}`}
                      className="rounded-xl border border-border bg-background/60 px-4 py-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 text-lg font-bold tabular-nums w-8 text-center">
                          {r.rank_no}
                        </div>

                        <Avatar
                          href={href}
                          avatar={avatar}
                          displayName={r.display_name}
                        />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={href}
                              className="text-sm font-semibold hover:underline break-all"
                            >
                              {r.display_name}
                              {isMe ? "（あなた）" : ""}
                            </Link>

                            <LevelBadge level={level} compact />

                            <TitleBadge
                              label={title?.title_label ?? null}
                              rank={title?.badge_rank ?? null}
                              compact
                            />
                          </div>

                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                            <div>
                              <div className="text-xs text-muted-foreground">
                                累計経験値
                              </div>
                              <div className="mt-1 text-base font-bold tabular-nums">
                                {formatXp(r.xp_total)} XP
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground sm:text-right">
                              次のLv {level + 1}まで{" "}
                              <span className="font-semibold text-foreground tabular-nums">
                                {formatXp(progress.remaining)} XP
                              </span>
                            </div>
                          </div>

                          <div className="mt-3 h-2 overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{
                                width: `${
                                  progress.ratio > 0
                                    ? Math.max(
                                        3,
                                        Math.round(progress.ratio * 100)
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
