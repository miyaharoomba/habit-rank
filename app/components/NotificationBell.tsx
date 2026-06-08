"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatJstStartLabel } from "@/lib/time";

type NotifItem = {
  id: string;
  type: "dm" | "streak_end" | "admin_broadcast" | "support_reply" | "trophy_unlock";
  created_at: string;
  message_preview: string;
  thread_id: string | null;
  session_id: string | null;
  announcement_id?: string | null;
  support_thread_id?: string | null;
  actor_id: string | null;
  actor_name: string | null;
  read: boolean;
  url?: string;
};

type ApiResponse = {
  unreadCount: number;
  items: NotifItem[];
};

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

function iconFor(n: NotifItem) {
  if (n.type === "trophy_unlock") return "🏆";
  if (n.type === "streak_end") return "⏱️";
  if (n.type === "dm") return "✉️";
  if (n.type === "admin_broadcast") return "📢";
  if (n.type === "support_reply") return "💬";
  return "🔔";
}

export default function NotificationBell({
  limit = 20,
  pollMs = 5000,
}: {
  limit?: number;
  pollMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const fetchingRef = useRef(false);

  const fetchNotifs = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;

      if (!background && !mountedRef.current && items.length === 0) {
        setInitialLoading(true);
      } else {
        setRefreshing(true);
      }

      setError(null);

      try {
        const res = await fetch(`/api/notifications?limit=${limit}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = (await res.json()) as ApiResponse;
        setUnread(json.unreadCount ?? 0);
        setItems(json.items ?? []);
        mountedRef.current = true;
      } catch (e: any) {
        setError(e?.message ?? "fetch failed");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [limit, items.length]
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      setItems((prev) =>
        prev.map((it) => (ids.includes(it.id) ? { ...it, read: true } : it))
      );
      setUnread((prev) => Math.max(0, prev - ids.length));

      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        await fetchNotifs({ background: true });
      }
    },
    [fetchNotifs]
  );

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  useEffect(() => {
    if (!open) return;
    fetchNotifs({ background: true });
  }, [open, fetchNotifs]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchNotifs({ background: true });
    }, pollMs);

    return () => clearInterval(id);
  }, [pollMs, fetchNotifs]);

  useEffect(() => {
    const onFocus = () => {
      fetchNotifs({ background: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchNotifs({ background: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchNotifs]);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const unreadIds = useMemo(
    () => items.filter((x) => !x.read).map((x) => x.id),
    [items]
  );

  const routeFor = (n: NotifItem) => {
    if (n.url && n.url.trim().length > 0) return n.url;
    if (n.type === "streak_end" && n.session_id) return `/results/${n.session_id}`;
    if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
    if (n.type === "admin_broadcast" && n.announcement_id) {
      return `/announcements/${n.announcement_id}`;
    }
    if (n.type === "support_reply" && n.support_thread_id) {
      return `/support/${n.support_thread_id}`;
    }
    if (n.type === "trophy_unlock") {
      return "/badges";
    }
    return "/app";
  };

  const titleFor = (n: NotifItem) => {
    if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
    if (n.type === "streak_end") return `${n.actor_name ?? "誰か"} が継続を終了`;
    if (n.type === "admin_broadcast") return "管理者からのお知らせ";
    if (n.type === "support_reply") return "管理者から返信";
    if (n.type === "trophy_unlock") return "トロフィー獲得！";
    return "通知";
  };

  const bodyFor = (n: NotifItem) => {
    if (n.type === "dm") return n.message_preview || "新しいDMがあります";
    if (n.type === "streak_end") return `理由: ${n.message_preview || "finished"}`;
    if (n.type === "admin_broadcast") return n.message_preview || "お知らせが届きました";
    if (n.type === "support_reply") return n.message_preview || "問い合わせに返信がありました";
    if (n.type === "trophy_unlock") return n.message_preview || "新しいトロフィーを獲得しました";
    return n.message_preview || "通知が届きました";
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2 hover:bg-secondary/50 transition focus:outline-none"
        aria-label="通知"
      >
        {bellIcon("h-5 w-5")}
        {unread > 0 && (
          <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center tabular-nums">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50 sm:hidden"
            onClick={() => setOpen(false)}
          />

          <div className="fixed inset-x-3 top-[88px] bottom-3 z-50 rounded-2xl border border-border bg-card text-card-foreground shadow-glow sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[380px] sm:max-w-[calc(100vw-24px)] sm:max-h-[70vh] overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
              <div className="font-semibold">通知</div>
              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={() => fetchNotifs({ background: true })}
                  className="text-[11px] sm:text-xs text-primary hover:underline"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={() => markRead(unreadIds)}
                  disabled={unreadIds.length === 0}
                  className="text-[11px] sm:text-xs text-primary hover:underline disabled:opacity-40"
                >
                  全部既読
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex sm:hidden items-center justify-center rounded-md border border-border px-2 py-1 text-[11px]"
                  aria-label="閉じる"
                >
                  閉じる
                </button>
                <span className="hidden sm:inline text-xs text-muted-foreground">
                  {initialLoading
                    ? "読み込み中…"
                    : error
                    ? "!"
                    : refreshing
                    ? "更新中…"
                    : unreadIds.length > 0
                    ? `未読${unreadIds.length}`
                    : ""}
                </span>
              </div>
            </div>

            <div className="sm:hidden px-4 py-2 border-b border-border text-[11px] text-muted-foreground">
              {initialLoading
                ? "読み込み中…"
                : error
                ? `エラー: ${error}`
                : refreshing
                ? "更新中…"
                : unreadIds.length > 0
                ? `未読 ${unreadIds.length} 件`
                : "既読のみ"}
            </div>

            <div className="max-h-full overflow-y-auto sm:max-h-[calc(70vh-56px)]">
              {initialLoading && items.length === 0 ? (
                <div className="px-4 py-4 text-sm text-muted-foreground">読み込み中...</div>
              ) : error && items.length === 0 ? (
                <div className="px-4 py-4 text-sm text-destructive">エラー: {error}</div>
              ) : items.length === 0 ? (
                <div className="px-4 py-8 text-sm text-muted-foreground">通知はまだありません。</div>
              ) : (
                <ul className="divide-y divide-border">
                  {items.map((n) => (
                    <li
                      key={n.id}
                      className={[
                        n.read ? "" : "bg-primary/5",
                        n.type === "trophy_unlock" ? "border-l-2 border-amber-300/70" : "",
                      ].join(" ")}
                    >
                      <Link
                        href={routeFor(n)}
                        onClick={() => {
                          if (!n.read) markRead([n.id]);
                          setOpen(false);
                        }}
                        className="block px-4 py-3 hover:bg-secondary/40 transition"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="shrink-0 text-sm">{iconFor(n)}</span>
                              <div className="min-w-0 text-sm font-semibold break-words sm:truncate">
                                {titleFor(n)}
                              </div>
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground break-words">
                              {bodyFor(n)}
                            </div>
                          </div>
                          <div className="shrink-0 text-[11px] sm:text-xs text-muted-foreground whitespace-nowrap tabular-nums pt-0.5">
                            {formatJstStartLabel(n.created_at)}
                          </div>
                        </div>

                        {!n.read && (
                          <div className="mt-2 text-[11px] text-primary font-semibold">未読</div>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="px-4 py-3 border-t border-border text-[11px] sm:text-xs text-muted-foreground">
              継続終了・トロフィー獲得・DM・お知らせ・問い合わせ返信がここに表示されます。
            </div>
          </div>
        </>
      )}
    </div>
  );
}
``