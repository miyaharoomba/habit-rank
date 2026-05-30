import LiveTimer from "@/app/components/LiveTimer";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import NotificationBell from "@/app/components/NotificationBell";

import { createClient } from "@/lib/supabase/server";
import { startSession, finishSession } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";

import { formatJst, formatJstStartLabel } from "@/lib/time";

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

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

  // 履歴（終了済み）最新10件
  const { data: history } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(10);

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">継続チャレンジ</h1>
        </div>

        {/* 右側：ユーザー名 + ベル + メニュー */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div className="text-sm text-muted-foreground mr-1 whitespace-nowrap">
            👤 {displayName}
          </div>

          <NotificationBell />

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
      </header>

      <div className="mt-6 grid gap-4">
        {/* 現在の継続 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">現在の継続</h2>
              <span className="text-xs text-muted-foreground">リアルタイム</span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="text-4xl font-extrabold tracking-tight">
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
              <div className="flex flex-wrap gap-3">
                <form action={startSession}>
                  <Button type="submit" disabled={!!startedAt}>
                    開始
                  </Button>
                </form>

                <form action={finishSession} className="flex-1 min-w-[260px]">
                  <input type="hidden" name="end_reason" value="" />
                  <div className="flex flex-col gap-2">
                    <textarea
                      name="end_reason"
                      placeholder="終了理由（任意：200文字以内）例：仕事が忙しい、体調不良、達成した など"
                      className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                      rows={2}
                      maxLength={200}
                      disabled={!startedAt}
                    />
                    <Button type="submit" variant="ghost" disabled={!startedAt}>
                      終了（理由を保存）
                    </Button>
                  </div>
                </form>
              </div>

              <div className="text-xs text-muted-foreground tabular-nums">
                started_at: {startedAt ? formatJst(startedAt) : "(未開始)"}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 履歴 */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">履歴（最新10件）</h2>
          </CardHeader>

          <CardBody>
            {history && history.length > 0 ? (
              <ul className="space-y-3">
                {history.map((row) => {
                  const s = new Date(row.started_at);
                  const e = row.ended_at ? new Date(row.ended_at) : null;
                  const diff = e ? e.getTime() - s.getTime() : 0;
                  const { days, hours, minutes, seconds } = formatDuration(diff);

                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-border bg-secondary/40 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold tabular-nums">
                          {days}日 {hours}時間 {minutes}分 {seconds}秒
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {row.end_reason && row.end_reason.trim()
                            ? `理由: ${row.end_reason}`
                            : "理由: finished"}
                        </span>
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                        開始: {formatJst(row.started_at)} / 終了:{" "}
                        {row.ended_at ? formatJst(row.ended_at) : "-"}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                まだ履歴がありません。開始→終了してみて！
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}