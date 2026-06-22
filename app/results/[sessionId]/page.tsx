import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import CorrectionSheet from "./CorrectionSheet";
import { addResultCommentAction } from "./actions";
import {
  DmLink,
  MainLink,
  PageHeader,
  RankingLink,
} from "@/app/components/AppPageHeader";

type ResultCommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

type CommentProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function commentErrorLabel(value: string) {
  if (value === "empty") return "コメントを入力してください。";
  if (value === "session") return "リザルトが見つかりません。";
  if (value === "unfinished") return "終了済みのリザルトにだけコメントできます。";
  return value || "コメントの投稿に失敗しました。";
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

  const { data: commentRows, error: commentErr } = await supabase
    .from("result_comments")
    .select("id, user_id, body, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (commentErr) {
    console.error("result comments fetch failed:", commentErr);
  }

  const comments = (commentRows ?? []) as ResultCommentRow[];
  const commentUserIds = Array.from(new Set(comments.map((c) => c.user_id)));
  const commentProfileMap = new Map<string, CommentProfileRow>();

  if (commentUserIds.length > 0) {
    const { data: commentProfiles, error: commentProfileErr } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path")
      .in("id", commentUserIds);

    if (commentProfileErr) {
      console.error("result comment profiles fetch failed:", commentProfileErr);
    }

    ((commentProfiles ?? []) as CommentProfileRow[]).forEach((profile) => {
      commentProfileMap.set(profile.id, profile);
    });
  }

  const corrected = typeof sp.corrected === "string" ? sp.corrected : "";
  const correctionError =
    typeof sp.correction_error === "string"
      ? decodeURIComponent(sp.correction_error)
      : "";
  const commentPosted = sp.comment === "posted";
  const commentError =
    typeof sp.comment_error === "string" ? sp.comment_error : "";
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
            <h2 className="font-semibold">終了理由</h2>
          </CardHeader>
          <CardBody>
            <div className="rounded-xl border border-border bg-background/60 px-4 py-4 text-sm break-words whitespace-pre-wrap">
              {reason}
            </div>
          </CardBody>
        </Card>

        <section id="comments">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">コメント</h2>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {comments.length}件
                </span>
              </div>
            </CardHeader>
            <CardBody>
              {commentPosted ? (
                <div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  コメントを投稿しました。
                </div>
              ) : null}

              {commentError ? (
                <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {commentErrorLabel(commentError)}
                </div>
              ) : null}

              <form action={addResultCommentAction} className="grid gap-3">
                <input type="hidden" name="session_id" value={sessionId} />
                <textarea
                  name="body"
                  rows={3}
                  maxLength={280}
                  required
                  placeholder={`${name}さんのリザルトにコメント`}
                  className="w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">
                    280文字まで。投稿するとリザルトの持ち主に通知されます。
                  </p>
                  <button
                    type="submit"
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
                  >
                    コメントする
                  </button>
                </div>
              </form>

              <div className="mt-6">
                {comments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-background/50 px-4 py-6 text-sm text-muted-foreground">
                    まだコメントはありません。
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {comments.map((comment) => {
                      const profile = commentProfileMap.get(comment.user_id);
                      const displayName =
                        (profile?.display_name ?? "").trim() || "NoName";
                      const avatar = avatarUrl(profile?.avatar_path ?? null);
                      const profileHref =
                        comment.user_id === user.id
                          ? "/profile"
                          : `/users/${comment.user_id}`;

                      return (
                        <li key={comment.id} className="flex gap-3">
                          <Link href={profileHref} className="shrink-0">
                            {avatar ? (
                              <img
                                src={avatar}
                                alt={displayName}
                                className="h-10 w-10 rounded-full border border-border object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/50 text-sm font-bold text-muted-foreground">
                                {displayName.slice(0, 1)}
                              </div>
                            )}
                          </Link>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                              <Link
                                href={profileHref}
                                className="text-sm font-semibold hover:underline"
                              >
                                {displayName}
                              </Link>
                              <span className="text-xs text-muted-foreground tabular-nums">
                                {formatJst(comment.created_at)}
                              </span>
                            </div>
                            <div className="mt-1 rounded-2xl rounded-tl-md border border-border bg-background/70 px-4 py-3 text-sm leading-6 whitespace-pre-wrap break-words">
                              {comment.body}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardBody>
          </Card>
        </section>

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
