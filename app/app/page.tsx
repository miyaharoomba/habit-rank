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
import { formatJst, formatJstStartLabel } from "@/lib/time";

export default async function AppPage() {
  const supabase = await createClient();

  // ログイン中ユーザー
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return <div>ログイン情報が取れません</div>;
  }

  // 表示名・アイコン・ステータスメッセージ
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, avatar_path, status_message")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "";
  const avatarPath = profile?.avatar_path ?? null;
  const statusMessage = profile?.status_message ?? null;

  // 初回：名前未設定なら onboarding へ
  if (!displayName) {
    redirect("/onboarding");
  }

  // 継続中セッション（自分のもの）
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
      <div className="space-y-5 sm:space-y-7">
        {/* ヘッダー */}
        <header className="flex items-start justify-between gap-3 pt-1 sm:pt-2">
          <div className="min-w-0 flex-1">
            <h1 className="text-[clamp(2rem,8vw,3.6rem)] font-extrabold tracking-tight leading-[0.95]">
              継続チャレンジ
            </h1>
          </div>

          <div className="shrink-0 flex items-center gap-2 sm:gap-3 pt-1">
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
            <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6 sm:py-5">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                現在の継続
              </h2>
              <span className="shrink-0 text-xs sm:text-sm text-muted-foreground">
                リアルタイム
              </span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-5 px-4 py-5 sm:space-y-6 sm:px-6 sm:py-6">
              <div className="space-y-2">
                <div className="overflow-hidden">
                  <LiveTimer startedAt={startedAt} />
                </div>

                <div className="text-lg sm:text-xl text-muted-foreground break-words">
                  開始：{startedAt ? formatJstStartLabel(startedAt) : "未開始"}
                </div>
              </div>

              {!isRunning ? (
                <form action={startSession}>
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-primary text-primary-foreground h-13 sm:h-14 text-lg sm:text-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    継続を開始する
                  </button>
                </form>
              ) : (
                <form action={finishSession} className="space-y-4">
                  <div className="rounded-2xl border border-primary/30 bg-primary/10 px-4 py-4 sm:px-5 sm:py-4">
                    <p className="text-base sm:text-lg font-semibold text-primary leading-relaxed">
                      終了方法を選べます。通常は「終了して次を開始」を使ってください。
                    </p>
                  </div>

                  <textarea
                    name="end_reason"
                    maxLength={200}
                    rows={3}
                    placeholder="終了理由（任意：200文字以内） 例：仕事が忙しい、体調不良、達成した など"
                    className="w-full rounded-2xl border border-input bg-background px-4 py-4 text-base sm:text-lg text-foreground placeholder:text-muted-foreground resize-none"
                  />

                  <div className="grid gap-3">
                    <button
                      type="submit"
                      name="mode"
                      value="restart"
                      className="w-full rounded-lg bg-primary text-primary-foreground h-14 sm:h-14 text-lg sm:text-xl font-bold disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      終了して次を開始
                    </button>

                    <button
                      type="submit"
                      name="mode"
                      value="stop"
                      className="w-full rounded-lg border border-border bg-background h-13 sm:h-14 text-lg sm:text-xl font-bold hover:bg-secondary/40 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      完全に終了
                    </button>
                  </div>

                  <div className="hidden sm:block text-xs text-muted-foreground tabular-nums break-all">
                    started_at: {startedAt ? formatJst(startedAt) : "(未開始)"}
                  </div>
                </form>
              )}
            </div>
          </CardBody>
        </Card>

        {/* 掲示板 */}
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">掲示板</h2>
            <p className="mt-1 text-base sm:text-lg text-muted-foreground">
              全員が読める公開チャット
            </p>
          </div>

          <GlobalChatBoard myUserId={user.id} />
        </section>
      </div>
    </Container>
  );
}