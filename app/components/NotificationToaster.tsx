"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NotifItem = {
  id: string;
  type: "dm" | "streak_end" | string;
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

type Toast = {
  id: string; // notification id
  title: string;
  body: string;
  href: string;
};

function routeFor(n: NotifItem) {
  if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
  if (n.type === "streak_end" && n.session_id) return `/results/${n.session_id}`;
  return "/app";
}

function titleFor(n: NotifItem) {
  if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
  if (n.type === "streak_end") return `${n.actor_name ?? "誰か"} が継続を終了`;
  return "通知";
}

function bodyFor(n: NotifItem) {
  const txt = (n.message_preview ?? "").trim();
  if (n.type === "streak_end") return txt ? `理由: ${txt}` : "理由: -";
  return txt || "通知が届きました";
}

export default function NotificationToaster({
  limit = 20,
  pollMs = 8000,
  showMs = 5000,
  maxToasts = 3,
}: {
  limit?: number;
  pollMs?: number;
  showMs?: number;
  maxToasts?: number;
}) {
  const router = useRouter(); // クリックで遷移（push）[1](https://qiita.com/H-Iida/items/fe4fe5f18b2ca5bbf6d4)

  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const timersRef = useRef<Map<string, number>>(new Map());

  const enqueue = (t: Toast) => {
    setToasts((prev) => {
      if (prev.some((x) => x.id === t.id)) return prev;
      const next = [t, ...prev];
      return next.slice(0, maxToasts);
    });

    // auto-dismiss
    const timer = window.setTimeout(() => {
      dismiss(t.id);
    }, showMs);
    timersRef.current.set(t.id, timer);
  };

  const dismiss = (id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
    } catch {
      // ignore
    }
  };

  const fetchNotifs = async () => {
    const res = await fetch(`/api/notifications?limit=${limit}`, { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as ApiResponse;
    const items = json.items ?? [];

    // 初回は既存を「既知」として登録して、トーストを出さない（いきなり連発防止）
    if (!initializedRef.current) {
      items.forEach((n) => seenRef.current.add(n.id));
      initializedRef.current = true;
      return;
    }

    // 2回目以降：未知IDだけトースト
    for (const n of items) {
      if (seenRef.current.has(n.id)) continue;
      seenRef.current.add(n.id);

      enqueue({
        id: n.id,
        title: titleFor(n),
        body: bodyFor(n),
        href: routeFor(n),
      });
    }
  };

  // ポーリング開始（全ページ常駐前提）
  useEffect(() => {
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      await fetchNotifs();
    };

    tick();
    const id = window.setInterval(tick, pollMs);

    return () => {
      alive = false;
      window.clearInterval(id);
      // clear timers
      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, limit]);

  const onClickToast = async (t: Toast) => {
    dismiss(t.id);
    await markRead(t.id);
    router.push(t.href); // pushで遷移[1](https://qiita.com/H-Iida/items/fe4fe5f18b2ca5bbf6d4)
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[min(560px,calc(100vw-24px))] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-xl border border-border bg-card/90 backdrop-blur shadow-glow px-4 py-3"
          role="status"
        >
          <div className="flex items-start justify-between gap-3">
            <button
              type="button"
              onClick={() => onClickToast(t)}
              className="min-w-0 text-left flex-1"
              aria-label="通知を開く"
            >
              <div className="text-sm font-semibold truncate">{t.title}</div>
              <div className="mt-0.5 text-xs text-muted-foreground break-words">
                {t.body}
              </div>
            </button>

            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-label="閉じる"
              title="閉じる"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
