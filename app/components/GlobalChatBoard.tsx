"use client";

import Link from "next/link";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import {
  ImagePlus,
  Paperclip,
  Pencil,
  Reply,
  SendHorizonal,
  Trash2,
  X,
} from "lucide-react";
import { formatJstStartLabel } from "@/lib/time";
import Button from "@/app/components/ui/Button";
import LinkifiedText from "@/app/components/LinkifiedText";
import TitleBadge from "@/app/components/TitleBadge";
import LevelBadge from "@/app/components/LevelBadge";
import ReactionBar, { ReactionPicker } from "@/app/components/ReactionBar";
import type { ReactionSummary } from "@/app/lib/reactions";

type ChatItem = {
  id: string;
  user_id: string;
  user_name: string;
  user_avatar_url?: string | null;
  user_title_label?: string | null;
  user_title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
  user_level?: number | null;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "video" | "file";
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  edited_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: ReplyPreview | null;
  reactions?: ReactionSummary[];
};

type ReplyPreview = {
  id: string;
  user_name: string;
  body: string;
};

type MenuPoint = {
  x: number;
  y: number;
};

type MessageMenuState = {
  item: ChatItem;
  point: MenuPoint;
};

type ApiResponse = {
  items: ChatItem[];
  canModerate?: boolean;
};

type GlobalChatBoardProps = {
  myUserId: string;
  limit?: number;
  pollMs?: number;
  mode?: "embedded" | "drawer";
  hideHeader?: boolean;
  className?: string;
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

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (
    error &&
    typeof error === "object" &&
    "error" in error &&
    typeof error.error === "string"
  ) {
    return error.error;
  }
  return fallback;
}

function isOkResponse(value: unknown) {
  return (
    !!value &&
    typeof value === "object" &&
    "ok" in value &&
    value.ok === true
  );
}

