import LiveTimer from "@/app/components/LiveTimer";
import GlobalChatDrawer from "@/app/components/GlobalChatDrawer";
import MobileAppMenu from "@/app/components/MobileAppMenu";
import Container from "@/app/components/ui/Container";
import Card, { CardBody } from "@/app/components/ui/Card";
import NotificationBell from "@/app/components/NotificationBell";
import {
  BadgesLink,
  DmLink,
  HeaderLink,
  HistoryLink,
  ParticipantsLink,
  PageHeader,
  ProfileLink,
  RankingLink,
  ReportsLink,
  SettingsLink,
  SupportLink,
} from "@/app/components/AppPageHeader";
import { createClient } from "@/lib/supabase/server";
import { startSession, finishSession } from "./actions";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { formatJstStartLabel } from "@/lib/time";
import FinishSessionButtons from "./FinishSessionButtons";

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

  return (
    <>
      <Container>
        <PageHeader
          title="継続チャレンジ"
          description="今の継続状態を見ながら、そのまま開始・終了・再開できます。"
          mobileActionsInline={true}
          actions={
            <>
              <GlobalChatDrawer myUserId={user.id} />
              <NotificationBell />
              <MobileAppMenu
                displayName={displayName}
                avatarPath={avatarPath}
                statusMessage={statusMessage}
              />
            </>
          }
        />

        <div className="mt-4 hidden flex-wrap items-center gap-2 sm:flex">
          <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 text-sm font-semibold">
            {displayName}
          </div>

          <ProfileLink />
          <ParticipantsLink />
          <DmLink />
          <HeaderLink href="/calendar" icon={CalendarDays}>
            カレンダー
          </HeaderLink>
          <ReportsLink />
          <HistoryLink />
          <BadgesLink />
          <SupportLink />
          <RankingLink />
          <SettingsLink />
        </div>

        <div className="mt-6 grid gap-4">
          <Card>
            <CardBody>
              <div className="space-y-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-muted-foreground">
                      現在の継続
                    </p>
                    <h2 className="text-lg font-bold tracking-tight">
                      {isRunning ? "進行中" : "待機中"}
                    </h2>
                  </div>

                  <div
                    className={[
                      "shrink-0 rounded-full border px-3 py-1 text-xs font-semibold",
                      isRunning
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-border bg-secondary/40 text-muted-foreground",
                    ].join(" ")}
                  >
                    {isRunning ? "継続中" : "未開始"}
                  </div>
                </div>

                <LiveTimer startedAt={startedAt} />

                <div className="flex flex-col gap-1 border-t border-border pt-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-medium text-muted-foreground">開始</span>
                  <span className="break-words font-semibold">
                    {startedAt ? formatJstStartLabel(startedAt) : "未開始"}
                  </span>
                </div>

                {!isRunning ? (
                  <form action={startSession}>
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 sm:w-auto sm:py-2"
                    >
                      継続を開始する
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-amber-300/30 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                      通常は「終了して次を開始」を使ってください。
                    </div>

                    <form action={finishSession} className="space-y-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium">終了理由（任意）</label>
                        <textarea
                          name="end_reason"
                          rows={3}
                          maxLength={200}
                          placeholder="例: 休憩 / 作業終了 / いったん区切る"
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
                        />
                      </div>

                      <FinishSessionButtons />
                    </form>
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

        </div>
      </Container>
    </>
  );
}
