import LiveTimer from "@/app/components/LiveTimer";
import GlobalChatBoard from "@/app/components/GlobalChatBoard";
import MobileAppMenu from "@/app/components/MobileAppMenu";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import NotificationBell from "@/app/components/NotificationBell";

import { createClient } from "@/lib/supabase/server";
import { startSession, finishSession } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";

import { formatJst, formatJstStartLabel } from "@/lib/time";

export default async function AppPage() {
  const supabase = await createClient();

  // ログイン中ユーザー
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <Container>
        <div className="text-sm text-destructive">ログイン情報が取れません</div>
      </Container>
    );
  }

  // 表示名
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "";

  // 初回：名前未設定なら onboarding へ
  if (!displayName) {
    redirect("/onboarding");
  }

  // 継続中セッション（自分のもの）
  const { data: active } = await supabase
    .from("streak_sessions")
    .select("id, started_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .maybeSingle();

  const startedAt = active?.started_at ?? null;
  const isRunning = Boolean(startedAt);

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">継続チャレンジ</h1>
        </div>

        {/* 右側：ユーザー名 + ベル + メニュー */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="text-sm text-muted-foreground mr-1 whitespace-nowrap hidden sm:block">
            👤 {displayName}
          </div>

          <NotificationBell />

          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <Link
              href="/participants"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              参加者
            </Link>

            <Link
              href="/dm"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              DM
            </Link>

            <Link
              href="/support"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              問い合わせ
            </Link>

            <Link
              href="/history"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              履歴
            </Link>

            <Link
              href="/ranking"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              ランキング
            </Link>

            <Link
              href="/settings"
              className="text-sm text-primary hover:underline whitespace-nowrap"
            >
              設定
            </Link>
          </div>

          <div className="sm:hidden">
            <MobileAppMenu displayName={displayName} />
          </div>
        </div>
      </header>

      <div className="mt-4 grid gap-3 sm:mt-6 sm:gap-4">
       {/* 現在の継続 */}
<Card>
  <CardHeader>
    <div className="flex items-center justify-between">
      <h2 className="font-semibold">現在の継続</h2>
      <span className="text-xs text-muted-foreground">リアルタイム</span>
    </div>
  </CardHeader>

  <CardBody>
    <div className="text-3xl sm:text-4xl font-extrabold tracking-tight">
      <LiveTimer startedAt={startedAt} />
    </div>

    <div className="mt-2 text-sm text-muted-foreground tabular-nums">
      {startedAt ? (
        <span>開始：{formatJstStartLabel(startedAt)}</span>
      ) : (
        <span>開始：未開始</span>
      )}
    </div>

    <div className="mt-4 flex flex-col gap-3">
      {!isRunning ? (
        <form action={startSession}>
          <button
            type="submit"
            className="w-full rounded-2xl bg-primary text-primary-foreground px-4 py-4 text-base font-bold shadow-sm hover:opacity-90"
          >
            継続を開始する
          </button>
        </form>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary font-semibold">
            終了方法を選べます。通常は「終了して次を開始」を使ってください。
          </div>

          <form action={finishSession} className="space-y-3">
            <textarea
              name="end_reason"
              placeholder="終了理由（任意：200文字以内）例：仕事が忙しい、体調不良、達成した など"
              className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
              rows={2}
              maxLength={200}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="submit"
                name="mode"
                value="restart"
                className="rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-bold hover:opacity-90"
              >
                終了して次を開始
              </button>

              <Button
                type="submit"
                name="mode"
                value="stop"
                variant="ghost"
                className="w-full"
              >
                完全に終了
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="text-xs text-muted-foreground tabular-nums">
        started_at: {startedAt ? formatJst(startedAt) : "(未開始)"}
      </div>
    </div>
  </CardBody>
</Card>

        {/* 全体掲示板 */}
        <GlobalChatBoard myUserId={user.id} />
      </div>
    </Container>
  );
}