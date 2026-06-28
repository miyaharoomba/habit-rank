"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Award,
  CalendarDays,
  ChartColumnIncreasing,
  History,
  Gamepad2,
  LifeBuoy,
  Menu,
  MessageCircle,
  Pencil,
  Settings,
  Trophy,
  UserRound,
  Users,
  X,
} from "lucide-react";

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
  const panelRef = useRef<HTMLDivElement | null>(null);

  const avatar = useMemo(() => avatarUrl(avatarPath), [avatarPath]);
  const status = (statusMessage ?? "").trim();

  const quickLinks = [
    { href: "/games/stack", label: "Stack Tower", desc: "積み上げゲームでスコアを競う", icon: Gamepad2 },
    { href: "/calendar", label: "カレンダー", desc: "継続終了日を可視化", icon: CalendarDays },
    { href: "/reports", label: "レポート", desc: "週間・月間の集計", icon: ChartColumnIncreasing },
    { href: "/badges", label: "トロフィー", desc: "獲得したバッジ一覧", icon: Award },
    { href: "/history", label: "履歴", desc: "終了済み記録", icon: History },
    { href: "/participants", label: "参加者", desc: "他ユーザーを見る", icon: Users },
    { href: "/dm", label: "DM", desc: "ダイレクトメッセージ", icon: MessageCircle },
    { href: "/support", label: "問い合わせ", desc: "管理者へ連絡", icon: LifeBuoy },
    { href: "/ranking", label: "ランキング", desc: "継続記録の比較", icon: Trophy },
    { href: "/settings", label: "設定", desc: "各種設定", icon: Settings },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);

    // メニュー開いている間だけ背景スクロールを止める
    const originalOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow || "";
    }

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow || "";
    };
  }, [open]);

  return (
    <>
      <span className="inline-flex h-11 w-11 shrink-0 sm:hidden">
        {open ? null : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="relative z-[70] inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50"
            aria-controls="mobile-app-menu"
            aria-expanded={open}
            aria-label="メニューを開く"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </span>

      {/* オーバーレイ */}
      {open ? (
        <button
          type="button"
          aria-label="メニューを閉じる"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] bg-black/45 sm:hidden"
        />
      ) : null}

      {/* サイドシート本体：完全 fixed で右から出す */}
      <aside
        id="mobile-app-menu"
        className={[
          "fixed right-0 top-0 z-[90] h-[100dvh] w-[min(22rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]",
          "border-l border-border bg-background shadow-2xl transition-transform duration-200 ease-out sm:hidden",
          open ? "translate-x-0" : "translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div
          ref={panelRef}
          className="flex h-full min-w-0 flex-col overflow-y-auto overflow-x-hidden"
        >
          {/* ヘッダー */}
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="flex min-w-0 items-start gap-3">
              {avatar ? (
                <Image
                  src={avatar}
                  alt={displayName || "avatar"}
                  width={48}
                  height={48}
                  unoptimized
                  className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40 text-xl font-bold text-muted-foreground">
                  {(displayName ?? "?").trim().slice(0, 1) || "?"}
                </div>
              )}

              <div className="min-w-0">
                <div className="text-sm text-muted-foreground">プロフィール</div>
                <div className="truncate text-xl font-bold">
                  {(displayName ?? "").trim() || "NoName"}
                </div>
                <div className="mt-1 break-words text-sm text-muted-foreground">
                  {status || "ステータスメッセージ未設定"}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50"
              aria-controls="mobile-app-menu"
              aria-expanded={open}
              aria-label="メニューを閉じる"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          {/* 主要導線 */}
          <div className="space-y-3 p-4">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium transition hover:bg-secondary/40"
            >
              <UserRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold">プロフィール</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  自分のプロフィール情報
                </div>
              </div>
            </Link>

            <Link
              href="/profile/edit"
              onClick={() => setOpen(false)}
              className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium transition hover:bg-secondary/40"
            >
              <Pencil className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold">編集</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  名前 / アイコン / 一言
                </div>
              </div>
            </Link>

            {quickLinks.map((item) => {
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm font-medium transition hover:bg-secondary/40"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <div className="min-w-0">
                    <div className="font-semibold">{item.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.desc}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
}
