import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import ParticipantsClient from "./ParticipantsClient";

type Row = {
  rank_no: number;
  user_id: string;
  display_name: string;
  best_seconds: number;
  current_seconds: number;
  score_seconds: number;
  is_active: boolean;
};

type Meta = {
  participant_count: number;
  my_rank: number | null;
  my_best_seconds: number;
  my_current_seconds: number;
  my_score_seconds: number;
  my_is_active: boolean;
};

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
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

export default async function RankingPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: leaderboard, error: lbErr } = await supabase.rpc("get_leaderboard_v2", {
    limit_count: 50,
  });

  const { data: metaData, error: metaErr } = await supabase.rpc("get_leaderboard_meta_v2");

  const { data: participants, error: pErr } = await supabase.rpc("get_participants_status", {
    limit_count: 200,
  });

  if (lbErr || metaErr || pErr) {
    const msg = lbErr?.message || metaErr?.message || pErr?.message || "unknown";
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ランキング</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {msg}</p>
            <div className="mt-3">
              <Link href="/app" className="text-sm text-primary hover:underline whitespace-nowrap">
                ← アプリへ戻る
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (leaderboard ?? []) as Row[];
  const meta = (metaData?.[0] ?? {
    participant_count: 0,
    my_rank: null,
    my_best_seconds: 0,
    my_current_seconds: 0,
    my_score_seconds: 0,
    my_is_active: false,
  }) as Meta;

  const people = (participants ?? []) as Participant[];

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ランキング</h1>
          <p className="text-sm text-muted-foreground">
            スコア = max(ベスト, 現在継続)
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className="px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm whitespace-nowrap">
            ← /app
          </Link>
          <Link href="/settings" className="px-3 py-2 rounded-lg border border-border bg-secondary/40 text-sm whitespace-nowrap">
            設定
          </Link>
        </div>
      </header>

      {/* 小カード3枚 */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">参加人数</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{Number(meta.participant_count)}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">あなたの順位（スコア）</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">
              {meta.my_rank ? `#${meta.my_rank}` : "-"}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">あなたのスコア</div>
              {meta.my_is_active && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary whitespace-nowrap">
                  継続中
                </span>
              )}
            </div>
            <div className="mt-1 text-2xl font-bold tabular-nums whitespace-nowrap">
              {formatTime(Number(meta.my_score_seconds))}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              ベスト: {formatTime(Number(meta.my_best_seconds))} / 現在: {formatTime(Number(meta.my_current_seconds))}
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4">
        {/* ランキング本体 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">TOP {Math.min(rows.length, 50)}</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">スコア順</span>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ記録がありません。開始→終了 or 継続中でスコアが付きます！
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
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/60 border border-border text-sm font-bold tabular-nums">
                            {r.rank_no}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={"font-semibold truncate " + (isMe ? "text-primary" : "")}>
                                {r.display_name}{isMe ? "（あなた）" : ""}
                              </span>

                              {r.is_active && (
                                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary whitespace-nowrap">
                                  継続中
                                </span>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground">
                              ベスト: {formatTime(Number(r.best_seconds))} / 現在: {formatTime(Number(r.current_seconds))}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-sm font-semibold tabular-nums whitespace-nowrap">
                            スコア: {formatTime(Number(r.score_seconds))}
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

        {/* 参加者一覧（検索付き） */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">参加者一覧</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">最新200</span>
            </div>
          </CardHeader>
          <CardBody>
            <ParticipantsClient participants={people} />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``