function previewMessage(item: ChatItem) {
  const text = item.body.trim();
  if (text) return text;
  if (item.message_type === "image") return "画像";
  if (item.message_type === "video") return "動画";
  if (item.message_type === "file") return item.file_name || "ファイル";
  return "メッセージ";
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
          loading="lazy"
          decoding="async"
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
  level,
}: {
  mine: boolean;
  userId: string;
  userName: string;
  myUserId: string;
  titleLabel?: string | null;
  titleRank?: "platinum" | "gold" | "silver" | "bronze" | null;
  level?: number | null;
}) {
  const href = profileHref(userId, myUserId);

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {mine ? (
        <span className="text-sm font-semibold">あなた</span>
      ) : (
        <Link
          href={href}
          className="min-w-0 break-all text-sm font-semibold hover:underline sm:break-normal"
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

      <LevelBadge level={level} compact />
    </div>
  );
}

function ChatMeta({ createdAt }: { createdAt: string }) {
  return (
    <div className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground tabular-nums">
      {formatJstStartLabel(createdAt)}
    </div>
  );
}

function MessageHeader({
  mine,
  item,
  myUserId,
}: {
  mine: boolean;
  item: ChatItem;
  myUserId: string;
}) {
  return (
    <div className={["flex min-w-0", mine ? "justify-end" : "justify-start"].join(" ")}>
      <NameLine
        mine={mine}
        userId={item.user_id}
        userName={item.user_name}
        myUserId={myUserId}
        titleLabel={item.user_title_label}
        titleRank={item.user_title_rank}
        level={item.user_level}
      />
    </div>
  );
}

function MessageMeta({
  mine,
  item,
}: {
  mine: boolean;
  item: ChatItem;
}) {
  return (
    <div
      className={[
        "mt-1 flex flex-col gap-1 px-1",
        mine ? "items-end" : "items-start",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
      {item.edited_at ? (
        <span className="text-[10px] text-muted-foreground">編集済み</span>
      ) : null}
      <ChatMeta createdAt={item.created_at} />
      </div>
      <ReactionBar
        targetType="global_chat_message"
        targetId={item.id}
        initialReactions={item.reactions}
        align={mine ? "end" : "start"}
      />
    </div>
  );
}

function ReplyPreviewBox({ reply }: { reply?: ReplyPreview | null }) {
  if (!reply) return null;

  return (
    <div className="mb-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs">
      <div className="font-semibold text-muted-foreground">{reply.user_name}</div>
      <div className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
        {reply.body}
      </div>
    </div>
  );
}

function BubbleFrame({
  mine,
  avatar,
  header,
  meta,
  onOpenMenu,
  children,
}: {
  mine: boolean;
  avatar: ReactNode;
  header: ReactNode;
  meta: ReactNode;
  onOpenMenu?: (point: MenuPoint) => void;
  children: ReactNode;
}) {
  const longPressTimerRef = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const openMenu = (point: MenuPoint) => {
    clearLongPress();
    onOpenMenu?.(point);
  };

  return (
    <div
      className={[
        "flex w-full min-w-0 max-w-full items-start gap-3",
        mine ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!mine ? avatar : null}

      <div className="min-w-0 max-w-[calc(100%-3.25rem)] flex-1 sm:max-w-[85%] sm:flex-none">
        {/* ここでヘッダーを吹き出しの外に出す */}
        <div className={mine ? "mb-2 flex justify-end" : "mb-2"}>{header}</div>

        <div
          onContextMenu={(event) => {
            if (!onOpenMenu) return;
            event.preventDefault();
            openMenu({ x: event.clientX, y: event.clientY });
          }}
          onPointerDown={(event) => {
            if (!onOpenMenu || event.pointerType === "mouse") return;
            clearLongPress();
            longPressTimerRef.current = window.setTimeout(() => {
              openMenu({ x: event.clientX, y: event.clientY });
            }, 520);
          }}
          onPointerUp={clearLongPress}
          onPointerCancel={clearLongPress}
          onPointerMove={clearLongPress}
          className={[
            "min-w-0 rounded-2xl border px-4 py-3 shadow-sm overflow-hidden",
            "[overflow-wrap:anywhere]",
            mine
              ? "border-primary/20 bg-primary/10"
              : "border-border bg-background/80",
          ].join(" ")}
        >
          <div className="min-w-0">{children}</div>
        </div>
        {meta}
      </div>

      {mine ? avatar : null}
    </div>
  );
}

function TextBubble({
  item,
  mine,
  myUserId,
  onOpenMenu,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpenMenu?: (point: MenuPoint) => void;
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
        />
      }
      meta={<MessageMeta mine={mine} item={item} />}
      onOpenMenu={onOpenMenu}
    >
      <ReplyPreviewBox reply={item.reply_to} />
      <div className="min-w-0 break-words whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
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
  onOpenMenu,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  onOpenMenu?: (point: MenuPoint) => void;
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
        />
      }
      meta={<MessageMeta mine={mine} item={item} />}
      onOpenMenu={onOpenMenu}
    >
      <ReplyPreviewBox reply={item.reply_to} />
      <button
        type="button"
        onClick={() => onOpen("image", item.image_url!)}
        className="block w-full max-w-full overflow-hidden rounded-xl border border-border text-left"
        aria-label="画像を拡大表示"
      >
        <img
          src={item.image_url}
          alt="chat image"
          loading="lazy"
          decoding="async"
          className="block h-auto max-h-[28rem] w-full object-cover"
        />
      </button>

      {item.body?.trim() ? (
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
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
  onOpenMenu,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  onOpenMenu?: (point: MenuPoint) => void;
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
        />
      }
      meta={<MessageMeta mine={mine} item={item} />}
      onOpenMenu={onOpenMenu}
    >
      <ReplyPreviewBox reply={item.reply_to} />
      <div className="overflow-hidden rounded-xl border border-border">
        <video
          src={item.file_url}
          controls
          playsInline
          preload="metadata"
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
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
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
  onOpenMenu,
}: {
  item: ChatItem;
  mine: boolean;
  myUserId: string;
  onOpenMenu?: (point: MenuPoint) => void;
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
        />
      }
      meta={<MessageMeta mine={mine} item={item} />}
      onOpenMenu={onOpenMenu}
    >
      <ReplyPreviewBox reply={item.reply_to} />
      <a
        href={item.file_url}
        target="_blank"
        rel="noreferrer"
        className="block min-w-0 overflow-hidden rounded-xl border border-border bg-secondary/30 px-4 py-3"
      >
        <div className="break-words text-sm font-semibold [overflow-wrap:anywhere]">
          {item.file_name || "file"}
        </div>
        <div className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {label} ・ {bytes(Number(item.file_size ?? 0))} ・{" "}
          {item.file_mime || "application/octet-stream"}
        </div>
        <div className="mt-2 text-xs text-primary hover:underline">開く</div>
      </a>

      {item.body?.trim() ? (
        <div className="mt-3 min-w-0 break-words whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
          <LinkifiedText text={item.body} />
        </div>
      ) : null}
    </BubbleFrame>
  );
}

export default function GlobalChatBoard({
  myUserId,
  limit = 30,
  pollMs = 30000,
  mode = "embedded",
  hideHeader = false,
  className = "",
}: GlobalChatBoardProps) {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<{ kind: "image" | "video"; url: string } | null>(null);
  const [canModerate, setCanModerate] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatItem | null>(null);
  const [editingItem, setEditingItem] = useState<ChatItem | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const mediaPickerRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);
  const lastFetchAtRef = useRef(0);
  const moderationFetchedRef = useRef(false);

  const openMessageMenu = (item: ChatItem, point: MenuPoint) => {
    const mine = item.user_id === myUserId;
    const width = 224;
    const height = mine || canModerate ? 208 : 112;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : point.x + width;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : point.y + height;

    setMessageMenu({
      item,
      point: {
        x: Math.min(Math.max(12, point.x), Math.max(12, viewportWidth - width - 12)),
        y: Math.min(Math.max(12, point.y), Math.max(12, viewportHeight - height - 12)),
      },
    });
  };

  const updateItemReactions = (
    itemId: string,
    reactions: ReactionSummary[]
  ) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              reactions,
            }
          : item
      )
    );
    setMessageMenu((prev) => {
      if (!prev || prev.item.id !== itemId) return prev;
      return {
        ...prev,
        item: {
          ...prev.item,
          reactions,
        },
      };
    });
  };

  const startReply = (item: ChatItem) => {
    setReplyTarget(item);
    setEditingItem(null);
    setDraft("");
    setMessageMenu(null);
  };

  const startEdit = (item: ChatItem) => {
    if (item.user_id !== myUserId) return;
    setEditingItem(item);
    setReplyTarget(null);
    setDraft(item.body);
    setMessageMenu(null);
  };

  const scrollToBottom = (smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  const focusDraft = () => {
    window.requestAnimationFrame(() => {
      draftRef.current?.focus({ preventScroll: true });
    });
  };

  const fetchMessages = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    const now = Date.now();
    if (background && now - lastFetchAtRef.current < 5000) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    lastFetchAtRef.current = now;

    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (!moderationFetchedRef.current) params.set("moderation", "1");

      const res = await fetch(`/api/global-chat?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as ApiResponse;
      const rows = [...(json.items ?? [])].reverse();

      setItems(rows);
      if (typeof json.canModerate === "boolean") {
        setCanModerate(json.canModerate);
        moderationFetchedRef.current = true;
      }
      setError(null);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "fetch failed"));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchMessages();
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      fetchMessages({ background: true });
    }, pollMs);

    const onFocus = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      fetchMessages({ background: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchMessages({ background: true });
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchMessages, pollMs]);

  useEffect(() => {
    scrollToBottom(false);
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

  useEffect(() => {
    if (!messageMenu) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMessageMenu(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageMenu]);

  const canSend = useMemo(() => {
    const body = draft.trim();
    return body.length > 0 && body.length <= 200 && !editingId;
  }, [draft, editingId]);

  const saveEdit = async (messageId: string, body: string) => {
    if (editingId) return;

    setEditingId(messageId);
    setError(null);

    try {
      const res = await fetch(`/api/global-chat/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ body }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getErrorMessage(json, `HTTP ${res.status}`));

      setDraft("");
      setEditingItem(null);
      await fetchMessages();
      focusDraft();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "編集に失敗しました。"));
    } finally {
      setEditingId(null);
    }
  };

  const sendText = async () => {
    const body = draft.trim();
    if (!body || sending) return;

    if (editingItem) {
      await saveEdit(editingItem.id, body);
      return;
    }

    setSending(true);
    setError(null);

    try {
      const res = await fetch("/api/global-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          body,
          replyToMessageId: replyTarget?.id ?? null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(getErrorMessage(json, `HTTP ${res.status}`));

      setDraft("");
      setReplyTarget(null);
      await fetchMessages();
      scrollToBottom(true);
      focusDraft();
      setTimeout(() => scrollToBottom(true), 50);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "送信に失敗しました。"));
    } finally {
      setSending(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (sending || editingItem) return;

    setSending(true);
    setError(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      if (draft.trim()) fd.append("caption", draft.trim());
      if (replyTarget) fd.append("replyToMessageId", replyTarget.id);

      const res = await fetch("/api/global-chat/upload", {
        method: "POST",
        body: fd,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !isOkResponse(json)) {
        throw new Error(getErrorMessage(json, `HTTP ${res.status}`));
      }

      setDraft("");
      setReplyTarget(null);
      await fetchMessages();
      scrollToBottom(true);
      focusDraft();
      setTimeout(() => scrollToBottom(true), 50);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "アップロードに失敗しました。"));
    } finally {
      setSending(false);
    }
  };

  const deleteMessage = async (item: ChatItem) => {
    const mine = item.user_id === myUserId;
    if ((!mine && !canModerate) || deletingId) return;

    const ok = window.confirm("このメッセージを削除しますか？");
    if (!ok) return;

    setDeletingId(item.id);
    setError(null);

    try {
      const res = await fetch(`/api/global-chat/${item.id}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(getErrorMessage(json, `HTTP ${res.status}`));
      }

      if (editingItem?.id === item.id) {
        setEditingItem(null);
        setDraft("");
      }
      if (replyTarget?.id === item.id) {
        setReplyTarget(null);
      }
      await fetchMessages();
    } catch (e: unknown) {
      setError(getErrorMessage(e, "削除に失敗しました。"));
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

  const onDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (canSend) void onSend();
  };

  const isDrawer = mode === "drawer";

  return (
    <>
      {messageMenu ? (
        <div className="fixed inset-0 z-[120]" onClick={() => setMessageMenu(null)}>
          <div
            className="fixed w-56 overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-glow"
            style={{
              left: messageMenu.point.x,
              top: messageMenu.point.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <ReactionPicker
              targetType="global_chat_message"
              targetId={messageMenu.item.id}
              initialReactions={messageMenu.item.reactions}
              onChange={(items) => updateItemReactions(messageMenu.item.id, items)}
              className="border-b border-border px-3 pb-2 pt-2"
            />

            <button
              type="button"
              onClick={() => startReply(messageMenu.item)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
            >
              <Reply className="h-4 w-4" aria-hidden="true" />
              リプライ
            </button>

            {messageMenu.item.user_id === myUserId ? (
              <button
                type="button"
                onClick={() => startEdit(messageMenu.item)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                編集
              </button>
            ) : null}

            {messageMenu.item.user_id === myUserId || canModerate ? (
              <button
                type="button"
                onClick={() => {
                  const item = messageMenu.item;
                  setMessageMenu(null);
                  void deleteMessage(item);
                }}
                disabled={deletingId === messageMenu.item.id}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                {deletingId === messageMenu.item.id ? "削除中…" : "削除"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

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

      <section
        className={[
          "flex w-full min-w-0 max-w-full flex-col overflow-x-hidden",
          isDrawer ? "h-full min-h-0" : "",
          className,
        ].join(" ")}
      >
        {!hideHeader ? (
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
        ) : null}

        <div
          className={[
            "flex min-h-0 w-full min-w-0 max-w-full flex-col gap-3",
            isDrawer ? "flex-1" : "",
          ].join(" ")}
        >
          <div
            ref={listRef}
            className={
              isDrawer
                ? "min-h-0 flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain px-1 py-2 sm:px-2"
                : "min-h-[22rem] max-h-[62vh] min-w-0 overflow-y-auto overflow-x-hidden px-1 py-2 sm:px-2"
            }
          >
            {loading ? (
              <div className="flex min-h-[18rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                読み込み中…
              </div>
            ) : items.length === 0 ? (
              <div className="flex min-h-[18rem] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                まだ投稿がありません。最初の一言を送ってみよう。
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-4">
                {items.map((item) => {
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
                        onOpenMenu={(point) => openMessageMenu(item, point)}
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
                        onOpenMenu={(point) => openMessageMenu(item, point)}
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
                        onOpenMenu={(point) => openMessageMenu(item, point)}
                      />
                    );
                  }

                  return (
                    <TextBubble
                      key={item.id}
                      item={item}
                      mine={mine}
                      myUserId={myUserId}
                      onOpenMenu={(point) => openMessageMenu(item, point)}
                    />
                  );
                })}

              </div>
            )}
          </div>

          <div className="shrink-0 rounded-xl border border-border bg-background/95 p-2 shadow-sm sm:p-3">
            {error ? (
              <div className="mb-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            ) : null}

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void onSend();
              }}
              className="min-w-0"
            >
              {replyTarget || editingItem ? (
                <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-semibold text-foreground">
                      {editingItem ? "編集中" : "リプライ"}
                    </div>
                    <div className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                      {previewMessage(editingItem ?? replyTarget!)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyTarget(null);
                      setEditingItem(null);
                      setDraft("");
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-secondary/60"
                    aria-label="キャンセル"
                    title="キャンセル"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              <textarea
                ref={draftRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onDraftKeyDown}
                rows={2}
                maxLength={200}
                placeholder={editingItem ? "編集内容を入力…" : "全体に向けて投稿…"}
                className="max-h-32 min-h-11 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
                disabled={sending || Boolean(editingId)}
              />

              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => filePickerRef.current?.click()}
                    disabled={sending || Boolean(editingItem) || Boolean(editingId)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="ファイルを送る"
                    title="ファイルを送る"
                  >
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    onClick={() => mediaPickerRef.current?.click()}
                    disabled={sending || Boolean(editingItem) || Boolean(editingId)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="画像・動画を送る"
                    title="画像・動画を送る"
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {draft.length}/200
                  </span>
                  <Button
                    type="submit"
                    disabled={!canSend || sending || Boolean(editingId)}
                    aria-busy={sending || Boolean(editingId)}
                    className="h-10 shrink-0 gap-2 px-4"
                  >
                    <SendHorizonal className="h-4 w-4" aria-hidden="true" />
                    {editingItem
                      ? editingId
                        ? "保存中…"
                        : "保存"
                      : sending
                        ? "送信中…"
                        : "送信"}
                  </Button>
                </div>
              </div>
            </form>

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
