"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

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
  icon: string;
  tone: "default" | "trophy";
};

const FIRST_LOAD_TOAST_WINDOW_MS = 30_000;

function isAdminBroadcast(n: NotifItem) {
  return n.type === "admin_broadcast";
}

function isToastTarget(n: NotifItem) {
  return (
    n.type === "admin_broadcast" ||
    n.type === "streak_end" ||
    n.type === "trophy_unlock" ||
    n.type === "result_comment" ||
    n.type === "global_chat"
  );
}

function routeFor(n: NotifItem) {
  if (n.url && n.url.trim().length > 0) return n.url;
  if (n.type === "dm" && n.thread_id) return `/dm/${n.thread_id}`;
  if (n.type === "streak_end" && n.session_id) return `/results/${n.session_id}`;
  if (n.type === "result_comment" && n.session_id) {
    return `/results/${n.session_id}`;
  }
  if (n.type === "global_chat") return "/app";
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
}

function titleFor(n: NotifItem) {
  if (n.type === "global_chat") {
    return `${n.actor_name ?? "誰か"} が掲示板で返信`;
  }
  if (n.type === "result_comment") {
    return `${n.actor_name ?? "誰か"} がリザルトにコメント`;
  }
  if (n.type === "dm") return `${n.actor_name ?? "誰か"} からDM`;
  if (n.type === "streak_end") return `${n.actor_name ?? "誰か"} が継続を終了`;
  if (n.type === "admin_broadcast") {
    return (n.message_preview ?? "").trim() || "管理者からのお知らせ";
  }
  if (n.type === "support_reply") {
    return "管理者から返信";
  }
  if (n.type === "trophy_unlock") {
    return "トロフィー獲得！";
  }
  return "通知";
}

function bodyFor(n: NotifItem) {
  const txt = (n.message_preview ?? "").trim();

  if (n.type === "global_chat") {
    return txt || "掲示板に返信が届きました";
  }

  if (n.type === "result_comment") {
    return txt || "コメントが届きました";
  }

  if (n.type === "streak_end") {
    return txt ? `理由: ${txt}` : "理由: -";
  }

  if (n.type === "admin_broadcast") {
    return "タップして詳細を確認してください。";
  }

  if (n.type === "support_reply") {
    return txt || "問い合わせに返信がありました。";
  }

  if (n.type === "trophy_unlock") {
    return txt || "新しいトロフィーを獲得しました。";
  }

  return txt || "通知が届きました";
}

function iconFor(n: NotifItem) {
  if (n.type === "global_chat") return "💬";
  if (n.type === "result_comment") return "💬";
  if (n.type === "trophy_unlock") {
    const text = (n.message_preview ?? "").toLowerCase();
    if (text.includes("プラチナ")) return "🏆";
    if (text.includes("ゴールド")) return "🥇";
    if (text.includes("シルバー")) return "🥈";
    if (text.includes("ブロンズ")) return "🥉";
    return "🏆";
  }
  if (n.type === "streak_end") return "⏱️";
  if (n.type === "admin_broadcast") return "📢";
  return "🔔";
}

function toneFor(n: NotifItem): "default" | "trophy" {
  if (n.type === "trophy_unlock") return "trophy";
  return "default";
}

function toToast(n: NotifItem): Toast {
  return {
    id: n.id,
    title: titleFor(n),
    body: bodyFor(n),
    href: routeFor(n),
    sticky: isAdminBroadcast(n),
    icon: iconFor(n),
    tone: toneFor(n),
  };
}

function shouldToastOnInitialLoad(n: NotifItem, nowMs: number) {
  if (n.read) return false;
  if (!isToastTarget(n)) return false;

  const createdMs = new Date(n.created_at).getTime();
  if (!Number.isFinite(createdMs)) return false;

  const ageMs = nowMs - createdMs;
  return ageMs >= 0 && ageMs <= FIRST_LOAD_TOAST_WINDOW_MS;
}

export default function NotificationToaster({
  limit = 10,
  pollMs = 30000,
  showMs = 5000,
  maxToasts = 3,
}: {
  limit?: number;
  pollMs?: number;
  showMs?: number;
  maxToasts?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const timersRef = useRef<Map<string, number>>(new Map());
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const fetchNotifsRef = useRef<() => Promise<void>>(async () => {});
  const toasterDisabled =
    pathname.startsWith("/auth") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/profile/edit");

  const dismiss = (id: string) => {
    const t = timersRef.current.get(id);
    if (t) {
      window.clearTimeout(t);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((x) => x.id !== id));
    void markRead(id);
  };

  const enqueue = (t: Toast) => {
    setToasts((prev) => {
      if (prev.some((x) => x.id === t.id)) return prev;
      const next = [t, ...prev];
      const sticky = next.filter((x) => x.sticky);
      const normal = next.filter((x) => !x.sticky).slice(0, maxToasts);
      return [...sticky, ...normal];
    });

    void markRead(t.id);

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
    const now = Date.now();
    if (initializedRef.current && now - lastFetchAtRef.current < 5000) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFetchAtRef.current = now;

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
        const nowMs = Date.now();
        for (const n of items) {
          seenRef.current.add(n.id);
          if (shouldToastOnInitialLoad(n, nowMs)) {
            enqueue(toToast(n));
          }
        }

        initializedRef.current = true;
        return;
      }

      for (const n of items) {
        if (seenRef.current.has(n.id)) continue;
        seenRef.current.add(n.id);

        if (n.read) continue;
        if (!isToastTarget(n)) continue;

        enqueue(toToast(n));
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    fetchNotifsRef.current = fetchNotifs;
  });

  useEffect(() => {
    if (toasterDisabled) {
      abortRef.current?.abort();
      const timers = timersRef.current;
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
      setToasts([]);
      return;
    }

    const timers = timersRef.current;
    let alive = true;

    const tick = async () => {
      if (!alive) return;
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      await fetchNotifsRef.current();
    };

    tick();
    const id = window.setInterval(tick, pollMs);

    const onFocus = () => {
      void tick();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void tick();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
      timers.forEach((t) => window.clearTimeout(t));
      timers.clear();
    };
  }, [pollMs, limit, toasterDisabled]);

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
            "rounded-xl border px-4 py-3 backdrop-blur shadow-glow",
            t.sticky
              ? "border-primary/40 bg-card/95"
              : t.tone === "trophy"
              ? "border-amber-300/60 bg-gradient-to-r from-amber-50/95 to-yellow-50/95"
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
              <div className="flex items-center gap-2">
                <span className="text-lg shrink-0">{t.icon}</span>
                <div
                  className={[
                    "text-sm font-semibold truncate",
                    t.tone === "trophy" ? "text-amber-900" : "",
                  ].join(" ")}
                >
                  {t.title}
                </div>
              </div>

              <div
                className={[
                  "mt-1 text-xs break-words",
                  t.tone === "trophy"
                    ? "text-amber-800/80"
                    : "text-muted-foreground",
                ].join(" ")}
              >
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
