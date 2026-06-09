"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { formatJstStartLabel } from "@/lib/time";
import LinkifiedText from "@/app/components/LinkifiedText";
import TitleBadge from "@/app/components/TitleBadge";

type ChatItem = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
  user_title_label?: string | null;
  user_title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "video" | "file";
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
};

type ApiResponse = {
  items: ChatItem[];
  canModerate?: boolean;
};

function bytes(size: number) {
  if (!Number.isFinite(size)) return "";
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function profileHref(userId: string, myUserId: string) {
  return userId === myUserId
    ? "/profile"
    : `/users/${encodeURIComponent(userId)}`;
}

function Avatar({
  userId,
  userName,
  avatarUrl,
  myUserId,
}: {
  userId: string;
  userName: string;
  avatarUrl: string | null | undefined;
  myUserId: string;
}) {
  const initial = (userName ?? "?").trim().slice(0, 1) || "?";
  const href = profileHref(userId, myUserId);

  return (
    <Link
      href={href}
      className="shrink-0"
      aria-label={`${userName} のプロフィールへ`}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={userName}
          className="h-9 w-9 rounded-full border border-border object-cover"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-secondary/40 text-sm font-bold text-muted-foreground">
          {initial}
        </div>
      )}
    </Link>
  );
}

function NameLine({
  mine,
  userId,
  userName,
  myUserId,
  titleLabel,
  titleRank,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  myUserId: string;
  titleLabel?: string | null;
  titleRank?: "platinum" | "gold" | "silver" | "bronze" | null;
}) {
  const href = profileHref(userId, myUserId);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {mine ? (
        <span className="text-sm font-semibold">あなた</span>
      ) : (
        <Link
          href={href}
          className="min-w-0 truncate text-sm font-semibold hover:underline"
        >
          {userName}
        </Link>
      )}

      {titleLabel?.trim() ? (
        <div className="max-w-full">
          <TitleBadge
            label={titleLabel}
            rank={titleRank ?? "bronze"}
            compact
          />
        </div>
      ) : null}
    </div>
  );
}

function ChatMeta({ createdAt }: { createdAt: string }) {
  return (
    <div className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
      {formatJstStartLabel(createdAt)}
    </div>
  );
}

function DeleteButton({
  visible,
  deleting,
  onClick,
}: {
  visible: boolean;
  deleting: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deleting}
      className="shrink-0 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10 disabled:opacity-50"
    >
      {deleting ? "削除中…" : "削除"}
    </button>
  );
}

function MessageHeader({
  mine,
  item,
  myUserId,
  canModerate,
  deleting,
  onDelete,
}: {
  mine: boolean;
  item: ChatItem;
  myUserId: string;
  canModerate: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        <NameLine
          mine={mine}
          userId={item.user_id}
          userName={item.user_name}
          myUserId={myUserId}
          titleLabel={item.user_title_label}
          titleRank={item.user_title_rank}
        />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ChatMeta createdAt={item.created_at} />
        <DeleteButton
          visible={canModerate}
          deleting={deleting}
          onClick={onDelete}
        />
      </div>
    </div>
  );
}

function BubbleFrame({
  mine,
  avatar,
  header,
  children,
}: {
  mine: boolean;
  avatar: ReactNode;
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={[
        "flex w-full min-w-0 max-w-full items-start gap-3",
        mine ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!mine ? avatar : null}

      <div className="min-w-0 max-w-[min(100%,42rem)] flex-1 sm:flex-none">
        <div
          className={[
            "min-w-0 rounded-2xl border px-4 py-3 shadow-sm overflow-hidden",
            mine
              ? "border-primary/20 bg-primary/10"
              : "border-border bg-background/80",
          ].join(" ")}
        >
          {header}
          <div className="mt-2 min-w-0">{children}</div>
        </div>
      </div>

      {mine ? avatar : null}
    </div>
  );
}

function TextBubble({
  item,
  mine,
  myUserId,
  canModerate,
  deleting,
  onDelete,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  canModerate: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <Avatar
          userId={item.user_id}
          userName={item.user_name}
          avatarUrl={item.user_avatar_url}
          myUserId={myUserId}
        />
      }
      header={
        <MessageHeader
          mine={mine}
          item={item}
          myUserId={myUserId}
          canModerate={canModerate}
          deleting={deleting}
          onDelete={onDelete}
        />
      }
    >
      <div className="min-w-0 break-words whitespace-pre-wrap text-sm leading-6">
        <LinkifiedText text={item.body || ""} />
      </div>
    </BubbleFrame>
  );
}

