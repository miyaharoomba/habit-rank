"use client";

import {
  Award,
  Bell,
  Camera,
  ChartColumnIncreasing,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  GalleryVerticalEnd,
  Gamepad2,
  MessageCircle,
  MessageSquareText,
  Play,
  Trophy,
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
    title: "継続チャレンジを始める",
    description: "メイン画面のタイマーで、現在の継続時間を記録します。",
    icon: Play,
    points: [
      "開始ボタンで継続チャレンジを始める",
      "進行中はアプリを閉じても継続時間が保持される",
      "終了後はそのまま次のチャレンジを開始できる",
    ],
  },
  {
    title: "終了リザルトを残す",
    description: "継続を終えた瞬間を、あとから振り返れる記録にします。",
    icon: Camera,
    points: [
      "終了理由と、その場で撮影した写真を記録できる",
      "継続時間に応じたXPとレベルアップ結果を確認",
      "リザルトにはコメント、返信、リアクションを送れる",
    ],
  },
  {
    title: "みんなの記録を見る",
    description: "複数ユーザーの新しいリザルトを、ひとつの画面で確認できます。",
    icon: GalleryVerticalEnd,
    points: [
      "継続時間、獲得XP、写真、終了理由を一覧表示",
      "名前から相手のプロフィールや過去の記録へ移動",
      "気になった記録にはその場でリアクションできる",
    ],
  },
  {
    title: "公開チャットで話す",
    description: "掲示板は、参加者全員が読めるオープンな交流場所です。",
    icon: MessageSquareText,
    points: [
      "文章、画像、動画、ファイルを投稿できる",
      "メッセージへの返信、編集、削除、リアクションに対応",
      "メイン画面上部の掲示板ボタンからすぐに開ける",
    ],
  },
  {
    title: "DMで個別に話す",
    description: "特定の相手とは、公開されない1対1のチャットが使えます。",
    icon: MessageCircle,
    points: [
      "相手のプロフィールからDMを開始できる",
      "既読、返信、編集、削除、リアクションに対応",
      "画像やファイルの送信、問題がある会話の通報もできる",
    ],
  },
  {
    title: "レベルと称号を育てる",
    description: "継続の積み重ねが、プロフィール上の成長として残ります。",
    icon: Award,
    points: [
      "長く継続するほど1分あたりの獲得XPが増える",
      "条件を達成するとトロフィーや称号を獲得",
      "選んだ称号とレベルはDMや掲示板にも表示される",
    ],
  },
  {
    title: "ランキングで比較する",
    description: "継続の強さと成長を、参加者同士で比較できます。",
    icon: Trophy,
    points: [
      "現在進行中の継続時間ランキング",
      "過去最高の継続時間ランキング",
      "累計XPとレベルの成長ランキング",
    ],
  },
  {
    title: "記録を振り返る",
    description: "時間の変化を、一覧・カレンダー・グラフで確認できます。",
    icon: ChartColumnIncreasing,
    points: [
      "履歴とカレンダーで過去の記録を確認",
      "週間・月間レポートで継続時間や獲得XPを比較",
      "折れ線グラフから日ごとの変化を把握できる",
    ],
  },
  {
    title: "ミニゲームでひと休み",
    description: "短いゲームで息抜きしながら、みんなと記録を競えます。",
    icon: Gamepad2,
    points: [
      "Stack TowerとPulse Runnerをゲーム一覧からプレイ",
      "今日・今週・歴代ランキングでほかのユーザーと競争",
      "1日3回までXPを獲得でき、ゲーム限定称号も解放できる",
    ],
  },
  {
    title: "通知と設定を整える",
    description: "必要な情報だけを受け取り、自分に合った状態で使えます。",
    icon: Bell,
    points: [
      "通知ベル、トースト、端末通知で新着を確認",
      "DM、継続終了、コメントなどを種類別にオン・オフ",
      "テーマ変更、問い合わせ、ログアウト、アカウント削除にも対応",
    ],
  },
];

function storageKey(userId: string) {
  return `habitbase:tutorial:v2:${userId}`;
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
