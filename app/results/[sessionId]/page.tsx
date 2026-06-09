import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import CorrectionSheet from "./CorrectionSheet";

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { days, hours, minutes, seconds };
}

export default async function ResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { sessionId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");

  const { data: sess, error } = await supabase
    .from("streak_sessions")
    .select("id, user_id, started_at, ended_at, end_reason")
    .eq("id", sessionId)
    .maybeSingle();

  if (error || !sess) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">継続リザルト</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">結果が見つかりません。</p>
            <div className="mt-3">
              <Link className="text-sm text-primary hover:underline" href="/app">
                /appへ戻る
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const s = new Date(sess.started_at);
  const e = sess.ended_at ? new Date(sess.ended_at) : null;
  const diff = e ? e.getTime() - s.getTime() : 0;
  const d = formatDuration(diff);

  const { data: prof } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", sess.user_id)
    .maybeSingle();

  const name = (prof?.display_name ?? "").trim() || "NoName";
  const reason = (sess.end_reason ?? "").trim() || "finished";
  const isOwner = sess.user_id === user.id;

  const corrected = typeof sp.corrected === "string" ? sp.corrected : "";
  const correctionError = typeof sp.correction_error === "string" ? decodeURIComponent(sp.correction_error) : "";
  const createdId = typeof sp.created === "string" ? sp.created : "";

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">継続リザルト</h1>
          <p className="text-sm text-muted-foreground">{name} の継続結果</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40" href="/app">
            /app
          </Link>
          <Link className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40" href="/ranking">
            /ranking
          </Link>
          <Link className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40" href="/dm">
            /dm
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        {corrected ? (
          <Card>
            <CardBody>
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                {corrected === "adjust" && "記録を修正しました。"}
                {corrected === "merge" && "誤って終了した記録を次の継続へ結合しました。"}
                {corrected === "split" && (
                  <>
                    記録を分割して補正しました。
                    {createdId ? ` 新しい履歴ID: ${createdId}` : ""}
                  </>
                )}
              </div>
            </CardBody>
          </Card>
        ) : null}

        {correctionError ? (
          <Card>
            <CardBody>
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                補正に失敗しました: {correctionError}
              </div>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <h2 className="font-semibold">継続時間</h2>
          </CardHeader>
          <CardBody>
            <div className="rounded-xl border border-border bg-background/60 px-4 py-4">
              <div className="text-2xl font-bold tabular-nums">
                {d.days}日 {d.hours}時間 {d.minutes}分 {d.seconds}秒
              </div>
              <div className="mt-2 text-sm text-muted-foreground break-words">
                開始: {formatJst(sess.started_at)} / 終了: {sess.ended_at ? formatJst(sess.ended_at) : "-"}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">終了理由</h2>
          </CardHeader>
          <CardBody>
            <div className="rounded-xl border border-border bg-background/60 px-4 py-4 text-sm break-words whitespace-pre-wrap">
              {reason}
            </div>
          </CardBody>
        </Card>

        {isOwner ? (
          <CorrectionSheet
            session={{
              id: Number(sess.id),
              started_at: sess.started_at,
              ended_at: sess.ended_at,
              end_reason: sess.end_reason,
            }}
          />
        ) : null}
      </div>
    </Container>
  );
}