function ImageBubble({
  item,
  mine,
  myUserId,
  onOpen,
  canModerate,
  deleting,
  onDelete,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  canModerate: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  if (!item.image_url) return null;

  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <Avatar
          userId={item.user_id}
          userName={item.user_name}
          avatarUrl={item.user_avatar_url}
          myUserId={myUserId}
        />
      }
      header={
        <MessageHeader
          mine={mine}
          item={item}
          myUserId={myUserId}
          canModerate={canModerate}
          deleting={deleting}
          onDelete={onDelete}
        />
      }
    >
      <button
        type="button"
        onClick={() => onOpen("image", item.image_url!)}
        className="block w-full max-w-full overflow-hidden rounded-xl border border-border text-left"
        aria-label="画像を拡大表示"
      >
        <img
          src={item.image_url}
          alt="chat image"
          className="block h-auto max-h-[28rem] w-full object-cover"
        />
      </button>

      {item.body?.trim() ? (
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6">
          <LinkifiedText text={item.body} />
        </div>
      ) : null}
    </BubbleFrame>
  );
}

function VideoBubble({
  item,
  mine,
  myUserId,
  onOpen,
  canModerate,
  deleting,
  onDelete,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  canModerate: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  if (!item.file_url) return null;

  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <Avatar
          userId={item.user_id}
          userName={item.user_name}
          avatarUrl={item.user_avatar_url}
          myUserId={myUserId}
        />
      }
      header={
        <MessageHeader
          mine={mine}
          item={item}
          myUserId={myUserId}
          canModerate={canModerate}
          deleting={deleting}
          onDelete={onDelete}
        />
      }
    >
      <div className="overflow-hidden rounded-xl border border-border">
        <video
          src={item.file_url}
          controls
          playsInline
          className="block h-auto max-h-[28rem] w-full"
        />
      </div>

      <button
        type="button"
        onClick={() => onOpen("video", item.file_url!)}
        className="mt-2 text-xs text-primary hover:underline"
      >
        大きく表示
      </button>

      {item.body?.trim() ? (
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6">
          <LinkifiedText text={item.body} />
        </div>
      ) : null}
    </BubbleFrame>
  );
}

function FileBubble({
  item,
  mine,
  myUserId,
  canModerate,
  deleting,
  onDelete,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  canModerate: boolean;
  deleting: boolean;
  onDelete: () => void;
}) {
  if (!item.file_url) return null;

  const label = item.file_mime?.includes("pdf") ? "PDF" : "FILE";

  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <Avatar
          userId={item.user_id}
          userName={item.user_name}
          avatarUrl={item.user_avatar_url}
          myUserId={myUserId}
        />
      }
      header={
        <MessageHeader
          mine={mine}
          item={item}
          myUserId={myUserId}
          canModerate={canModerate}
          deleting={deleting}
          onDelete={onDelete}
        />
      }
    >
      <a
        href={item.file_url}
        target="_blank"
        rel="noreferrer"
        className="block min-w-0 rounded-xl border border-border bg-secondary/30 px-4 py-3"
      >
        <div className="break-words text-sm font-semibold">
          {item.file_name || "file"}
        </div>
        <div className="mt-1 break-words text-xs text-muted-foreground">
          {label} ・ {bytes(Number(item.file_size ?? 0))} ・{" "}
          {item.file_mime || "application/octet-stream"}
        </div>
        <div className="mt-2 text-xs text-primary hover:underline">開く</div>
      </a>

      {item.body?.trim() ? (
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6">
          <LinkifiedText text={item.body} />
        </div>
      ) : null}
    </BubbleFrame>
  );
}

