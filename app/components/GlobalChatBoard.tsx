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

function Avatar({
  userId,
  userName,
  avatarUrl,
}: {
  userId: string;
  userName: string;
  avatarUrl: string | null | undefined;
}) {
  const initial = (userName ?? "?").trim().slice(0, 1) || "?";

  return (
    <Link href={`/users/${encodeURIComponent(userId)}`} className="shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt="avatar"
          className="h-9 w-9 rounded-full object-cover border border-border"
        />
      ) : (
        <div className="h-9 w-9 rounded-full border border-border bg-background/60 flex items-center justify-center text-xs font-bold text-muted-foreground">
          {initial}
        </div>
      )}
    </Link>
  );
}

function ChatMeta({
  mine,
  createdAt,
}: {
  mine: boolean;
  createdAt: string;
}) {
  return (
    <div
      className={[
        "mt-1 text-[11px] text-muted-foreground tabular-nums",
        mine ? "text-right" : "text-left",
      ].join(" ")}
    >
      {formatJstStartLabel(createdAt)}
    </div>
  );
}

function NameLine({
  mine,
  userId,
  userName,
}: {
  mine: boolean;
  userId: string;
  userName: string;
}) {
  return (
    <div
      className={[
        "mb-1 text-[11px] text-muted-foreground",
        mine ? "text-right" : "text-left",
      ].join(" ")}
    >
      {mine ? (
        "あなた"
      ) : (
        <Link
          href={`/users/${encodeURIComponent(userId)}`}
          className="hover:underline"
        >
          {userName}
        </Link>
      )}
    </div>
  );
}

function ChatText({
  mine,
  userId,
  userName,
  avatarUrl,
  body,
  createdAt,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  body: string;
  createdAt: string;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"} max-w-full`}
      >
        <Avatar userId={userId} userName={userName} avatarUrl={avatarUrl} />

        <div className="max-w-[82vw] sm:max-w-[72%]">
          <NameLine mine={mine} userId={userId} userName={userName} />
          <div
            className={[
              "rounded-2xl border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words",
              mine ? "bg-primary/15" : "bg-secondary/40",
            ].join(" ")}
          >
            {body}
          </div>
          <ChatMeta mine={mine} createdAt={createdAt} />
        </div>
      </div>
    </div>
  );
}

function ChatImage({
  mine,
  userId,
  userName,
  avatarUrl,
  url,
  caption,
  createdAt,
  onOpen,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"} max-w-full`}
      >
        <Avatar userId={userId} userName={userName} avatarUrl={avatarUrl} />

        <div className="max-w-[82vw] sm:max-w-[72%]">
          <NameLine mine={mine} userId={userId} userName={userName} />

          <button
            type="button"
            onClick={() => onOpen("image", url)}
            className={[
              "block overflow-hidden rounded-2xl border border-border",
              mine ? "bg-primary/10" : "bg-secondary/30",
            ].join(" ")}
            aria-label="画像を拡大表示"
          >
            <img
              src={url}
              alt="image"
              className="block w-full h-auto max-h-[280px] sm:max-h-[340px] object-cover"
              loading="lazy"
            />
          </button>

          {caption ? (
            <div
              className={[
                "mt-2 rounded-xl border border-border px-3 py-2 text-sm",
                mine ? "bg-primary/15" : "bg-secondary/40",
              ].join(" ")}
            >
              {caption}
            </div>
          ) : null}

          <ChatMeta mine={mine} createdAt={createdAt} />
        </div>
      </div>
    </div>
  );
}

function ChatVideo({
  mine,
  userId,
  userName,
  avatarUrl,
  url,
  caption,
  createdAt,
  onOpen,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"} max-w-full`}
      >
        <Avatar userId={userId} userName={userName} avatarUrl={avatarUrl} />

        <div className="max-w-[82vw] sm:max-w-[72%]">
          <NameLine mine={mine} userId={userId} userName={userName} />

          <div
            className={[
              "overflow-hidden rounded-2xl border border-border",
              mine ? "bg-primary/10" : "bg-secondary/30",
            ].join(" ")}
          >
            <video
              src={url}
              className="block w-full h-auto max-h-[280px] sm:max-h-[360px] bg-black"
              controls
              playsInline
              preload="metadata"
            />
            <button
              type="button"
              onClick={() => onOpen("video", url)}
              className="w-full text-xs text-primary hover:underline px-3 py-2 text-left"
            >
              大きく表示
            </button>
          </div>

          {caption ? (
            <div
              className={[
                "mt-2 rounded-xl border border-border px-3 py-2 text-sm",
                mine ? "bg-primary/15" : "bg-secondary/40",
              ].join(" ")}
            >
              {caption}
            </div>
          ) : null}

          <ChatMeta mine={mine} createdAt={createdAt} />
        </div>
      </div>
    </div>
  );
}

