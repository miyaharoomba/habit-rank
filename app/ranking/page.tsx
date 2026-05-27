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
  return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
}

export default async function RankingPage() {
  const supabase = await createClient();

  // ログイン必須にする（ランキングは全員見る前提でも、まずは安全に）
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in"); // redirect は Server Component で使える [1](https://ihogehoge.hatenablog.com/entry/2025/04/21/153229)

  // DB関数（RPC）でランキング取得（limit_count はSQLで作った引数名）
  const { data, error } = await supabase.rpc("get_best_leaderboard", {
    limit_count: 50,
  }); // SupabaseはDB関数をRPCとして呼べる [2](https://github.com/vercel-labs)[3](https://github.com/orgs/vercel/repositories)

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ランキング</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">
              取得エラー: {error.message}
            </p>
            <div className="mt-3">
              <Link href="/app" className="text-sm text-muted-foreground hover:underline">
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
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ランキング</h1>
          <p className="text-sm text-muted-foreground">
            最高継続時間（ベスト記録）
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/app" className="text-sm text-muted-foreground hover:underline">
            /app
          </Link>
          <Link href="/settings" className="text-sm text-muted-foreground hover:underline">
            設定
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">TOP {Math.min(rows.length, 50)}</h2>
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
                      className={
                        "flex items-center justify-between rounded-lg border border-border px-4 py-3 " +
                        (isMe ? "bg-primary/10" : "bg-secondary/40")
                      }
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-10 text-sm font-bold">#{r.rank_no}</span>
                        <div className="leading-tight">
                          <div className={"font-semibold " + (isMe ? "text-primary" : "")}>
                            {r.display_name}
                            {isMe ? "（あなた）" : ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.user_id.slice(0, 8)}…
                          </div>
                        </div>
                      </div>

                      <div className="text-sm font-semibold">
                        {formatBest(Number(r.best_seconds))}
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
