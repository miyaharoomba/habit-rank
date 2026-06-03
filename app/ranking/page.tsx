import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

// JST固定フォーマッタ
import { formatJstStartLabel } from "@/lib/time";

type BestRow = {
  rank_no: number;
  user_id: string;
  display_name: string;
  best_seconds: number;
};

type CurrentRow = {
  rank_no: number;
  user_id: string;
  display_name: string;
  current_seconds: number;
  started_at: string;
};

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "current" ? "current" : "best";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const limit_count = 50;

  const bestRes =
    activeTab === "best"
      ? await supabase.rpc("get_best_leaderboard", { limit_count })
      : { data: null as any, error: null as any };

  const currentRes =
    activeTab === "current"
      ? await supabase.rpc("get_current_leaderboard", { limit_count })
      : { data: null as any, error: null as any };

  const error = bestRes.error ?? currentRes.error;

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ランキング</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/app">
                ← /app
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/settings">
                設定
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const bestRows = (bestRes.data ?? []) as BestRow[];
  const currentRows = (currentRes.data ?? []) as CurrentRow[];

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ランキング</h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "best" ? "ベスト（過去最高）順" : "継続中（現在経過）順"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline whitespace-nowrap" href="/app">
            ← /app
          </Link>
          <Link className="text-sm text-primary hover:underline whitespace-nowrap" href="/dm">
            /dm
          </Link>
          <Link className="text-sm text-primary hover:underline whitespace-nowrap" href="/settings">
            設定
          </Link>
        </div>
      </header>

      {/* タブ */}
      <div className="mt-5 flex gap-2">
        <Link
          href="/ranking?tab=best"
          className={[
            "rounded-lg border border-border px-3 py-2 text-sm font-semibold whitespace-nowrap",
            activeTab === "best" ? "bg-primary text-primary-foreground" : "bg-secondary/40",
          ].join(" ")}
        >
          ベスト
        </Link>

        <Link
          href="/ranking?tab=current"
          className={[
            "rounded-lg border border-border px-3 py-2 text-sm font-semibold whitespace-nowrap",
            activeTab === "current" ? "bg-primary text-primary-foreground" : "bg-secondary/40",
          ].join(" ")}
        >
          継続中
        </Link>
      </div>

      {/* 本体 */}
      <div className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">
                TOP {Math.min(50, activeTab === "best" ? bestRows.length : currentRows.length)}
              </h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {activeTab === "best" ? "過去最高" : "現在経過"}
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {activeTab === "best" ? (
              bestRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  まだベスト記録がありません。開始→終了で記録を作ってみて！
                </p>
              ) : (
                <ul className="space-y-2">
                  {bestRows.map((r) => {
                    const isMe = r.user_id === user.id;

                    return (
                      <li
                        key={r.user_id}
                        className={[
                          "rounded-xl border border-border px-4 py-3 bg-secondary/40",
                          isMe ? "ring-1 ring-primary/40 bg-primary/10" : "",
                        ].join(" ")}
                      >
                        {/* ベスト側だけ、モバイルでは縦寄せにする */}
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background/60 border border-border text-sm font-bold tabular-nums">
                              {r.rank_no}
                            </span>

                            <div className="min-w-0 flex-1">
                              <div
                                className={[
                                  "font-semibold leading-tight break-words sm:truncate",
                                  isMe ? "text-primary" : "",
                                ].join(" ")}
                              >
                                {r.display_name}
                                {isMe ? "（あなた）" : ""}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                ベスト記録
                              </div>
                            </div>
                          </div>

                          {/* モバイルでは下段に逃がす */}
                          <div className="pl-11 sm:pl-0 text-left sm:text-right">
                            <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                              {formatTime(Number(r.best_seconds))}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : currentRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                継続中の人がいません（誰も継続中状態ではない）。
              </p>
            ) : (
              <ul className="space-y-2">
                {currentRows.map((r) => {
                  const isMe = r.user_id === user.id;

                  return (
                    <li
                      key={r.user_id}
                      className={[
                        "rounded-xl border border-border px-4 py-3 bg-secondary/40",
                        isMe ? "ring-1 ring-primary/40 bg-primary/10" : "",
                      ].join(" ")}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/60 border border-border text-sm font-bold tabular-nums">
                            {r.rank_no}
                          </span>

                          <div className="min-w-0">
                            <div
                              className={[
                                "font-semibold truncate",
                                isMe ? "text-primary" : "",
                              ].join(" ")}
                            >
                              {r.display_name}
                              {isMe ? "（あなた）" : ""}
                            </div>

                            <div className="text-xs text-muted-foreground tabular-nums">
                              開始：{formatJstStartLabel(r.started_at)}
                            </div>
                          </div>
                        </div>

                        <div className="text-left sm:text-right pl-11 sm:pl-0">
                          <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                            {formatTime(Number(r.current_seconds))}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            継続中
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
