"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import LinkifiedText from "@/app/components/LinkifiedText";
import { formatJst } from "@/lib/time";

export type ResultCommentItem = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url: string | null;
  user_profile_href: string;
  body: string;
  created_at: string;
  reply_to_comment_id: string | null;
  reply_to: {
    id: string;
    user_name: string;
    body: string;
  } | null;
  can_delete: boolean;
};

type CommentsResponse = {
  items?: ResultCommentItem[];
  item?: ResultCommentItem;
  deletedId?: string;
  error?: string;
};

const COMMENT_REFRESH_MS = 3000;
const MIN_REFRESH_GAP_MS = 1200;

function sortComments(items: ResultCommentItem[]) {
  const map = new Map<string, ResultCommentItem>();
  items.forEach((item) => {
    map.set(item.id, item);
  });

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function Avatar({
  href,
  name,
  url,
}: {
  href: string;
  name: string;
  url: string | null;
}) {
  const initial = name.trim().slice(0, 1) || "?";

  return (
    <Link href={href} className="shrink-0">
      {url ? (
        <img
          src={url}
          alt={name}
          loading="lazy"
          decoding="async"
          className="h-10 w-10 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-secondary/50 text-sm font-bold text-muted-foreground">
          {initial}
        </div>
      )}
    </Link>
  );
}

export default function ResultCommentsClient({
  sessionId,
  resultOwnerName,
  initialComments,
}: {
  sessionId: string;
  resultOwnerName: string;
  initialComments: ResultCommentItem[];
}) {
  const [comments, setComments] = useState(initialComments);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<ResultCommentItem | null>(null);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const inFlightRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    setComments(sortComments(initialComments));
  }, [initialComments]);

  const fetchComments = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < MIN_REFRESH_GAP_MS) return;
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      lastRefreshAtRef.current = now;
      setRefreshing(true);

      try {
        const res = await fetch(`/api/results/${sessionId}/comments`, {
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | CommentsResponse
          | null;

        if (!res.ok || !json) {
          throw new Error(json?.error ?? `HTTP ${res.status}`);
        }

        setComments(sortComments(json.items ?? []));
        setError(null);
      } catch (err: unknown) {
        setError(errorMessage(err, "コメントの更新に失敗しました。"));
      } finally {
        inFlightRef.current = false;
        setRefreshing(false);
      }
    },
    [sessionId]
  );

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      void fetchComments();
    };

    const id = window.setInterval(refreshIfVisible, COMMENT_REFRESH_MS);
    const onFocus = () => refreshIfVisible();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfVisible();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchComments]);

  const submitComment = async () => {
    const body = draft.trim();
    if (!body || sendingRef.current) return;

    sendingRef.current = true;
    setSending(true);
    setError(null);

    try {
      const res = await fetch(`/api/results/${sessionId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body,
          replyToCommentId: replyTarget?.id ?? null,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | CommentsResponse
        | null;

      if (!res.ok || !json?.item) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setComments((prev) => sortComments([...prev, json.item!]));
      setDraft("");
      setReplyTarget(null);
      draftRef.current?.focus();
      void fetchComments({ force: true });
    } catch (err: unknown) {
      setError(errorMessage(err, "コメントの投稿に失敗しました。"));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const canSubmit = draft.trim().length > 0 && !sending;

  const startReply = (comment: ResultCommentItem) => {
    setReplyTarget(comment);
    setError(null);
    draftRef.current?.focus();
  };

  const deleteComment = async (comment: ResultCommentItem) => {
    if (deletingId) return;

    const ok = window.confirm("このコメントを削除しますか？");
    if (!ok) return;

    setDeletingId(comment.id);
    setError(null);

    try {
      const res = await fetch(`/api/results/${sessionId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: comment.id }),
      });

      const json = (await res.json().catch(() => null)) as
        | CommentsResponse
        | null;

      if (!res.ok || !json?.deletedId) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setComments((prev) =>
        prev
          .filter((item) => item.id !== json.deletedId)
          .map((item) =>
            item.reply_to_comment_id === json.deletedId
              ? { ...item, reply_to_comment_id: null, reply_to: null }
              : item
          )
      );

      if (replyTarget?.id === json.deletedId) {
        setReplyTarget(null);
      }

      void fetchComments({ force: true });
    } catch (err: unknown) {
      setError(errorMessage(err, "コメントの削除に失敗しました。"));
    } finally {
      setDeletingId(null);
    }
  };

  const onDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (canSubmit) void submitComment();
  };

  return (
    <section id="comments">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold">コメント</h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {refreshing ? <span>更新中...</span> : null}
              <span className="tabular-nums">{comments.length}件</span>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          {error ? (
            <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid gap-3">
            {replyTarget ? (
              <div className="flex items-start justify-between gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-xs">
                <div className="min-w-0">
                  <div className="font-semibold text-foreground">
                    {replyTarget.user_name} に返信
                  </div>
                  <div className="mt-1 line-clamp-2 break-words text-muted-foreground">
                    {replyTarget.body}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setReplyTarget(null)}
                  className="shrink-0 rounded-lg px-2 py-1 text-muted-foreground transition hover:bg-secondary/60 hover:text-foreground"
                >
                  キャンセル
                </button>
              </div>
            ) : null}

            <textarea
              ref={draftRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onDraftKeyDown}
              rows={3}
              maxLength={280}
              disabled={sending}
              placeholder={
                replyTarget
                  ? `${replyTarget.user_name} に返信`
                  : `${resultOwnerName}さんのリザルトにコメント`
              }
              className="w-full resize-y rounded-2xl border border-input bg-background px-4 py-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                Enterで送信、Shift+Enterで改行。投稿するとリザルトの持ち主に通知されます。
              </p>
              <button
                type="button"
                onClick={() => void submitComment()}
                disabled={!canSubmit}
                aria-busy={sending}
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? "送信中..." : replyTarget ? "返信する" : "コメントする"}
              </button>
            </div>
          </div>

          <div className="mt-6">
            {comments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-background/50 px-4 py-6 text-sm text-muted-foreground">
                まだコメントはありません。
              </div>
            ) : (
              <ul className="space-y-4">
                {comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3">
                    <Avatar
                      href={comment.user_profile_href}
                      name={comment.user_name}
                      url={comment.user_avatar_url}
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <Link
                          href={comment.user_profile_href}
                          className="text-sm font-semibold hover:underline"
                        >
                          {comment.user_name}
                        </Link>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatJst(comment.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 rounded-2xl rounded-tl-md border border-border bg-background/70 px-4 py-3 text-sm leading-6">
                        {comment.reply_to ? (
                          <div className="mb-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
                            <div className="font-semibold text-muted-foreground">
                              {comment.reply_to.user_name}
                            </div>
                            <div className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                              {comment.reply_to.body}
                            </div>
                          </div>
                        ) : null}
                        <LinkifiedText text={comment.body} />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-3 px-1 text-xs">
                        <button
                          type="button"
                          onClick={() => startReply(comment)}
                          className="font-semibold text-muted-foreground transition hover:text-primary"
                        >
                          返信
                        </button>
                        {comment.can_delete ? (
                          <button
                            type="button"
                            onClick={() => void deleteComment(comment)}
                            disabled={deletingId === comment.id}
                            className="font-semibold text-muted-foreground transition hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {deletingId === comment.id ? "削除中..." : "削除"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>
    </section>
  );
}
