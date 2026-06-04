"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default function MobileAppMenu({
  displayName,
  avatarPath,
  statusMessage,
}: {
  displayName: string;
  avatarPath: string | null;
  statusMessage: string | null;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!open) return;
      const el = boxRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = avatarUrl(avatarPath);
  const status = (statusMessage ?? "").trim();

  const quickLinks = [
    { href: "/calendar", label: "カレンダー" },
    { href: "/participants", label: "参加者" },
    { href: "/dm", label: "DM" },
    { href: "/support", label: "問い合わせ" },
    { href: "/ranking", label: "ランキング" },
    { href: "/settings", label: "設定" },
  ];

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2 hover:bg-secondary/50 transition"
        aria-label="メニューを開く"
      >
        ☰
      </button>

      {open && (
        <div className="fixed inset-0 z-50 sm:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />

          <div className="absolute right-3 top-3 bottom-3 w-[min(88vw,360px)] rounded-2xl border border-border bg-card text-card-foreground shadow-glow overflow-y-auto">
            <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="shrink-0">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt="avatar"
                      className="h-12 w-12 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="h-12 w-12 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-lg font-bold text-muted-foreground">
                      {(displayName ?? "?").trim().slice(0, 1) || "?"}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted-foreground">プロフィール</div>
                  <div className="mt-0.5 text-base font-bold break-words">
                    {(displayName ?? "").trim() || "NoName"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-words whitespace-pre-wrap">
                    {status || "ステータスメッセージ未設定"}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <div className="grid gap-3 px-4 py-4">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
              >
                <div>プロフィールを見る</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  自分のプロフィール情報
                </div>
              </Link>

              <Link
                href="/profile/edit"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
              >
                <div>編集</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  名前 / アイコン
                </div>
              </Link>

              <Link
                href="/calendar"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
              >
                <div>カレンダー</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  継続終了日を可視化
                </div>
              </Link>

              <Link
                href="/history"
                onClick={() => setOpen(false)}
                className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
              >
                <div>履歴</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  終了済み記録
                </div>
              </Link>

              {quickLinks
                .filter((item) => item.href !== "/calendar")
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
                  >
                    {item.label}
                  </Link>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
