"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type NotifItem = {
  id: string;
  type: string;
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

type Toast = {
  id: string;
  title: string;
  body: string;
  href: string;
  sticky: boolean;
};

function isAdminBroadcast(n: NotifItem) {
  return n.type === "admin_broadcast";
}

function routeFor(n: NotifItem) {
  if (n.url && n.url.trim().length > 0) return n.url;
  if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
  if (n.type === "streak_end" && n.session_id) return `/results/${n.session_id}`;
  if (n.type === "admin_broadcast" && n.announcement_id) {
    return `/announcements/${n.announcement_id}`;
  }
  if (n.type === "support_reply" && n.support_thread_id) {
    return `/support/${n.support_thread_id}`;
  }
  return "/app";
}

function titleFor(n: NotifItem) {
  if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
  if (n.type === "streak_end") return `${n.actor_name ?? "誰か"} が継続を終了`;

  if (n.type === "admin_broadcast") {
    return (n.message_preview ?? "").trim() || "管理者からのお知らせ";
  }

  if (n.type === "support_reply") {
    return "管理者から返信";
  }

  return "通知";
}

function bodyFor(n: NotifItem) {
  const txt = (n.message_preview ?? "").trim();

  if (n.type === "streak_end") {
    return txt ? `理由: ${txt}` : "理由: -";
  }

  if (n.type === "admin_broadcast") {
    return "タップして詳細を確認してください。";
  }

  if (n.type === "support_reply") {
    return txt || "問い合わせに返信がありました。";
  }

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
  const router = useRouter();

  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const timersRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const dismiss = (id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
  };

  const enqueue = (t: Toast) => {
    setToasts((prev) => {
      if (prev.some((x) => x.id === t.id)) return prev;

      const next = [t, ...prev];
      const sticky = next.filter((x) => x.sticky);
      const normal = next.filter((x) => !x.sticky).slice(0, maxToasts);

      return [...sticky, ...normal];
    });

    if (!t.sticky) {
      const timer = window.setTimeout(() => dismiss(t.id), showMs);
      timersRef.current.set(t.id, timer);
    }
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
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const res = await fetch(`/api/notifications?limit=${limit}`, {
        cache: "no-store",
        signal: ac.signal,
      });

      if (!res.ok) return;

      const json = (await res.json()) as ApiResponse;
      const items = json.items ?? [];

      if (!initializedRef.current) {
        for (const n of items) {
          seenRef.current.add(n.id);

          if (isAdminBroadcast(n) && !n.read) {
            enqueue({
              id: n.id,
              title: titleFor(n),
              body: bodyFor(n),
              href: routeFor(n),
              sticky: true,
            });
          }
        }

        initializedRef.current = true;
        return;
      }

      for (const n of items) {
        if (seenRef.current.has(n.id)) continue;
        seenRef.current.add(n.id);

        enqueue({
          id: n.id,
          title: titleFor(n),
          body: bodyFor(n),
          href: routeFor(n),
          sticky: isAdminBroadcast(n),
        });
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    } finally {
      inFlightRef.current = false;
    }
  };

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
      abortRef.current?.abort();

      timersRef.current.forEach((t) => window.clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollMs, limit]);

  const onClickToast = async (t: Toast) => {
    dismiss(t.id);
    await markRead(t.id);
    router.push(t.href);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] w-[min(560px,calc(100vw-24px))] space-y-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={[
            "rounded-xl border shadow-glow px-4 py-3 backdrop-blur",
            t.sticky
              ? "border-primary/40 bg-card/95"
              : "border-border bg-card/90",
          ].join(" ")}
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

            {!t.sticky && (
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-xs text-muted-foreground hover:text-foreground"
                aria-label="閉じる"
                title="閉じる"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}