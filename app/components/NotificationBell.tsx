"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatJstStartLabel } from "@/lib/time";

type NotifItem = {
  id: string;
  type: "dm" | "streak_end" | "admin_broadcast" | "support_reply";
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

type ToastItem = {
  id: string;
  title: string;
  body: string;
  href: string;
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
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const boxRef = useRef<HTMLDivElement | null>(null);
  const mountedRef = useRef(false);
  const fetchingRef = useRef(false);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());

  const routeFor = useCallback((n: NotifItem) => {
    if (n.url && n.url.trim().length > 0) return n.url;
    if (n.type === "streak_end" && n.session_id) {
      return `/results/${n.session_id}`;
    }
    if (n.type === "dm" && n.thread_id) {
      return `/dm/${n.thread_id}`;
    }
    if (n.type === "admin_broadcast" && n.announcement_id) {
      return `/announcements/${n.announcement_id}`;
    }
    if (n.type === "support_reply" && n.support_thread_id) {
      return `/support/${n.support_thread_id}`;
    }
    return "/app";
  }, []);

  const titleFor = useCallback((n: NotifItem) => {
    if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
    if (n.type === "streak_end") return `${n.actor_name ?? "誰か"} が継続を終了`;
    if (n.type === "admin_broadcast") return "管理者からのお知らせ";
    if (n.type === "support_reply") return "管理者から返信";
    return "通知";
  }, []);

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
        const nextItems = json.items ?? [];
        const nextUnread = json.unreadCount ?? 0;

        const nextUnreadIds = new Set(
          nextItems.filter((x) => !x.read).map((x) => x.id)
        );

        // 2回目以降の取得で、新規未読だけトーストを出す
        if (mountedRef.current && document.visibilityState === "visible") {
          const newUnread = nextItems.filter(
            (x) => !x.read && !prevUnreadIdsRef.current.has(x.id)
          );

          if (newUnread.length > 0) {
            const toastRows: ToastItem[] = newUnread.slice(0, 3).map((n) => ({
              id: n.id,
              title: titleFor(n),
              body:
                n.type === "streak_end"
                  ? `理由: ${n.message_preview || "finished"}`
                  : n.message_preview || "通知が届きました",
              href: routeFor(n),
            }));

            setToasts((prev) => {
              const merged = [...toastRows, ...prev];
              const seen = new Set<string>();
              return merged.filter((t) => {
                if (seen.has(t.id)) return false;
                seen.add(t.id);
                return true;
              }).slice(0, 3);
            });

            toastRows.forEach((t, index) => {
              window.setTimeout(() => {
                setToasts((prev) => prev.filter((x) => x.id !== t.id));
              }, 4500 + index * 300);
            });
          }
        }

        prevUnreadIdsRef.current = nextUnreadIds;
        setUnread(nextUnread);
        setItems(nextItems);
        mountedRef.current = true;
      } catch (e: any) {
        setError(e?.message ?? "fetch failed");
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
        fetchingRef.current = false;
      }
    },
    [limit, items.length, routeFor, titleFor]
  );

  const markRead = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;

      setItems((prev) =>
        prev.map((it) => (ids.includes(it.id) ? { ...it, read: true } : it))
      );
      setUnread((prev) => Math.max(0, prev - ids.length));
      setToasts((prev) => prev.filter((t) => !ids.includes(t.id)));

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

  // 初回ロード
  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  // 開いたら再取得
  useEffect(() => {
    if (!open) return;
    fetchNotifs({ background: true });
  }, [open, fetchNotifs]);

  // ポーリング
  useEffect(() => {
    const id = setInterval(() => {
      fetchNotifs({ background: true });
    }, pollMs);

    return () => clearInterval(id);
  }, [pollMs, fetchNotifs]);

  // タブ/フォーカス復帰
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

  const unreadIds = useMemo(
    () => items.filter((x) => !x.read).map((x) => x.id),
    [items]
  );

  return (
    <>
      {/* Toast */}
      {toasts.length > 0 && (
        <div className="fixed top-3 right-3 z-[100] flex w-[min(92vw,360px)] flex-col gap-2">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="rounded-xl border border-border bg-card text-card-foreground shadow-glow"
            >
              <div className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground break-words">
                    {t.body}
                  </div>
                  <Link
                    href={t.href}
                    onClick={() => {
                      setToasts((prev) => prev.filter((x) => x.id !== t.id));
                    }}
                    className="mt-2 inline-block text-xs text-primary hover:underline"
                  >
                    開く
                  </Link>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setToasts((prev) => prev.filter((x) => x.id !== t.id));
                  }}
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="relative inline-flex items-center justify-center rounded-lg border border-border bg-transparent px-3 py-2 hover:bg-secondary/50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="通知"
        >
          {bellIcon("h-5 w-5")}
          {unread > 0 && (
            <span
              className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center tabular-nums"
              aria-label={`未読 ${unread} 件`}
            >
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>

        {open && (
          <div
            className="hidden sm:block absolute right-0 mt-2 w-[360px] rounded-xl border border-border bg-card text-card-foreground shadow-glow z-50"
            role="dialog"
            aria-label="通知一覧"
          >
            <HeaderBar
              initialLoading={initialLoading}
              refreshing={refreshing}
              error={error}
              unreadCount={unreadIds.length}
              onRefresh={() => fetchNotifs({ background: true })}
              onMarkAll={() => markRead(unreadIds)}
            />
            <ListArea
              items={items}
              initialLoading={initialLoading}
              error={error}
              onClickItem={(id) => markRead([id])}
              titleFor={titleFor}
              routeFor={routeFor}
              close={() => setOpen(false)}
            />
            <FooterHint />
          </div>
        )}

        {open && (
          <div className="sm:hidden fixed inset-0 z-50">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border border-border bg-card text-card-foreground shadow-glow">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="font-semibold">通知</div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="text-sm text-muted-foreground hover:text-foreground"
                  aria-label="閉じる"
                >
                  ✕
                </button>
              </div>

              <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => fetchNotifs({ background: true })}
                  className="text-sm text-primary hover:underline"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={() => markRead(unreadIds)}
                  disabled={unreadIds.length === 0}
                  className="text-sm text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  全部既読
                </button>
              </div>

              <div className="max-h-[70dvh] overflow-y-auto">
                <ListArea
                  items={items}
                  initialLoading={initialLoading}
                  error={error}
                  onClickItem={(id) => markRead([id])}
                  titleFor={titleFor}
                  routeFor={routeFor}
                  close={() => setOpen(false)}
                />
                <FooterHint />
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function HeaderBar({
  initialLoading,
  refreshing,
  error,
  unreadCount,
  onRefresh,
  onMarkAll,
}: {
  initialLoading: boolean;
  refreshing: boolean;
  error: string | null;
  unreadCount: number;
  onRefresh: () => void;
  onMarkAll: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="font-semibold">通知</div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onRefresh}
          className="text-xs text-primary hover:underline"
        >
          更新
        </button>
        <button
          type="button"
          onClick={onMarkAll}
          disabled={unreadCount === 0}
          className="text-xs text-primary hover:underline disabled:opacity-40 disabled:cursor-not-allowed"
        >
          全部既読
        </button>
        <span className="text-xs text-muted-foreground">
          {initialLoading
            ? "読み込み中…"
            : error
            ? "!"
            : refreshing
            ? "更新中…"
            : unreadCount > 0
            ? `未読${unreadCount}`
            : ""}
        </span>
      </div>
    </div>
  );
}

function ListArea({
  items,
  initialLoading,
  error,
  onClickItem,
  titleFor,
  routeFor,
  close,
}: {
  items: NotifItem[];
  initialLoading: boolean;
  error: string | null;
  onClickItem: (id: string) => void;
  titleFor: (n: NotifItem) => string;
  routeFor: (n: NotifItem) => string;
  close: () => void;
}) {
  if (initialLoading && items.length === 0) {
    return <div className="px-4 py-4 text-sm text-muted-foreground">読み込み中...</div>;
  }

  if (error && items.length === 0) {
    return <div className="px-4 py-4 text-sm text-destructive">エラー: {error}</div>;
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-sm text-muted-foreground">
        通知はまだありません。
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((n) => (
        <li key={n.id} className={n.read ? "" : "bg-primary/5"}>
          <Link
            href={routeFor(n)}
            onClick={() => {
              if (!n.read) onClickItem(n.id);
              close();
            }}
            className="block px-4 py-3 hover:bg-secondary/40 transition"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{titleFor(n)}</div>
                <div className="mt-0.5 text-xs text-muted-foreground break-words">
                  {n.type === "dm"
                    ? n.message_preview
                    : n.type === "streak_end"
                    ? `理由: ${n.message_preview || "finished"}`
                    : n.message_preview || "通知が届きました"}
                </div>
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
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
  );
}

function FooterHint() {
  return (
    <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
      DM通知はDM画面へ、継続終了通知は継続リザルトへ、管理者通知はお知らせ詳細へ、
      問い合わせ返信は問い合わせ画面へ飛びます。
    </div>
  );
}