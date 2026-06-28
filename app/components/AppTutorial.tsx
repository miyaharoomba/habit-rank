"use client";

import {
  Bell,
  ChartColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  GalleryVerticalEnd,
  Play,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState } from "react";

type TutorialStep = {
  title: string;
  description: string;
  icon: LucideIcon;
  points: string[];
};

const STEPS: TutorialStep[] = [
  {
    title: "継続を記録する",
    description: "メイン画面のタイマーが、HabitBaseの中心です。",
    icon: Play,
    points: [
      "開始ボタンで継続チャレンジを始める",
      "終了時は理由や、その場で撮った写真を残せる",
      "継続時間に応じてXPとレベルが上がる",
    ],
  },
  {
    title: "みんなの記録を見る",
    description: "新しいリザルトや交流は、上部の専用ボタンから開けます。",
    icon: GalleryVerticalEnd,
    points: [
      "みんなの記録で複数ユーザーの成果を一覧表示",
      "リザルトにリアクションやコメントを送れる",
      "掲示板では全員と気軽に会話できる",
    ],
  },
  {
    title: "通知とDMを使う",
    description: "新しい反応やメッセージを見逃さずに確認できます。",
    icon: Bell,
    points: [
      "通知ベルから未読のお知らせを確認",
      "プロフィールから相手とのDMを開始",
      "通知の種類は設定画面で個別に変更できる",
    ],
  },
  {
    title: "成長を振り返る",
    description: "履歴、レポート、ランキングから積み重ねを確認できます。",
    icon: ChartColumnIncreasing,
    points: [
      "履歴とカレンダーで過去の記録を確認",
      "週間・月間レポートで変化を比較",
      "ランキング、トロフィー、称号で成長を楽しむ",
    ],
  },
];

function storageKey(userId: string) {
  return `habitbase:tutorial:v1:${userId}`;
}

export default function AppTutorial({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const titleId = useId();
  const step = STEPS[stepIndex];
  const lastStep = stepIndex === STEPS.length - 1;
  const Icon = step.icon;

  useEffect(() => {
    try {
      const key = storageKey(userId);
      if (window.localStorage.getItem(key) !== "seen") {
        window.localStorage.setItem(key, "seen");
        setStepIndex(0);
        setOpen(true);
      }
    } catch {
      // Storage can be unavailable in strict privacy modes. The help button remains usable.
    }
  }, [userId]);

  useEffect(() => {
    if (!open) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const reopen = () => {
    setStepIndex(0);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={reopen}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-label="使い方を見る"
        title="使い方"
      >
        <CircleHelp className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-muted-foreground">
                  はじめてガイド
                </div>
                <div className="mt-1 text-sm font-semibold tabular-nums">
                  {stepIndex + 1} / {STEPS.length}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary/50"
                aria-label="チュートリアルを閉じる"
                title="閉じる"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div className="px-5 py-6 sm:px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 id={titleId} className="mt-4 text-xl font-bold tracking-tight">
                {step.title}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {step.description}
              </p>

              <div className="mt-5 divide-y divide-border border-y border-border">
                {step.points.map((point, index) => (
                  <div key={point} className="flex items-start gap-3 py-3 text-sm leading-6">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-bold text-primary">
                      {index + 1}
                    </span>
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
                disabled={stepIndex === 0}
                className="inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                戻る
              </button>

              <div className="flex items-center gap-1.5" aria-hidden="true">
                {STEPS.map((item, index) => (
                  <span
                    key={item.title}
                    className={[
                      "h-1.5 rounded-full transition-all",
                      index === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-border",
                    ].join(" ")}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (lastStep) setOpen(false);
                  else setStepIndex((current) => Math.min(STEPS.length - 1, current + 1));
                }}
                className="inline-flex h-11 items-center justify-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
              >
                {lastStep ? "完了" : "次へ"}
                {!lastStep ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : null}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
