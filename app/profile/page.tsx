import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import LinkifiedText from "@/app/components/LinkifiedText";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
  updated_at: string | null;
};

type SessionRow = {
  id: number | string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function durationSeconds(startedAt: string, endedAt: string | null) {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  return Math.max(0, Math.floor((end - start) / 1000));
}

function formatDuration(totalSec: number) {
  const sec = Math.max(0, Math.floor(totalSec));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

export default async function ProfilePage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, status_message, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    throw new Error(error?.message ?? "profile not found");
  }

  const { data: recentSessions, error: recentErr } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false })
    .limit(20);

  if (recentErr) {
    throw new Error(recentErr.message);
  }

  const { data: allSessions, error: allErr } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: false });

  if (allErr) {
    throw new Error(allErr.message);
  }

  const row = profile as ProfileRow;
  const avatar = avatarUrl(row.avatar_path);
  const history = (recentSessions ?? []) as SessionRow[];
  const allHistory = (allSessions ?? []) as Array<
    Pick<SessionRow, "id" | "started_at" | "ended_at">
  >;

  const sessionCount = allHistory.length;
  const durations = allHistory.map((s) =>
    durationSeconds(s.started_at, s.ended_at)
  );
  const bestSeconds = durations.length > 0 ? Math.max(...durations) : 0;
  const totalSeconds = durations.reduce((sum, sec) => sum + sec, 0);

  const statusText =
    (row.status_message ?? "").trim() ||
    "ステータスメッセージはまだ設定されていません。";

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">プロフィール</h1>
          <p className="text-sm text-muted-foreground">
            自分のプロフィールと継続履歴です。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">プロフィール情報</h2>
          </CardHeader>

          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {avatar ? (
                  <img
                    src={avatar}
                    alt="avatar"
                    className="h-24 w-24 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {(row.display_name ?? "?").trim().slice(0, 1) || "?"}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold break-words">
                  {(row.display_name ?? "").trim() || "NoName"}
                </div>

                <div className="mt-2 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm break-words">
                  <LinkifiedText text={statusText} showPreview />
                </div>

                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">継続回数</div>
                    <div className="mt-1 text-lg font-bold tabular-nums">
                      {sessionCount}回
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">最長記録</div>
                    <div className="mt-1 text-sm font-bold tabular-nums break-words">
                      {sessionCount > 0 ? formatDuration(bestSeconds) : "記録なし"}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
                    <div className="text-xs text-muted-foreground">総継続時間</div>
                    <div className="mt-1 text-sm font-bold tabular-nums break-words">
                      {sessionCount > 0 ? formatDuration(totalSeconds) : "記録なし"}
                    </div>
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
                  <div>ユーザーID: {row.id}</div>
                  <div>更新日時: {row.updated_at ? formatJst(row.updated_at) : "-"}</div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">継続履歴</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                直近20件
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ表示できる継続履歴がありません。
              </p>
            ) : (
              <ul className="space-y-3">
                {history.map((s) => (
                  <li key={String(s.id)}>
                    <Link
                      href={`/results/${s.id}`}
                      className="block rounded-xl border border-border bg-secondary/30 px-4 py-3 hover:bg-secondary/40 transition"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold tabular-nums">
                          継続時間:{" "}
                          {formatDuration(durationSeconds(s.started_at, s.ended_at))}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          開始: {formatJst(s.started_at)}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          終了: {s.ended_at ? formatJst(s.ended_at) : "-"}
                        </div>

                        <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          理由: {(s.end_reason ?? "").trim() || "記録なし"}
                        </div>

                        <div className="mt-2 text-[11px] text-primary font-semibold">
                          結果画面を見る →
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``