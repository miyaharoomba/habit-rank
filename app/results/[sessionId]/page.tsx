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

export default async function ResultPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

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
            <p className="text-sm text-destructive">結果が見つかりません。</p>
            <div className="mt-3 flex gap-2">
              <Link href="/app" className="text-primary hover:underline">
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

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">継続リザルト</h1>
          <p className="text-sm text-muted-foreground">{name} の継続結果</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className="text-sm text-primary hover:underline">
            /app
          </Link>
          <Link href="/ranking" className="text-sm text-primary hover:underline">
            /ranking
          </Link>
          <Link href="/dm" className="text-sm text-primary hover:underline">
            /dm
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">継続時間</h2>
          </CardHeader>
          <CardBody>
            <div className="text-2xl font-bold tabular-nums">
              {d.days}日 {d.hours}時間 {d.minutes}分 {d.seconds}秒
            </div>
            <div className="mt-2 text-xs text-muted-foreground tabular-nums">
              開始: {formatJst(sess.started_at)} / 終了:{" "}
              {sess.ended_at ? formatJst(sess.ended_at) : "-"}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">終了理由</h2>
          </CardHeader>
          <CardBody>
            <div className="rounded-lg border border-border bg-secondary/30 px-3 py-3 text-sm whitespace-pre-wrap break-words">
              {reason}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