function ChatFile({
  mine,
  userId,
  userName,
  avatarUrl,
  url,
  fileName,
  mime,
  size,
  caption,
  createdAt,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  avatarUrl?: string | null;
  url: string;
  fileName: string;
  mime: string;
  size: number;
  caption?: string;
  createdAt: string;
}) {
  const label = mime?.includes("pdf") ? "PDF" : "FILE";

  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div
        className={`flex gap-2 ${mine ? "flex-row-reverse" : "flex-row"} max-w-full`}
      >
        <Avatar userId={userId} userName={userName} avatarUrl={avatarUrl} />

        <div className="max-w-[82vw] sm:max-w-[72%]">
          <NameLine mine={mine} userId={userId} userName={userName} />

          <a href={url} target="_blank" rel="noreferrer">
            <div className="rounded-2xl border border-border bg-secondary/30 px-3 py-3 hover:bg-secondary/40 transition">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{fileName}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {label} ・ {bytes(size)} ・ {mime || "application/octet-stream"}
                  </div>
                </div>
                <div className="text-xs text-primary font-semibold whitespace-nowrap">
                  開く
                </div>
              </div>
            </div>
          </a>

          {caption ? (
            <div
              className={[
                "mt-2 rounded-xl border border-border px-3 py-2 text-sm",
                mine ? "bg-primary/15" : "bg-secondary/40",
              ].join(" ")}
            >
              {caption}
            </div>
          ) : null}

          <ChatMeta mine={mine} createdAt={createdAt} />
        </div>
      </div>
    </div>
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        headers: { "Content-Type": "application/json" },
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
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {modal && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setModal(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative max-w-[95vw] max-h-[85vh] w-full">
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
                  alt="image"
                  className="max-h-[85vh] w-full object-contain"
                />
              ) : (
                <video
                  src={modal.url}
                  className="max-h-[85vh] w-full"
                  controls
                  playsInline
                />
              )}
            </div>
          </div>
        </div>
      )}

      <input
        ref={filePickerRef}
        type="file"
        accept=".pdf,application/pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,application/*,text/*"
        className="hidden"
        onChange={onPickFile}
        disabled={sending}
      />
      <input
        ref={mediaPickerRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPickFile}
        disabled={sending}
      />

      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <div className="font-semibold">掲示板</div>
          <div className="text-xs text-muted-foreground">
            全員が読める公開チャット
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {loading ? "読み込み中…" : `${items.length}件`}
        </div>
      </div>

      <div className="max-h-[300px] sm:max-h-[420px] overflow-y-auto px-3 py-3 sm:px-4 sm:py-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ投稿がありません。最初の一言を送ってみよう。
          </p>
        ) : (
          items.map((item) => {
            const mine = item.user_id === myUserId;
            const type = item.message_type ?? "text";

            if (type === "image" && item.image_url) {
              return (
                <ChatImage
                  key={item.id}
                  mine={mine}
                  userId={item.user_id}
                  userName={item.user_name}
                  avatarUrl={item.user_avatar_url}
                  url={item.image_url}
                  caption={item.body || ""}
                  createdAt={item.created_at}
                  onOpen={(kind, url) => setModal({ kind, url })}
                />
              );
            }

            if (type === "video" && item.file_url) {
              return (
                <ChatVideo
                  key={item.id}
                  mine={mine}
                  userId={item.user_id}
                  userName={item.user_name}
                  avatarUrl={item.user_avatar_url}
                  url={item.file_url}
                  caption={item.body || ""}
                  createdAt={item.created_at}
                  onOpen={(kind, url) => setModal({ kind, url })}
                />
              );
            }

            if (type === "file" && item.file_url) {
              return (
                <ChatFile
                  key={item.id}
                  mine={mine}
                  userId={item.user_id}
                  userName={item.user_name}
                  avatarUrl={item.user_avatar_url}
                  url={item.file_url}
                  fileName={item.file_name ?? "file"}
                  mime={item.file_mime ?? ""}
                  size={item.file_size ?? 0}
                  caption={item.body || ""}
                  createdAt={item.created_at}
                />
              );
            }

            return (
              <ChatText
                key={item.id}
                mine={mine}
                userId={item.user_id}
                userName={item.user_name}
                avatarUrl={item.user_avatar_url}
                body={item.body || ""}
                createdAt={item.created_at}
              />
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-3 py-3 sm:px-4 sm:py-3 space-y-2">
        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex gap-2 items-end">
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
            className="h-11 rounded-lg bg-primary text-primary-foreground px-4 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
          >
            {sending ? "送信中…" : "送信"}
          </button>
        </div>

        <div className="text-[11px] text-muted-foreground text-right">
          {draft.trim().length}/200
        </div>
      </div>
    </div>
  );
}