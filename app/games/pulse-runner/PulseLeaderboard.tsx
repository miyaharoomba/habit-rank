"use client";

import Image from "next/image";
import Link from "next/link";
import { Crown, Medal } from "lucide-react";
import { useState } from "react";
import LevelBadge from "@/app/components/LevelBadge";
import TitleBadge from "@/app/components/TitleBadge";

export type PulseRankingRow = {
  rank: number;
  userId: string;
  displayName: string;
  avatarPath: string | null;
  level: number;
  titleLabel: string | null;
  titleRank: "platinum" | "gold" | "silver" | "bronze" | null;
  distance: number;
  progress: number;
  completed: boolean;
  coins: number;
};

type Period = "daily" | "weekly" | "all";

function avatarUrl(path: string | null) {
  return path ? `/api/profile/avatar?path=${encodeURIComponent(path)}` : null;
}

export default function PulseLeaderboard({
  daily,
  weekly,
  allTime,
  myUserId,
}: {
  daily: PulseRankingRow[];
  weekly: PulseRankingRow[];
  allTime: PulseRankingRow[];
  myUserId: string;
}) {
  const [period, setPeriod] = useState<Period>("daily");
  const rows = period === "daily" ? daily : period === "weekly" ? weekly : allTime;

  return (
    <section id="pulse-ranking" className="bg-background px-4 py-12 text-foreground sm:px-6 sm:py-16">
      <div className="mx-auto max-w-4xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">Pulse Runner</div>
            <h2 className="mt-1 text-3xl font-black">ランキング</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              クリアタイムではなく、コースを進んだ距離で順位を決定します。
            </p>
          </div>
          <div className="grid grid-cols-3 border border-border bg-secondary/30 p-1">
            {([['daily', '今日'], ['weekly', '今週'], ['all', '歴代']] as const).map(
              ([value, label]) => (
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
              )
            )}
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="mt-8 border-y border-border py-12 text-center text-sm text-muted-foreground">
            まだ記録がありません。最初のランナーになろう。
          </div>
        ) : (
          <ol className="mt-8 divide-y divide-border border-y border-border">
            {rows.map((row) => {
              const href = row.userId === myUserId ? "/profile" : `/users/${row.userId}`;
              const avatar = avatarUrl(row.avatarPath);
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

                  <Link href={href}>
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
                      <Link href={href} className="truncate text-sm font-bold hover:underline">
                        {row.displayName}{row.userId === myUserId ? "（あなた）" : ""}
                      </Link>
                      <LevelBadge level={row.level} compact />
                      <TitleBadge label={row.titleLabel} rank={row.titleRank} compact />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      SHARDS {row.coins} / 3
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-black tabular-nums sm:text-2xl">
                      {row.distance}m
                    </div>
                    <div className="text-[10px] font-bold text-muted-foreground">
                      {row.completed ? "COURSE CLEAR" : `${Math.round(row.progress)}%`}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="mt-8 flex justify-center">
          <Link
            href="/games"
            className="inline-flex h-11 items-center justify-center border border-border px-5 text-sm font-bold transition hover:bg-secondary/50"
          >
            ゲーム一覧へ戻る
          </Link>
        </div>
      </div>
    </section>
  );
}
