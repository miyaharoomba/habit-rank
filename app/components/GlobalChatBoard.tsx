"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { formatJstStartLabel } from "@/lib/time";
import LinkifiedText from "@/app/components/LinkifiedText";

type ChatItem = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
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
    <Link href={href} className="shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={userName || "avatar"}
          className="h-9 w-9 rounded-full object-cover border border-border"
        />
      ) : (
        <div className="h-9 w-9 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-sm font-bold text-muted-foreground">
          {initial}
        </div>
      )}
    </Link>
  );
}

function ChatMeta({ createdAt }: { createdAt: string }) {
  return (
    <div className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
      {formatJstStartLabel(createdAt)}
    </div>
  );
}

function NameLine({
  mine,
  userId,
  userName,
  myUserId,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  myUserId: string;
}) {
  if (mine) {
    return <div className="text-xs font-semibold">あなた</div>;
  }

  return (
    <Link
      href={profileHref(userId, myUserId)}
      className="text-xs font-semibold hover:underline break-all"
    >
      {userName}
    </Link>
  );
}

function BubbleFrame({
  mine,
  avatar,
  header,
  meta,
  children,
}: {
  mine: boolean;
  avatar: React.ReactNode;
  header: React.ReactNode;
  meta: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={[
        "flex gap-3",
        mine ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!mine && avatar}
      <div className={["min-w-0 max-w-[85%]", mine ? "items-end" : ""].join(" ")}>
        <div
          className={[
            "mb-1 flex items-center gap-2",
            mine ? "justify-end" : "justify-start",
          ].join(" ")}
        >
          {header}
          {meta}
        </div>
        {children}
      </div>
      {mine && avatar}
    </div>
  );
}

function TextBubble({
  item,
  mine,
  myUserId,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
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
        <NameLine
          mine={mine}
          userId={item.user_id}
          userName={item.user_name}
          myUserId={myUserId}
        />
      }
      meta={<ChatMeta createdAt={item.created_at} />}
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <LinkifiedText text={item.body} />
      </div>
    </BubbleFrame>
  );
}

function ImageBubble({
  item,
  mine,
  myUserId,
  onOpen,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
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
        <NameLine
          mine={mine}
          userId={item.user_id}
          userName={item.user_name}
          myUserId={myUserId}
        />
      }
      meta={<ChatMeta createdAt={item.created_at} />}
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => onOpen("image", item.image_url!)}
          className="block w-full text-left"
          aria-label="画像を拡大表示"
          title="タップで拡大"
        >
          <img
            src={item.image_url}
            alt={item.body || "image"}
            className="block max-h-[360px] w-full object-cover"
          />
        </button>

        {item.body?.trim() ? (
          <div className="px-4 py-3">
            <LinkifiedText text={item.body} />
          </div>
        ) : null}
      </div>
    </BubbleFrame>
  );
}

function VideoBubble({
  item,
  mine,
  myUserId,
  onOpen,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
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
        <NameLine
          mine={mine}
          userId={item.user_id}
          userName={item.user_name}
          myUserId={myUserId}
        />
      }
      meta={<ChatMeta createdAt={item.created_at} />}
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <video
          src={item.file_url}
          controls
          className="block max-h-[360px] w-full bg-black"
        />
        <button
          type="button"
          onClick={() => onOpen("video", item.file_url!)}
          className="w-full px-4 py-2 text-left text-xs text-primary hover:underline"
        >
          大きく表示
        </button>

        {item.body?.trim() ? (
          <div className="px-4 py-3 pt-0">
            <LinkifiedText text={item.body} />
          </div>
        ) : null}
      </div>
    </BubbleFrame>
  );
}

function FileBubble({
  item,
  mine,
  myUserId,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
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
        <NameLine
          mine={mine}
          userId={item.user_id}
          userName={item.user_name}
          myUserId={myUserId}
        />
      }
      meta={<ChatMeta createdAt={item.created_at} />}
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <a
          href={item.file_url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-border bg-background/70 px-4 py-3 hover:bg-background transition"
        >
          <div className="text-sm font-semibold break-all">
            {item.file_name || "file"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground break-all">
            {label} ・ {bytes(Number(item.file_size ?? 0))} ・{" "}
            {item.file_mime || "application/octet-stream"}
          </div>
          <div className="mt-2 text-xs text-primary">開く</div>
        </a>

        {item.body?.trim() ? (
          <div className="mt-3">
            <LinkifiedText text={item.body} />
          </div>
        ) : null}
      </div>
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
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);

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
      if (!res.ok || !json.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
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

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  return (
    <>
      {modal && (
        <div className="fixed inset-0 z-[70] bg-black/80">
          <div
            className="absolute inset-0"
            onClick={() => setModal(null)}
            aria-hidden="true"
          />
          <div className="absolute inset-4 flex items-center justify-center">
            <div className="relative max-h-full max-w-full">
              <button
                type="button"
                onClick={() => setModal(null)}
                className="absolute -top-10 right-0 text-white/90 hover:text-white text-sm"
              >
                閉じる ✕
              </button>

              {modal.kind === "image" ? (
                <img
                  src={modal.url}
                  alt="preview"
                  className="max-h-[85vh] max-w-[92vw] rounded-xl object-contain"
                />
              ) : (
                <video
                  src={modal.url}
                  controls
                  className="max-h-[85vh] max-w-[92vw] rounded-xl bg-black"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">掲示板</h2>
            <p className="text-sm text-muted-foreground">全員が読める公開チャット</p>
          </div>
          <div className="text-xs text-muted-foreground">
            {loading ? "読み込み中…" : `${items.length}件`}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-background/50">
          <div className="max-h-[60vh] overflow-y-auto px-4 py-4 space-y-4">
            {loading ? (
              <div className="text-sm text-muted-foreground">読み込み中…</div>
            ) : items.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                まだ投稿がありません。最初の一言を送ってみよう。
              </div>
            ) : (
              items.map((item) => {
                const mine = item.user_id === myUserId;
                const type = item.message_type ?? "text";

                if (type === "image" && item.image_url) {
                  return (
                    <ImageBubble
                      key={item.id}
                      item={item}
                      mine={mine}
                      myUserId={myUserId}
                      onOpen={(kind, url) => setModal({ kind, url })}
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
                    />
                  );
                }

                return (
                  <TextBubble
                    key={item.id}
                    item={item}
                    mine={mine}
                    myUserId={myUserId}
                  />
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-border px-4 py-3">
            {error ? <div className="mb-2 text-sm text-destructive">{error}</div> : null}

            <input
              ref={filePickerRef}
              type="file"
              className="hidden"
              onChange={onPickFile}
            />
            <input
              ref={mediaPickerRef}
              type="file"
              className="hidden"
              accept="image/*,video/*"
              onChange={onPickFile}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => filePickerRef.current?.click()}
                disabled={sending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-secondary/50 transition disabled:opacity-50"
                aria-label="ファイルを送る"
                title="ファイルを送る"
              >
                📎
              </button>

              <button
                type="button"
                onClick={() => mediaPickerRef.current?.click()}
                disabled={sending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-secondary/50 transition disabled:opacity-50"
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
                className="min-h-11 flex-1 rounded-lg bg-background border border-input px-3 py-2 text-sm resize-none"
                disabled={sending}
              />

              <button
                type="button"
                onClick={sendText}
                disabled={!canSend || sending}
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
              >
                {sending ? "送信中…" : "送信"}
              </button>
            </div>

            <div className="mt-2 text-right text-[11px] text-muted-foreground">
              {draft.trim().length}/200
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
``