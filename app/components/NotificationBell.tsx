"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type NotifItem = {
  id: string;
  type: "dm" | "streak_end";
  created_at: string;
  message_preview: string;
  thread_id: string | null;
  session_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  read: boolean;
};

type ApiResponse = {
  unreadCount: number;
  items: NotifItem[];
};

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

function bellIcon(className = "h-5 w-5") {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 8a6 6 0 10-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

export default function NotificationBell({
  limit = 20,
  pollMs = 15000,
}: {
  limit?: number;
  pollMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);

  const fetchNotifs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notifications?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiResponse;
      setUnread(json.unreadCount ?? 0);
      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "fetch failed");
    } finally {
      setLoading(false);
    }
  };

  const markRead = async (ids: string[]) => {
    if (ids.length === 0) return;
    // 先にUI側で既読っぽくして体験を良くする（楽観更新）
    setItems((prev) =>
      prev.map((it) => (ids.includes(it.id) ? { ...it, read: true } : it))
    );
    setUnread((prev) => Math.max(0, prev - ids.length));

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });

    if (!res.ok) {
      // 失敗したら取り直し（整合性優先）
      await fetchNotifs();
    }
  };

  // ドロップダウンを開いたら最新を取りにいく
  useEffect(() => {
    if (!open) return;
    fetchNotifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 定期ポーリング（未読数を更新したい）
  useEffect(() => {
    const id = setInterval(() => {
      // 開いてなくても未読数は更新したいので取得
      fetchNotifs();
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, limit]);

  // 外側クリックで閉じる
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return;
      const el = boxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const unreadIds = useMemo(
    () => items.filter((x) => !x.read).map((x) => x.id),
    [items]
  );

  const routeFor = (n: NotifItem) => {
    if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
    // 継続終了はランキングへ（将来「誰が終了したかの詳細」ページを作ってもOK）
    return "/ranking";
  };

  const titleFor = (n: NotifItem) => {
    if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
    return `${n.actor_name ?? "誰か"} が継続を終了`;
  };

  return (
    <div ref={boxRef} className="relative">
      {/* ベルボタン */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2
                   hover:bg-secondary/50 transition
                   focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="通知"
      >
        {bellIcon("h-5 w-5")}

        {/* 未読バッジ */}
        {unread > 0 && (
          <span
            className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground
                       text-xs font-bold flex items-center justify-center tabular-nums"
            aria-label={`未読 ${unread} 件`}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {/* ドロップダウン */}
      {open && (
        <div
          className="absolute right-0 mt-2 w-[320px] sm:w-[360px] rounded-xl border border-border bg-card text-card-foreground shadow-glow z-50"
          role="dialog"
          aria-label="通知一覧"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="font-semibold">通知</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchNotifs()}
                className="text-xs text-primary hover:underline"
              >
                更新
              </button>
              <button
                type="button"
                onClick={() => markRead(unreadIds)}
                disabled={unreadIds.length === 0}
                className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
              >
                全部既読
              </button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {loading && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                読み込み中...
              </div>
            )}

            {error && (
              <div className="px-4 py-3 text-sm text-destructive">
                エラー: {error}
              </div>
            )}

            {!loading && !error && items.length === 0 && (
              <div className="px-4 py-8 text-sm text-muted-foreground">
                通知はまだありません。
              </div>
            )}

            {!loading && !error && items.length > 0 && (
              <ul className="divide-y divide-border">
                {items.map((n) => (
                  <li key={n.id} className={n.read ? "" : "bg-primary/5"}>
                    {/* Linkでページ遷移（Next.js推奨の内部ナビ）[2](https://nodejs.org/ja/download) */}
                    <Link
                      href={routeFor(n)}
                      onClick={() => {
                        // クリックした通知は既読にする
                        if (!n.read) markRead([n.id]);
                        setOpen(false);
                      }}
                      className="block px-4 py-3 hover:bg-secondary/40 transition"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {titleFor(n)}
                          </div>
                          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                            {n.type === "dm"
                              ? n.message_preview
                              : `理由: ${n.message_preview || "finished"}`}
                          </div>
                        </div>

                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {timeAgo(n.created_at)}
                        </div>
                      </div>

                      {!n.read && (
                        <div className="mt-2 text-[11px] text-primary font-semibold">
                          未読
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
            DM通知はDM画面へ、継続終了通知はランキングへ飛びます。
          </div>
        </div>
      )}
    </div>
  );
}
``