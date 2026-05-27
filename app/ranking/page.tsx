import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

type Row = {
  rank_no: number;
  user_id: string;
  display_name: string;
  best_seconds: number;
};

function formatBest(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  // スマホで見やすいように「0日」は省略してもOK（好み）
  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

export default async function RankingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data, error } = await supabase.rpc("get_best_leaderboard", {
    limit_count: 50,
  });

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ランキング</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
            <div className="mt-3">
              <Link href="/app" className="text-sm text-primary hover:underline">
                ← アプリへ戻る
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (data ?? []) as Row[];

  return (
    <Container>
      {/* ✅ スマホは縦積み、sm以上で横並び */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ランキング</h1>
          <p className="text-sm text-muted-foreground">
            最高継続時間（ベスト記録）
          </p>
        </div>

        {/* ✅ スマホで折り返しても崩れないボタン群 */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/app"
            className="whitespace-nowrap rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            ← /app
          </Link>
          <Link
            href="/settings"
            className="whitespace-nowrap rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm font-semibold hover:bg-secondary"
          >
            設定
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">TOP {Math.min(rows.length, 50)}</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                ベスト記録順
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ「終了した記録」がありません。開始→終了で記録を作ってみて！
              </p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => {
                  const isMe = r.user_id === user.id;

                  return (
                    <li
                      key={r.user_id}
                      className={[
                        "rounded-xl border border-border px-4 py-3",
                        "bg-secondary/40",
                        isMe ? "ring-1 ring-primary/40 bg-primary/10" : "",
                      ].join(" ")}
                    >
                      {/* ✅ スマホは縦、sm以上は横 */}
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        {/* 左側：順位＋名前 */}
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/60 border border-border text-sm font-bold tabular-nums">
                            {r.rank_no}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className={[
                                  "font-semibold truncate",
                                  isMe ? "text-primary" : "",
                                ].join(" ")}
                                title={r.display_name}
                              >
                                {r.display_name}
                              </span>

                              {isMe && (
                                <span className="whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                                  あなた
                                </span>
                              )}
                            </div>

                            {/* ✅ スマホではID非表示、sm以上で表示 */}
                            <div className="hidden sm:block text-xs text-muted-foreground">
                              {r.user_id.slice(0, 8)}…
                            </div>
                          </div>
                        </div>

                        {/* 右側：時間（数字が揃うと気持ちいい） */}
                        <div className="text-right sm:text-right">
                          <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                            {formatBest(Number(r.best_seconds))}
                          </div>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            ベスト
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