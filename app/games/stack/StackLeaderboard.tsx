"use client";

import Link from "next/link";
import Image from "next/image";
import { Crown, Medal } from "lucide-react";
import { useState } from "react";
import LevelBadge from "@/app/components/LevelBadge";
import TitleBadge from "@/app/components/TitleBadge";

export type StackRankingRow = {
  rank: number;
  userId: string;
  displayName: string;
  avatarPath: string | null;
  level: number;
  titleLabel: string | null;
  titleRank: "platinum" | "gold" | "silver" | "bronze" | null;
  score: number;
  blocks: number;
  perfects: number;
};

type RankingPeriod = "daily" | "weekly" | "all";

function avatarUrl(path: string | null) {
  return path ? `/api/profile/avatar?path=${encodeURIComponent(path)}` : null;
}

function rankingLabel(rank: number) {
  if (rank === 1) return "今日の王者";
  if (rank <= 3) return "TOP 3";
  return null;
}

export default function StackLeaderboard({
  daily,
  weekly,
  allTime,
  myUserId,
}: {
  daily: StackRankingRow[];
  weekly: StackRankingRow[];
  allTime: StackRankingRow[];
  myUserId: string;
}) {
  const [period, setPeriod] = useState<RankingPeriod>("daily");
  const rows = period === "daily" ? daily : period === "weekly" ? weekly : allTime;

  return (
    <section id="stack-ranking" className="bg-background px-4 py-12 text-foreground sm:px-6 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Stack Tower</div>
            <h2 className="mt-1 text-3xl font-black">ランキング</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              各ユーザーの期間内ベストスコアで順位を決定します。
            </p>
          </div>

          <div className="grid grid-cols-3 border border-border bg-secondary/30 p-1">
            {(
              [
                ["daily", "今日"],
                ["weekly", "今週"],
                ["all", "歴代"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setPeriod(value)}
                className={[
                  "h-9 min-w-20 px-3 text-sm font-bold transition",
                  period === value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-8 border-y border-border py-12 text-center text-sm text-muted-foreground">
            まだ記録がありません。最初の挑戦者になろう。
          </div>
        ) : (
          <ol className="mt-8 divide-y divide-border border-y border-border">
            {rows.map((row) => {
              const profileHref = row.userId === myUserId ? "/profile" : `/users/${row.userId}`;
              const avatar = avatarUrl(row.avatarPath);
              const label = rankingLabel(row.rank);

              return (
                <li
                  key={row.userId}
                  className={[
                    "grid grid-cols-[2.5rem_3rem_minmax(0,1fr)_auto] items-center gap-3 py-4 sm:grid-cols-[3rem_3.5rem_minmax(0,1fr)_auto] sm:gap-4",
                    row.userId === myUserId ? "bg-primary/5" : "",
                  ].join(" ")}
                >
                  <div className="text-center text-lg font-black tabular-nums">
                    {row.rank === 1 ? (
                      <Crown className="mx-auto h-6 w-6 text-amber-500" aria-label="1位" />
                    ) : row.rank <= 3 ? (
                      <span className="inline-flex items-center gap-1">
                        <Medal className="h-4 w-4 text-sky-500" aria-hidden="true" />
                        {row.rank}
                      </span>
                    ) : (
                      row.rank
                    )}
                  </div>

                  <Link href={profileHref} className="shrink-0">
                    {avatar ? (
                      <Image
                        src={avatar}
                        alt={row.displayName}
                        width={56}
                        height={56}
                        unoptimized
                        className="h-12 w-12 rounded-full border border-border object-cover sm:h-14 sm:w-14"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary text-sm font-black sm:h-14 sm:w-14">
                        {row.displayName.slice(0, 1) || "?"}
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={profileHref} className="truncate text-sm font-bold hover:underline">
                        {row.displayName}
                        {row.userId === myUserId ? "（あなた）" : ""}
                      </Link>
                      <LevelBadge level={row.level} compact />
                      <TitleBadge label={row.titleLabel} rank={row.titleRank} compact />
                      {label ? (
                        <span className="hidden text-[11px] font-bold text-amber-600 sm:inline">
                          {label}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {row.blocks}ブロック・PERFECT {row.perfects}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-black tabular-nums sm:text-2xl">
                      {row.score.toLocaleString("ja-JP")}
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground">SCORE</div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/app"
            className="inline-flex h-11 items-center justify-center border border-border px-5 text-sm font-bold transition hover:bg-secondary/50"
          >
            メイン画面へ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
