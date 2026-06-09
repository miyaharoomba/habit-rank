import LiveTimer from "@/app/components/LiveTimer";
import GlobalChatBoard from "@/app/components/GlobalChatBoard";
import MobileAppMenu from "@/app/components/MobileAppMenu";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import NotificationBell from "@/app/components/NotificationBell";
import { createClient } from "@/lib/supabase/server";
import { startSession, finishSession } from "./actions";
import { redirect } from "next/navigation";
import Link from "next/link";
import { formatJstStartLabel } from "@/lib/time";
import FinishSessionButtons from "./FinishSessionButtons";

type Profile = {
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default async function AppPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <div className="p-6 text-sm text-destructive">ログイン情報が取れません</div>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path, status_message")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "";
  const avatarPath = profile?.avatar_path ?? null;
  const statusMessage = profile?.status_message?.trim() || null;

  if (!displayName) {
    redirect("/onboarding");
  }

  const { data: active } = await supabase
    .from("streak_sessions")
    .select("id, started_at")
    .eq("user_id", user.id)
    .is("ended_at", null)
    .maybeSingle();

  const startedAt = active?.started_at ?? null;
  const isRunning = Boolean(startedAt);
  const avatar = avatarUrl(avatarPath);

  return (
    <div className="min-w-0 overflow-x-hidden">
      <MobileAppMenu displayName={""} avatarPath={null} statusMessage={null} />

      <Container>
        <div className="min-w-0 overflow-x-hidden">
          <header className="min-w-0 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="break-words text-2xl font-bold tracking-tight">継続チャレンジ</h1>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                今の継続状態を見ながら、そのまま開始・終了・再開できます。
              </p>
            </div>

            <div className="flex min-w-0 items-center gap-2 self-end sm:self-start">
              <NotificationBell />
            </div>
          </header>

          <div className="mt-4 hidden min-w-0 flex-wrap items-center gap-2 overflow-x-hidden sm:flex">
            <div className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-2">
              {avatar ? (
                <img
                  src={avatar}
                  alt={displayName || "avatar"}
                  className="h-7 w-7 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/40 text-xs font-bold text-muted-foreground">
                  {(displayName || "?").slice(0, 1)}
                </div>
              )}
              <span className="min-w-0 truncate text-sm font-semibold">👤 {displayName}</span>
            </div>

            <Link href="/profile" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              プロフィール
            </Link>
            <Link href="/participants" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              参加者
            </Link>
            <Link href="/dm" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              DM
            </Link>
            <Link href="/support" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              問い合わせ
            </Link>
            <Link href="/history" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              履歴
            </Link>
            <Link href="/ranking" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              ランキング
            </Link>
            <Link href="/settings" className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40">
              設定
            </Link>
          </div>

          <div className="mt-6 grid min-w-0 gap-4 overflow-x-hidden">
            <Card>
              <CardHeader>
                <div className="min-w-0 flex flex-col gap-1">
                  <h2 className="break-words font-semibold">現在の継続</h2>
                  <p className="text-xs text-muted-foreground">リアルタイム</p>
                </div>
              </CardHeader>
              <CardBody>
                <div className="min-w-0 space-y-4 overflow-x-hidden">
                  <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-background/60 px-4 py-4">
                    <div className="min-w-0 overflow-x-auto">
                      <LiveTimer startedAt={startedAt} />
                    </div>
                    <div className="mt-2 break-words text-sm text-muted-foreground">
                      開始：{startedAt ? formatJstStartLabel(startedAt) : "未開始"}
                    </div>
                    {statusMessage ? (
                      <div className="mt-2 break-words text-xs text-muted-foreground">一言：{statusMessage}</div>
                    ) : null}
                  </div>

                  {!isRunning ? (
                    <form action={startSession} className="min-w-0">
                      <button
                        type="submit"
                        className="inline-flex max-w-full items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                      >
                        継続を開始する
                      </button>
                    </form>
                  ) : (
                    <div className="min-w-0 space-y-3">
                      <div className="break-words rounded-xl border border-amber-300/30 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                        通常は「終了して次を開始」を使ってください。
                      </div>

                      <form action={finishSession} className="min-w-0 space-y-3">
                        <div className="min-w-0">
                          <label className="mb-1 block text-sm font-medium">終了理由（任意）</label>
                          <textarea
                            name="end_reason"
                            rows={3}
                            maxLength={200}
                            placeholder="例: 休憩 / 作業終了 / いったん区切る"
                            className="w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
                          />
                        </div>

                        <FinishSessionButtons />
                      </form>
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>

            <div className="min-w-0 overflow-x-hidden">
              <GlobalChatBoard myUserId={user.id} />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
