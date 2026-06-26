import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import CorrectionSheet from "./CorrectionSheet";
import ResultCommentsClient, {
  type ResultCommentItem,
} from "./ResultCommentsClient";
import {
  DmLink,
  MainLink,
  PageHeader,
  RankingLink,
} from "@/app/components/AppPageHeader";
import {
  formatXp,
  levelFromXp,
  levelProgress,
  normalizeXp,
  streakSessionXp,
} from "@/app/lib/leveling";

type ResultCommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  reply_to_comment_id: string | null;
};

type CommentProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  level: number | null;
};

type XpSessionRow = {
  id: number | string;
  started_at: string;
  ended_at: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

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
              <MainLink />
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
  const sessionXp = streakSessionXp(sess.started_at, sess.ended_at);

  const { data: xpRows, error: xpErr } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at")
    .eq("user_id", sess.user_id)
    .not("ended_at", "is", null)
    .order("ended_at", { ascending: true })
    .order("id", { ascending: true });

  if (xpErr) {
    console.error("result xp timeline fetch failed:", xpErr);
  }

  const resultEndedAtMs = sess.ended_at
    ? new Date(sess.ended_at).getTime()
    : Number.POSITIVE_INFINITY;
  const resultIdNumber = Number(sess.id);
  const xpTimeline = (xpRows ?? []) as XpSessionRow[];
  const xpBefore = normalizeXp(
    xpTimeline.reduce((sum, row) => {
      if (String(row.id) === String(sess.id) || !row.ended_at) return sum;

      const rowEndedAtMs = new Date(row.ended_at).getTime();
      const rowIdNumber = Number(row.id);
      const endedBefore =
        rowEndedAtMs < resultEndedAtMs ||
        (rowEndedAtMs === resultEndedAtMs &&
          Number.isFinite(rowIdNumber) &&
          Number.isFinite(resultIdNumber) &&
          rowIdNumber < resultIdNumber);

      return endedBefore
        ? sum + streakSessionXp(row.started_at, row.ended_at)
        : sum;
    }, 0)
  );
  const xpAfter = normalizeXp(xpBefore + sessionXp);
  const levelBefore = levelFromXp(xpBefore);
  const levelAfter = levelFromXp(xpAfter);
  const gainedLevels = Math.max(0, levelAfter - levelBefore);
  const afterProgress = levelProgress(xpAfter, levelAfter);
  const progressPercent =
    afterProgress.ratio > 0
      ? Math.max(3, Math.round(afterProgress.ratio * 100))
      : 0;

  const { data: commentRows, error: commentErr } = await supabase
    .from("result_comments")
    .select("id, user_id, body, created_at, reply_to_comment_id")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (commentErr) {
    console.error("result comments fetch failed:", commentErr);
  }

  const comments = ((commentRows ?? []) as ResultCommentRow[]).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const commentMap = new Map(comments.map((comment) => [comment.id, comment]));
  const commentUserIds = Array.from(new Set(comments.map((c) => c.user_id)));
  const commentProfileMap = new Map<string, CommentProfileRow>();

  if (commentUserIds.length > 0) {
    const { data: commentProfiles, error: commentProfileErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path, level")
      .in("id", commentUserIds);

    if (commentProfileErr) {
      console.error("result comment profiles fetch failed:", commentProfileErr);
    }

    ((commentProfiles ?? []) as CommentProfileRow[]).forEach((profile) => {
      commentProfileMap.set(profile.id, profile);
    });
  }

  const initialComments: ResultCommentItem[] = comments.map((comment) => {
    const profile = commentProfileMap.get(comment.user_id);
    const displayName = (profile?.display_name ?? "").trim() || "NoName";

    return {
      id: comment.id,
      user_id: comment.user_id,
      user_name: displayName,
      user_avatar_url: avatarUrl(profile?.avatar_path ?? null),
      user_profile_href:
        comment.user_id === user.id
          ? "/profile"
          : `/users/${encodeURIComponent(comment.user_id)}`,
      user_level: profile?.level ?? 1,
      body: comment.body,
      created_at: comment.created_at,
      reply_to_comment_id: comment.reply_to_comment_id,
      reply_to: comment.reply_to_comment_id
        ? (() => {
            const reply = commentMap.get(comment.reply_to_comment_id);
            if (!reply) return null;

            const replyProfile = commentProfileMap.get(reply.user_id);
            return {
              id: reply.id,
              user_name: (replyProfile?.display_name ?? "").trim() || "NoName",
              body: reply.body,
            };
          })()
        : null,
      can_delete: comment.user_id === user.id,
    };
  });

  const corrected = typeof sp.corrected === "string" ? sp.corrected : "";
  const correctionError =
    typeof sp.correction_error === "string"
      ? decodeURIComponent(sp.correction_error)
      : "";
  const createdId = typeof sp.created === "string" ? sp.created : "";
  const initialOpen =
    sp.openCorrection === "1" || sp.openCorrection === "true";

  return (
    <Container>
      <PageHeader
        title="継続リザルト"
        description={`${name} の継続結果`}
        actions={
          <>
            <MainLink />
            <RankingLink />
            <DmLink />
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        {corrected ? (
          <Card>
            <CardBody>
              <div className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                {corrected === "adjust" && "記録を修正しました。"}
                {corrected === "merge" &&
                  "誤って終了した記録を次の継続へ結合しました。"}
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">獲得XP</h2>
              {gainedLevels > 0 ? (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  Level Up
                </span>
              ) : null}
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-border bg-background/60 px-4 py-4">
                <div className="text-xs text-muted-foreground">今回</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  +{formatXp(sessionXp)} XP
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/60 px-4 py-4">
                <div className="text-xs text-muted-foreground">レベル</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {levelBefore === levelAfter
                    ? `Lv ${levelAfter}`
                    : `Lv ${levelBefore} → Lv ${levelAfter}`}
                </div>
              </div>

              <div className="rounded-xl border border-border bg-background/60 px-4 py-4">
                <div className="text-xs text-muted-foreground">終了時点の累計</div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {formatXp(xpAfter)} XP
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-border bg-secondary/20 px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="font-semibold">
                  {gainedLevels > 0
                    ? `${gainedLevels}レベルアップしました。`
                    : `次のLv ${levelAfter + 1}まで ${formatXp(afterProgress.remaining)} XP`}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {formatXp(afterProgress.earnedInLevel)} /{" "}
                  {formatXp(afterProgress.requiredInLevel)} XP
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                長く継続するほど1分あたりのXPが増えます。短時間終了は控えめに、長時間継続は大きく評価されます。
              </p>
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

        <ResultCommentsClient
          sessionId={sessionId}
          resultOwnerName={name}
          initialComments={initialComments}
        />
        {isOwner ? (
          <CorrectionSheet
            session={{
              id: Number(sess.id),
              started_at: sess.started_at,
              ended_at: sess.ended_at,
              end_reason: sess.end_reason,
            }}
            initialOpen={initialOpen}
          />
        ) : null}
      </div>
    </Container>
  );
}
