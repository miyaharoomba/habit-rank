"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

// ✅ JST固定フォーマッタ
// formatJstStartLabel: 05/28(水) 13:05 みたいな表示（Asia/Tokyo固定）
import { formatJstStartLabel } from "@/lib/time";

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

    // 楽観更新
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
      await fetchNotifs();
    }
  };

  // 開いたら最新取得
  useEffect(() => {
    if (!open) return;
    fetchNotifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 定期ポーリング
  useEffect(() => {
    const id = setInterval(() => {
      fetchNotifs();
    }, pollMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, limit]);

  // 外側クリックで閉じる（PCドロップダウン用）
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

  // Escで閉じる
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

  const routeFor = (n: NotifItem) => {
    if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
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

      {/* =========================
          PC: 右上ドロップダウン (sm以上)
         ========================= */}
      {open && (
        <div
          className="hidden sm:block absolute right-0 mt-2 w-[360px] rounded-xl border border-border bg-card text-card-foreground shadow-glow z-50"
          role="dialog"
          aria-label="通知一覧"
        >
          <HeaderBar
            loading={loading}
            error={error}
            unreadCount={unreadIds.length}
            onRefresh={fetchNotifs}
            onMarkAll={() => markRead(unreadIds)}
          />
          <ListArea
            items={items}
            loading={loading}
            error={error}
            onClickItem={(id) => markRead([id])}
            titleFor={titleFor}
            routeFor={routeFor}
            close={() => setOpen(false)}
          />
          <FooterHint />
        </div>
      )}

      {/* =========================
          Mobile: フルスクリーン/ボトムシート (sm未満)
         ========================= */}
      {open && (
        <div className="sm:hidden fixed inset-0 z-50">
          {/* オーバーレイ */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          {/* 下から出るシート */}
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
                onClick={() => fetchNotifs()}
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
                loading={loading}
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
  );
}

function HeaderBar({
  loading,
  error,
  unreadCount,
  onRefresh,
  onMarkAll,
}: {
  loading: boolean;
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
          {loading ? "…" : error ? "!" : unreadCount > 0 ? `未読${unreadCount}` : ""}
        </span>
      </div>
    </div>
  );
}

function ListArea({
  items,
  loading,
  error,
  onClickItem,
  titleFor,
  routeFor,
  close,
}: {
  items: NotifItem[];
  loading: boolean;
  error: string | null;
  onClickItem: (id: string) => void;
  titleFor: (n: NotifItem) => string;
  routeFor: (n: NotifItem) => string;
  close: () => void;
}) {
  if (loading) {
    return (
      <div className="px-4 py-4 text-sm text-muted-foreground">読み込み中...</div>
    );
  }

  if (error) {
    return (
      <div className="px-4 py-4 text-sm text-destructive">エラー: {error}</div>
    );
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
                    : `理由: ${n.message_preview || "finished"}`}
                </div>
              </div>

              {/* ✅ 時刻表示をJST固定にする（相対ではなく絶対時刻へ） */}
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
      DM通知はDM画面へ、継続終了通知はランキングへ飛びます。
    </div>
  );
}