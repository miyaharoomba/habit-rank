"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useId, useState } from "react";
import {
  Camera,
  ChevronRight,
  GalleryVerticalEnd,
  MessageCircle,
  RefreshCw,
  X,
} from "lucide-react";
import LevelBadge from "@/app/components/LevelBadge";
import ReactionBar from "@/app/components/ReactionBar";
import TitleBadge from "@/app/components/TitleBadge";
import { formatXp } from "@/app/lib/leveling";
import type { ReactionSummary } from "@/app/lib/reactions";
import { formatJstStartLabel } from "@/lib/time";

type TimelineItem = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  user_level: number;
  user_title_label: string | null;
  user_title_rank: "platinum" | "gold" | "silver" | "bronze" | null;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
  xp: number;
  photo_url: string | null;
  comment_count: number;
  reactions: ReactionSummary[];
};

type TimelineResponse = {
  items?: TimelineItem[];
  error?: string;
};

function formatDuration(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  return `${minutes}分 ${seconds}秒`;
}

function profileHref(item: TimelineItem, myUserId: string) {
  return item.user_id === myUserId
    ? "/profile"
    : `/users/${encodeURIComponent(item.user_id)}`;
}

function TimelineAvatar({ item, myUserId }: { item: TimelineItem; myUserId: string }) {
  const initial = item.user_name.trim().slice(0, 1) || "?";

  return (
    <Link
      href={profileHref(item, myUserId)}
      className="shrink-0"
      aria-label={`${item.user_name}のプロフィールへ`}
    >
      {item.user_avatar_url ? (
        <Image
          src={item.user_avatar_url}
          alt=""
          width={40}
          height={40}
          unoptimized
          loading="lazy"
          className="h-10 w-10 rounded-full border border-border object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/50 text-sm font-bold text-muted-foreground">
          {initial}
        </span>
      )}
    </Link>
  );
}

export default function ResultTimelineDrawer({ myUserId }: { myUserId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();

  const load = useCallback(async ({ quiet = false }: { quiet?: boolean } = {}) => {
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/results/timeline?limit=30", {
        cache: "no-store",
      });
      const json = (await response.json().catch(() => null)) as TimelineResponse | null;
      if (!response.ok) throw new Error(json?.error ?? `HTTP ${response.status}`);
      setItems(json?.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "読み込めませんでした。");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void load();
    const timer = window.setInterval(() => void load({ quiet: true }), 15000);
    return () => window.clearInterval(timer);
  }, [load, open]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    const originalOverflow = document.body.style.overflow;
    if (open) document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="みんなの記録を開く"
        title="みんなの記録"
      >
        <GalleryVerticalEnd className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <button
          type="button"
          aria-label="みんなの記録を閉じる"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] bg-black/45"
        />
      ) : null}

      <aside
        id={panelId}
        className={[
          "fixed left-0 top-0 z-[90] h-[100dvh] w-[min(34rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]",
          "border-r border-border bg-background shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase text-muted-foreground">
                result timeline
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight">みんなの記録</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                新しい継続リザルトをまとめて確認
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background transition hover:bg-secondary/50 disabled:opacity-50"
                aria-label="更新する"
                title="更新"
              >
                <RefreshCw
                  className={["h-5 w-5", loading ? "animate-spin" : ""].join(" ")}
                  aria-hidden="true"
                />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background transition hover:bg-secondary/50"
                aria-label="みんなの記録を閉じる"
                title="閉じる"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                記録を読み込み中…
              </div>
            ) : null}

            {error ? (
              <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            {!loading && !error && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                まだ終了リザルトはありません。
              </div>
            ) : null}

            <div className="divide-y divide-border">
              {items.map((item) => (
                <article key={item.id} className="px-4 py-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <TimelineAvatar item={item} myUserId={myUserId} />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={profileHref(item, myUserId)}
                          className="min-w-0 break-words text-sm font-bold hover:underline"
                        >
                          {item.user_id === myUserId ? "あなた" : item.user_name}
                        </Link>
                        <LevelBadge level={item.user_level} compact />
                        {item.user_title_label ? (
                          <TitleBadge
                            label={item.user_title_label}
                            rank={item.user_title_rank}
                            compact
                          />
                        ) : null}
                      </div>
                      <time className="mt-1 block text-xs text-muted-foreground tabular-nums">
                        {formatJstStartLabel(item.ended_at)}
                      </time>
                    </div>
                  </div>

                  <Link
                    href={`/results/${encodeURIComponent(item.id)}`}
                    className="mt-4 block rounded-lg border border-border bg-secondary/20 px-4 py-3 transition hover:bg-secondary/40"
                  >
                    <div className="text-xs font-semibold text-muted-foreground">継続時間</div>
                    <div className="mt-1 text-xl font-bold tabular-nums">
                      {formatDuration(item.started_at, item.ended_at)}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-primary">
                      +{formatXp(item.xp)} XP
                    </div>
                  </Link>

                  {item.photo_url ? (
                    <Link
                      href={`/results/${encodeURIComponent(item.id)}`}
                      className="relative mt-3 block aspect-[16/10] overflow-hidden rounded-lg border border-border bg-secondary/30"
                    >
                      <Image
                        src={item.photo_url}
                        alt={`${item.user_name}の終了時の写真`}
                        fill
                        sizes="(max-width: 560px) calc(100vw - 3rem), 32rem"
                        unoptimized
                        loading="lazy"
                        className="object-cover"
                      />
                    </Link>
                  ) : null}

                  {item.end_reason ? (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">
                      {item.end_reason}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {item.photo_url ? (
                        <span className="inline-flex items-center gap-1">
                          <Camera className="h-4 w-4" aria-hidden="true" />写真
                        </span>
                      ) : null}
                      <Link
                        href={`/results/${encodeURIComponent(item.id)}#comments`}
                        className="inline-flex items-center gap-1 hover:text-foreground"
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        {item.comment_count}
                      </Link>
                    </div>
                    <Link
                      href={`/results/${encodeURIComponent(item.id)}`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      詳細
                      <ChevronRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>

                  <ReactionBar
                    targetType="streak_session"
                    targetId={item.id}
                    initialReactions={item.reactions}
                    className="mt-3"
                  />
                </article>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
