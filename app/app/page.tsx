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

export default async function AppPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <div>ログイン情報が取れません</div>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path, status_message")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "";
  const avatarPath = profile?.avatar_path ?? null;
  const statusMessage = profile?.status_message ?? null;

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

  return (
    <Container>
      <div className="space-y-3 sm:space-y-6">
        {/* ヘッダー */}
        <header className="flex items-center justify-between gap-3 pt-1">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] leading-[1.05] font-extrabold tracking-tight whitespace-nowrap sm:text-5xl">
              継続チャレンジ
            </h1>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <NotificationBell />
            <div className="sm:hidden">
              <MobileAppMenu
                displayName={displayName}
                avatarPath={avatarPath}
                statusMessage={statusMessage}
              />
            </div>
          </div>
        </header>

        {/* PCサブ導線 */}
        <div className="hidden sm:flex items-center justify-between gap-4">
          <div className="min-w-0 text-sm text-muted-foreground truncate">
            👤{" "}
            <Link href="/profile" className="hover:underline">
              {displayName}
            </Link>
          </div>

          <nav className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/profile" className="text-primary hover:underline">
              プロフィール
            </Link>
            <Link href="/participants" className="text-primary hover:underline">
              参加者
            </Link>
            <Link href="/dm" className="text-primary hover:underline">
              DM
            </Link>
            <Link href="/support" className="text-primary hover:underline">
              問い合わせ
            </Link>
            <Link href="/history" className="text-primary hover:underline">
              履歴
            </Link>
            <Link href="/ranking" className="text-primary hover:underline">
              ランキング
            </Link>
            <Link href="/settings" className="text-primary hover:underline">
              設定
            </Link>
          </nav>
        </div>

        {/* 現在の継続 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 px-3 py-3 sm:px-6 sm:py-4">
              <h2 className="text-xl sm:text-3xl font-bold tracking-tight">
                現在の継続
              </h2>
              <span className="shrink-0 text-[11px] sm:text-sm text-muted-foreground">
                リアルタイム
              </span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="px-3 pb-3 sm:px-6 sm:pb-6">
              <div className="space-y-3 sm:space-y-5">
                {/* タイマー */}
                <div className="space-y-1.5">
                  <div className="overflow-hidden">
                    <div className="w-max origin-left scale-[0.72] sm:scale-100 h-[72px] sm:h-auto">
                      <LiveTimer startedAt={startedAt} />
                    </div>
                  </div>

                  <div className="text-sm sm:text-lg text-muted-foreground break-words">
                    開始：{startedAt ? formatJstStartLabel(startedAt) : "未開始"}
                  </div>
                </div>

                {!isRunning ? (
                  <form action={startSession}>
                    <button
                      type="submit"
                      className="w-full h-12 sm:h-14 rounded-xl bg-primary text-primary-foreground text-base sm:text-xl font-bold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      継続を開始する
                    </button>
                  </form>
                ) : (
                  <form action={finishSession} className="space-y-3">
                    <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-2.5">
                      <p className="text-sm sm:text-base font-semibold text-primary leading-relaxed">
                        通常は「終了して次を開始」を使ってください。
                      </p>
                    </div>

                    <textarea
                      name="end_reason"
                      rows={2}
                      maxLength={200}
                      placeholder="終了理由（任意・200文字以内）"
                      className="w-full rounded-xl border border-input bg-background px-3 py-3 text-sm sm:text-base text-foreground placeholder:text-muted-foreground resize-none"
                    />

                    <div className="grid gap-2">
                      <button
                        type="submit"
                        name="mode"
                        value="restart"
                        className="w-full h-12 sm:h-14 rounded-xl bg-primary text-primary-foreground text-base sm:text-xl font-bold hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        終了して次を開始
                      </button>

                      <button
                        type="submit"
                        name="mode"
                        value="stop"
                        className="w-full h-11 sm:h-14 rounded-xl border border-border bg-background text-base sm:text-xl font-bold hover:bg-secondary/40 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        完全に終了
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </CardBody>
        </Card>

        {/* 掲示板見出しは GlobalChatBoard 側で出る */}
        <GlobalChatBoard myUserId={user.id} />
      </div>
    </Container>
  );
}