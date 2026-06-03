"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

export default function MobileAppMenu({
  displayName,
}: {
  displayName: string;
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

  const links = [
    { href: "/participants", label: "参加者" },
    { href: "/dm", label: "DM" },
    { href: "/support", label: "問い合わせ" },
    { href: "/history", label: "履歴" },
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

          <div className="absolute top-0 right-0 h-full w-[min(86vw,320px)] border-l border-border bg-card text-card-foreground shadow-2xl">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">メニュー</div>
                <div className="font-semibold truncate">👤 {displayName}</div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm text-muted-foreground hover:text-foreground"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>

            <nav className="p-3 space-y-2">
              {links.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium hover:bg-secondary/40 transition"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}
    </div>
  );
}
