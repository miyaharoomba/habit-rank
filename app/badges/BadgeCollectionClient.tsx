"use client";

import { useMemo, useState } from "react";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { HeaderLink, MainLink } from "@/app/components/AppPageHeader";
import { UserRound } from "lucide-react";

type BadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  description: string;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  condition_type: string;
  condition_value: number;
  icon_path: string | null;
};

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: string;
};

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

function rankClass(rank: BadgeRow["badge_rank"], unlocked: boolean) {
  if (!unlocked) return "border-border bg-background text-muted-foreground opacity-70";

  switch (rank) {
    case "platinum":
      return "border-sky-400 bg-gradient-to-br from-sky-100 to-indigo-100 text-sky-900";
    case "gold":
      return "border-amber-400 bg-gradient-to-br from-amber-50 to-yellow-100 text-amber-900";
    case "silver":
      return "border-slate-300 bg-gradient-to-br from-slate-50 to-slate-100 text-slate-800";
    default:
      return "border-orange-300 bg-gradient-to-br from-orange-50 to-amber-100 text-orange-900";
  }
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function BadgeCollectionClient({
  title,
  subtitle,
  profileHref,
  badges,
  earned,
  currentTitleBadgeId,
  readOnly,
}: {
  title: string;
  subtitle: string;
  profileHref: string;
  badges: BadgeRow[];
  earned: UserBadgeRow[];
  currentTitleBadgeId: string | null;
  readOnly: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "earned" | "unearned">("all");
  const [rank, setRank] = useState<"all" | BadgeRow["badge_rank"]>("all");
  const [activeTitleBadgeId, setActiveTitleBadgeId] = useState<string | null>(
    currentTitleBadgeId
  );
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const earnedMap = useMemo(() => {
    const m = new Map<string, UserBadgeRow>();
    earned.forEach((e) => m.set(e.badge_id, e));
    return m;
  }, [earned]);

  const rows = useMemo(() => {
    return badges.filter((b) => {
      const unlocked = earnedMap.has(b.id);
      if (filter === "earned" && !unlocked) return false;
      if (filter === "unearned" && unlocked) return false;
      if (rank !== "all" && b.badge_rank !== rank) return false;
      return true;
    });
  }, [badges, earnedMap, filter, rank]);

  const total = badges.length;
  const earnedCount = earned.length;
  const progress = total > 0 ? Math.round((earnedCount / total) * 100) : 0;

  const countsByRank = useMemo(() => {
    const source = badges.map((b) => ({ rank: b.badge_rank, unlocked: earnedMap.has(b.id) }));
    return {
      platinum: source.filter((x) => x.rank === "platinum" && x.unlocked).length,
      gold: source.filter((x) => x.rank === "gold" && x.unlocked).length,
      silver: source.filter((x) => x.rank === "silver" && x.unlocked).length,
      bronze: source.filter((x) => x.rank === "bronze" && x.unlocked).length,
    };
  }, [badges, earnedMap]);

  const setTitle = async (badgeId: string) => {
    if (readOnly) return;
    setSaving(badgeId);
    setError(null);

    try {
      const res = await fetch("/api/profile/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeId }),
      });

      const json = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : `HTTP ${res.status}`
        );
      }

      setActiveTitleBadgeId(badgeId);
    } catch (e: unknown) {
      setError(errorMessage(e, "称号設定に失敗しました。"));
    } finally {
      setSaving(null);
    }
  };

  const clearTitle = async () => {
    if (readOnly) return;
    setSaving("clear");
    setError(null);

    try {
      const res = await fetch("/api/profile/title", {
        method: "DELETE",
      });

      const json = (await res.json().catch(() => ({}))) as { error?: unknown };
      if (!res.ok) {
        throw new Error(
          typeof json.error === "string" ? json.error : `HTTP ${res.status}`
        );
      }

      setActiveTitleBadgeId(null);
    } catch (e: unknown) {
      setError(errorMessage(e, "称号解除に失敗しました。"));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">{subtitle}</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <HeaderLink href={profileHref} icon={UserRound}>
            プロフィール
          </HeaderLink>
          <MainLink />
        </div>
      </header>

      <Card>
        <CardHeader>
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">獲得進捗</div>
                <div className="text-2xl font-bold tabular-nums">
                  {earnedCount} / {total}
                </div>
              </div>
              <div className="text-sm font-semibold">{progress}%</div>
            </div>

            <div className="h-3 rounded-full bg-secondary/40 overflow-hidden">
              <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span>🥉 {countsByRank.bronze}</span>
              <span>🥈 {countsByRank.silver}</span>
              <span>🥇 {countsByRank.gold}</span>
              <span>🏆 {countsByRank.platinum}</span>
            </div>

            {!readOnly ? (
              <div className="flex flex-wrap items-center gap-2 pt-2">
                <div className="text-xs text-muted-foreground">現在の称号:</div>
                <div className="rounded-full border border-border bg-background px-3 py-1 text-sm font-semibold">
                  {activeTitleBadgeId
                    ? badges.find((b) => b.id === activeTitleBadgeId)?.title_label || "未設定"
                    : "未設定"}
                </div>
                <button
                  type="button"
                  onClick={clearTitle}
                  disabled={saving === "clear" || activeTitleBadgeId === null}
                  className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary/40 disabled:opacity-50"
                >
                  {saving === "clear" ? "解除中..." : "称号を外す"}
                </button>
              </div>
            ) : null}

            {error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : null}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2 px-4 py-4">
            <select
              value={filter}
              onChange={(e) => {
                const value = e.target.value;
                if (value === "all" || value === "earned" || value === "unearned") {
                  setFilter(value);
                }
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">すべて</option>
              <option value="earned">獲得済み</option>
              <option value="unearned">未獲得</option>
            </select>

            <select
              value={rank}
              onChange={(e) => {
                const value = e.target.value;
                if (
                  value === "all" ||
                  value === "platinum" ||
                  value === "gold" ||
                  value === "silver" ||
                  value === "bronze"
                ) {
                  setRank(value);
                }
              }}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="all">全ランク</option>
              <option value="platinum">プラチナ</option>
              <option value="gold">ゴールド</option>
              <option value="silver">シルバー</option>
              <option value="bronze">ブロンズ</option>
            </select>

            {readOnly ? (
              <span className="text-xs text-muted-foreground">読み取り専用</span>
            ) : null}
          </div>
        </CardHeader>

        <CardBody>
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((badge) => {
              const unlocked = earnedMap.get(badge.id);
              const titleLabel = (badge.title_label ?? "").trim();
              const isActive = activeTitleBadgeId === badge.id;

              return (
                <div
                  key={badge.id}
                  className={[
                    "rounded-2xl border p-4",
                    rankClass(badge.badge_rank, !!unlocked),
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold opacity-80">
                        {rankLabel(badge.badge_rank)}
                      </div>
                      <div className="mt-1 text-base font-bold break-words">
                        {unlocked ? badge.title : "？？？？"}
                      </div>
                    </div>

                    {unlocked ? (
                      <div className="text-lg">🏆</div>
                    ) : (
                      <div className="text-lg opacity-50">🔒</div>
                    )}
                  </div>

                  <div className="mt-2 text-sm break-words">
                    {unlocked ? badge.description : "未獲得のトロフィーです。"}
                  </div>

                  <div className="mt-3 text-xs opacity-80">
                    条件: {badge.condition_type} / {badge.condition_value}
                  </div>

                  <div className="mt-2 text-xs opacity-80">
                    {unlocked
                      ? `獲得日: ${formatDate(unlocked.unlocked_at)}`
                      : "まだ獲得していません"}
                  </div>

                  <div className="mt-3 rounded-lg border border-border/60 bg-background/70 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">称号</div>
                    <div className="mt-1 text-sm font-semibold break-words">
                      {unlocked ? titleLabel || "称号なし" : "？？？？"}
                    </div>
                  </div>

                  {!readOnly && unlocked ? (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setTitle(badge.id)}
                        disabled={saving === badge.id || isActive}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:opacity-50"
                      >
                        {isActive
                          ? "現在設定中"
                          : saving === badge.id
                          ? "設定中..."
                          : "この称号を使う"}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
