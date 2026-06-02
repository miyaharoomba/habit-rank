// app/history/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

type HistoryRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

export default async function HistoryPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/sign-in");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "NoName";

  const { data: history, error: hErr } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(50);

  if (hErr) {
    throw new Error(hErr.message);
  }

  const rows = (history ?? []) as HistoryRow[];

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">履歴</h1>
          <p className="text-sm text-muted-foreground">
            {displayName} の継続履歴（最新50件）
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/ranking">
            /ranking
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/participants">
            /participants
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">終了済みセッション一覧</h2>
              <span className="text-xs text-muted-foreground">
                結果を押すと詳細を開けます
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ履歴がありません。開始→終了してみて！
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const s = new Date(row.started_at);
                  const e = row.ended_at ? new Date(row.ended_at) : null;
                  const diff = e ? e.getTime() - s.getTime() : 0;
                  const { days, hours, minutes, seconds } = formatDuration(diff);

                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-border bg-secondary/30 px-4 py-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="font-semibold tabular-nums break-words">
                            {days}日 {hours}時間 {minutes}分 {seconds}秒
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            開始: {formatJst(row.started_at)} / 終了:{" "}
                            {row.ended_at ? formatJst(row.ended_at) : "-"}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            {row.end_reason && row.end_reason.trim()
                              ? `理由: ${row.end_reason}`
                              : "理由: finished"}
                          </div>
                        </div>

                        <div className="text-sm whitespace-nowrap">
                          <Link
                            href={`/results/${row.id}`}
                            className="text-primary hover:underline"
                          >
                            結果を見る →
                          </Link>
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
``