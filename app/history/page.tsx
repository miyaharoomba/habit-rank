import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import {
  MainLink,
  PageHeader,
  ParticipantsLink,
  RankingLink,
} from "@/app/components/AppPageHeader";

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
      <PageHeader
        title="履歴"
        description={
          <>
            {displayName} の継続履歴（最新50件）
          </>
        }
        actions={
          <>
            <MainLink />
            <RankingLink />
            <ParticipantsLink />
          </>
        }
      />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <h2 className="font-semibold">終了済みセッション一覧</h2>
              <p className="text-xs text-muted-foreground">
                結果を見ると詳細を確認できます。補正するを押すとその記録を修正できます。
              </p>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                まだ履歴がありません。開始→終了してみて！
              </div>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => {
                  const s = new Date(row.started_at);
                  const e = row.ended_at ? new Date(row.ended_at) : null;
                  const diff = e ? e.getTime() - s.getTime() : 0;
                  const { days, hours, minutes, seconds } = formatDuration(diff);
                  const reason =
                    row.end_reason && row.end_reason.trim()
                      ? `理由: ${row.end_reason}`
                      : "理由: finished";

                  return (
                    <li
                      key={row.id}
                      className="rounded-xl border border-border bg-background/60 px-4 py-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="text-base font-bold tabular-nums break-words">
                              {days}日 {hours}時間 {minutes}分 {seconds}秒
                            </div>

                            <div className="mt-1 text-xs text-muted-foreground break-words tabular-nums">
                              開始: {formatJst(row.started_at)} / 終了:{" "}
                              {row.ended_at ? formatJst(row.ended_at) : "-"}
                            </div>

                            <div className="mt-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                              {reason}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Link
                              href={`/results/${row.id}`}
                              className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40"
                            >
                              結果を見る
                            </Link>
                            <Link
                              href={`/results/${row.id}?openCorrection=1`}
                              className="inline-flex items-center rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                            >
                              補正する
                            </Link>
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