export default function GlobalChatBoard({
  myUserId,
  limit = 50,
  pollMs = 5000,
}: {
  myUserId: string;
  limit?: number;
  pollMs?: number;
}) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: "image" | "video"; url: string } | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const mediaPickerRef = useRef<HTMLInputElement | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/global-chat?limit=${limit}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as ApiResponse;
      const rows = [...(json.items ?? [])].reverse();

      setItems(rows);
      setCanModerate(!!json.canModerate);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "fetch failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const id = window.setInterval(() => {
      fetchMessages();
    }, pollMs);

    return () => window.clearInterval(id);
  }, [pollMs, limit]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "auto", block: "end" });
  }, [items.length]);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    if (modal) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow || "";
    }
    return () => {
      document.body.style.overflow = originalOverflow || "";
    };
  }, [modal]);

  const canSend = useMemo(() => {
    const body = draft.trim();
    return body.length > 0 && body.length <= 200;
  }, [draft]);

  const sendText = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/global-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as any)?.error ?? `HTTP ${res.status}`);

      setDraft("");
      await fetchMessages();
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
    } catch (e: any) {
      setError(e?.message ?? "送信に失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (sending) return;

    setSending(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (draft.trim()) fd.append("caption", draft.trim());

      const res = await fetch("/api/global-chat/upload", {
        method: "POST",
        body: fd,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !(json as any).ok) {
        throw new Error((json as any)?.error ?? `HTTP ${res.status}`);
      }

      setDraft("");
      await fetchMessages();
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      }, 50);
    } catch (e: any) {
      setError(e?.message ?? "アップロードに失敗しました。");
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!canModerate || deletingId) return;

    const ok = window.confirm("このメッセージを削除しますか？");
    if (!ok) return;

    setDeletingId(messageId);
    setError(null);

    try {
      const res = await fetch(`/api/global-chat/${messageId}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as any)?.error ?? `HTTP ${res.status}`);
      }

      await fetchMessages();
    } catch (e: any) {
      setError(e?.message ?? "削除に失敗しました。");
    } finally {
      setDeletingId(null);
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  const onSend = async () => {
    if (!canSend || sending) return;
    await sendText();
  };

  return (
    <>
      {modal ? (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4">
          <button
            type="button"
            onClick={() => setModal(null)}
            className="absolute inset-0"
            aria-label="閉じる"
          />
          <div className="relative z-[121] flex max-h-full w-full max-w-5xl items-center justify-center">
            <button
              type="button"
              onClick={() => setModal(null)}
              className="absolute right-0 top-0 rounded-lg bg-black/50 px-3 py-2 text-sm text-white/90 hover:text-white"
            >
              閉じる ✕
            </button>

            {modal.kind === "image" ? (
              <img
                src={modal.url}
                alt="preview"
                className="max-h-[90vh] max-w-full rounded-xl object-contain"
              />
            ) : (
              <video
                src={modal.url}
                controls
                className="max-h-[90vh] max-w-full rounded-xl"
              />
            )}
          </div>
        </div>
      ) : null}

      <section className="w-full min-w-0 max-w-full overflow-x-hidden">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">掲示板</h3>
            <p className="text-sm text-muted-foreground">
              全員が読める公開チャット
            </p>
          </div>
          <div className="shrink-0 text-xs text-muted-foreground">
            {loading ? "読み込み中…" : `${items.length}件`}
          </div>
        </div>

        <div className="w-full min-w-0 max-w-full overflow-hidden rounded-2xl border border-border bg-background/70">
          <div className="max-h-[60vh] min-w-0 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
            {loading ? (
              <div className="rounded-xl border border-border bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                読み込み中…
              </div>
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-border bg-secondary/20 px-4 py-6 text-sm text-muted-foreground">
                まだ投稿がありません。最初の一言を送ってみよう。
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-4">
                {items.map((item) => {
                  const mine = item.user_id === myUserId;
                  const type = item.message_type ?? "text";
                  const deleting = deletingId === item.id;

                  if (type === "image" && item.image_url) {
                    return (
                      <ImageBubble
                        key={item.id}
                        item={item}
                        mine={mine}
                        myUserId={myUserId}
                        onOpen={(kind, url) => setModal({ kind, url })}
                        canModerate={canModerate}
                        deleting={deleting}
                        onDelete={() => deleteMessage(item.id)}
                      />
                    );
                  }

                  if (type === "video" && item.file_url) {
                    return (
                      <VideoBubble
                        key={item.id}
                        item={item}
                        mine={mine}
                        myUserId={myUserId}
                        onOpen={(kind, url) => setModal({ kind, url })}
                        canModerate={canModerate}
                        deleting={deleting}
                        onDelete={() => deleteMessage(item.id)}
                      />
                    );
                  }

                  if (type === "file" && item.file_url) {
                    return (
                      <FileBubble
                        key={item.id}
                        item={item}
                        mine={mine}
                        myUserId={myUserId}
                        canModerate={canModerate}
                        deleting={deleting}
                        onDelete={() => deleteMessage(item.id)}
                      />
                    );
                  }

                  return (
                    <TextBubble
                      key={item.id}
                      item={item}
                      mine={mine}
                      myUserId={myUserId}
                      canModerate={canModerate}
                      deleting={deleting}
                      onDelete={() => deleteMessage(item.id)}
                    />
                  );
                })}

                <div ref={bottomRef} />
              </div>
            )}
          </div>

          <div className="border-t border-border bg-background/80 p-3 sm:p-4">
            {error ? (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-end gap-2">
              <button
                type="button"
                onClick={() => filePickerRef.current?.click()}
                disabled={sending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:opacity-50"
                aria-label="ファイルを送る"
                title="ファイルを送る"
              >
                📎
              </button>

              <button
                type="button"
                onClick={() => mediaPickerRef.current?.click()}
                disabled={sending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:opacity-50"
                aria-label="画像・動画を送る"
                title="画像・動画を送る"
              >
                🎞️
              </button>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={1}
                maxLength={200}
                placeholder="全体に向けて投稿…"
                className="min-w-0 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none"
                disabled={sending}
              />

              <button
                type="button"
                onClick={onSend}
                disabled={!canSend || sending}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {sending ? "送信中…" : "送信"}
              </button>
            </div>

            <div className="mt-2 text-right text-[11px] text-muted-foreground">
              {draft.trim().length}/200
            </div>

            <input
              ref={filePickerRef}
              type="file"
              className="hidden"
              onChange={onPickFile}
            />

            <input
              ref={mediaPickerRef}
              type="file"
              accept="image/*,video/*"
              className="hidden"
              onChange={onPickFile}
            />
          </div>
        </div>
      </section>
    </>
  );
}