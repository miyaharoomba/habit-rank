"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { ImagePlus, Paperclip, Pencil, Reply, Trash2, X } from "lucide-react";
import Button from "@/app/components/ui/Button";
import { sendDm } from "./actions";
import { formatJst } from "@/lib/time";
import LinkifiedText from "@/app/components/LinkifiedText";
import TitleBadge from "@/app/components/TitleBadge";
import LevelBadge from "@/app/components/LevelBadge";
import ReactionBar from "@/app/components/ReactionBar";
import type { ReactionSummary } from "@/app/lib/reactions";

type TitleRank = "platinum" | "gold" | "silver" | "bronze" | null;

type Message = {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar_url?: string | null;
  sender_profile_href?: string;
  sender_title_label?: string | null;
  sender_title_rank?: TitleRank;
  sender_level?: number | null;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "video" | "file";
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  read_at?: string | null;
  edited_at?: string | null;
  reply_to_message_id?: string | null;
  reply_to?: ReplyPreview | null;
  unsent_at?: string | null;
  reactions?: ReactionSummary[];
};

type ReplyPreview = {
  id: string;
  sender_name: string;
  body: string;
};

type MenuPoint = {
  x: number;
  y: number;
};

type MessageMenuState = {
  message: Message;
  point: MenuPoint;
};

type LocalUpload = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  sender_profile_href: string;
  sender_level: number | null;
  created_at: string;
  type: "image" | "video" | "file";
  signedUrl: string;
  caption: string;
  fileName: string;
  mime: string;
  size: number;
  fingerprint: string;
};

type MyProfile = {
  name: string;
  avatarUrl: string | null;
  titleLabel?: string | null;
  titleRank?: TitleRank;
  level: number | null;
};

const DM_REFRESH_MS = 10000;
const MIN_REFRESH_GAP_MS = 3000;

function bytes(size: number) {
  if (!Number.isFinite(size)) return "";
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function getErrorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function AvatarLink({
  href,
  name,
  url,
}: {
  href: string;
  name: string;
  url: string | null;
}) {
  const initial = (name ?? "?").trim().slice(0, 1) || "?";

  return (
    <Link href={href} className="shrink-0">
      {url ? (
        <img
          src={url}
          alt={name || "avatar"}
          loading="lazy"
          decoding="async"
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

function NameLine({
  mine,
  href,
  name,
  titleLabel,
  titleRank,
  level,
}: {
  mine: boolean;
  href: string;
  name: string;
  titleLabel?: string | null;
  titleRank?: TitleRank;
  level?: number | null;
}) {
  return (
    <div
      className={[
        "flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1",
        mine ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {mine ? (
        <div className="text-xs font-semibold shrink-0">あなた</div>
      ) : (
        <Link
          href={href}
          className="min-w-0 text-xs font-semibold hover:underline break-all sm:break-normal"
        >
          {name}
        </Link>
      )}

      <div className="min-w-0 max-w-[160px] sm:max-w-[220px]">
        <TitleBadge label={titleLabel} rank={titleRank} compact />
      </div>

      <LevelBadge level={level} compact />
    </div>
  );
}

function SubmitButton({
  busy,
  disabled,
  label = "送信",
  busyLabel = "送信中…",
  onSettled,
}: {
  busy: boolean;
  disabled: boolean;
  label?: string;
  busyLabel?: string;
  onSettled: () => void;
}) {
  const { pending } = useFormStatus();
  const prev = useRef(false);
  const submitting = pending || busy;
  const isDisabled = disabled || submitting;

  useEffect(() => {
    if (prev.current && !pending) onSettled();
    prev.current = pending;
  }, [pending, onSettled]);

  return (
    <Button
      type="submit"
      disabled={isDisabled}
      aria-busy={submitting}
      aria-label={submitting ? busyLabel : label}
      className="h-10 shrink-0 px-4"
    >
      {submitting ? busyLabel : label}
    </Button>
  );
}

function BubbleMeta({ createdAt }: { createdAt: string }) {
  return (
    <div className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
      {formatJst(createdAt)}
    </div>
  );
}

function ReadReceipt({
  mine,
  readAt,
}: {
  mine: boolean;
  readAt?: string | null;
}) {
  if (!mine || !readAt) return null;

  return (
    <div className="text-[10px] font-semibold text-primary">
      既読
    </div>
  );
}

function MessageMeta({
  mine,
  messageId,
  createdAt,
  readAt,
  editedAt,
  reactions,
}: {
  mine: boolean;
  messageId?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: ReactionSummary[];
}) {
  return (
    <div
      className={[
        "mt-1 flex flex-col gap-1 px-1",
        mine ? "items-end" : "items-start",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <ReadReceipt mine={mine} readAt={readAt} />
        {editedAt ? (
          <span className="text-[10px] text-muted-foreground">編集済み</span>
        ) : null}
        <BubbleMeta createdAt={createdAt} />
      </div>
      {messageId ? (
        <ReactionBar
          targetType="dm_message"
          targetId={messageId}
          initialReactions={reactions}
          align={mine ? "end" : "start"}
        />
      ) : null}
    </div>
  );
}

function ReplyPreviewBox({ reply }: { reply?: ReplyPreview | null }) {
  if (!reply) return null;

  return (
    <div className="mb-2 rounded-lg border border-border bg-background/70 px-3 py-2 text-xs">
      <div className="font-semibold text-muted-foreground">{reply.sender_name}</div>
      <div className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
        {reply.body}
      </div>
    </div>
  );
}

function MessageHeader({
  mine,
  senderProfileHref,
  senderName,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
}: {
  mine: boolean;
  senderProfileHref: string;
  senderName: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
}) {
  return (
    <div
      className={[
        "mb-2 flex min-w-0 flex-col gap-1.5",
        mine ? "items-end" : "items-start",
      ].join(" ")}
    >
      <NameLine
        mine={mine}
        href={senderProfileHref}
        name={senderName}
        titleLabel={senderTitleLabel}
        titleRank={senderTitleRank}
        level={senderLevel}
      />
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
        "flex min-w-0 gap-2 sm:gap-3",
        mine ? "justify-end" : "justify-start",
      ].join(" ")}
    >
      {!mine && avatar}
      <div className="min-w-0 max-w-[calc(100%-3.25rem)] sm:max-w-[85%]">
        {header}
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
        >
          {children}
        </div>
        {meta}
      </div>
      {mine && avatar}
    </div>
  );
}

function BubbleText({
  mine,
  messageId,
  body,
  createdAt,
  readAt,
  editedAt,
  reactions,
  replyTo,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
  onOpenMenu,
}: {
  mine: boolean;
  messageId?: string;
  body: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: ReactionSummary[];
  replyTo?: ReplyPreview | null;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
  onOpenMenu?: (point: MenuPoint) => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink href={senderProfileHref} name={senderName} url={senderAvatarUrl} />
      }
      header={
        <MessageHeader
          mine={mine}
          senderProfileHref={senderProfileHref}
          senderName={senderName}
          senderTitleLabel={senderTitleLabel}
          senderTitleRank={senderTitleRank}
          senderLevel={senderLevel}
        />
      }
      meta={
        <MessageMeta
          mine={mine}
          messageId={messageId}
          createdAt={createdAt}
          readAt={readAt}
          editedAt={editedAt}
          reactions={reactions}
        />
      }
      onOpenMenu={onOpenMenu}
    >
      <div
        className={[
          "max-w-full rounded-2xl border border-border px-4 py-3 text-sm leading-6 break-words",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <ReplyPreviewBox reply={replyTo} />
        <LinkifiedText text={body} />
      </div>
    </BubbleFrame>
  );
}

function BubbleUnsent({
  mine,
  createdAt,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
}: {
  mine: boolean;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink href={senderProfileHref} name={senderName} url={senderAvatarUrl} />
      }
      header={
        <div
          className={[
            "mb-2 flex min-w-0 flex-col gap-1.5",
            mine ? "items-end" : "items-start",
          ].join(" ")}
        >
          <NameLine
            mine={mine}
            href={senderProfileHref}
            name={senderName}
            titleLabel={senderTitleLabel}
            titleRank={senderTitleRank}
            level={senderLevel}
          />
        </div>
      }
      meta={<MessageMeta mine={mine} createdAt={createdAt} />}
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3 italic text-sm text-muted-foreground",
          mine ? "bg-background" : "bg-secondary/20",
        ].join(" ")}
      >
        送信を取り消しました
      </div>
    </BubbleFrame>
  );
}

function BubbleImage({
  mine,
  messageId,
  url,
  caption,
  createdAt,
  readAt,
  editedAt,
  reactions,
  replyTo,
  onOpen,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
  onOpenMenu,
}: {
  mine: boolean;
  messageId?: string;
  url: string;
  caption?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: ReactionSummary[];
  replyTo?: ReplyPreview | null;
  onOpen: (kind: "image" | "video", url: string) => void;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
  onOpenMenu?: (point: MenuPoint) => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink href={senderProfileHref} name={senderName} url={senderAvatarUrl} />
      }
      header={
        <MessageHeader
          mine={mine}
          senderProfileHref={senderProfileHref}
          senderName={senderName}
          senderTitleLabel={senderTitleLabel}
          senderTitleRank={senderTitleRank}
          senderLevel={senderLevel}
        />
      }
      meta={
        <MessageMeta
          mine={mine}
          messageId={messageId}
          createdAt={createdAt}
          readAt={readAt}
          editedAt={editedAt}
          reactions={reactions}
        />
      }
      onOpenMenu={onOpenMenu}
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        {replyTo ? (
          <div className="px-3 pt-3">
            <ReplyPreviewBox reply={replyTo} />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => onOpen("image", url)}
          className="block w-full text-left"
          aria-label="画像を拡大表示"
          title="タップで拡大"
        >
          <img
            src={url}
            alt={caption || "image"}
            loading="lazy"
            decoding="async"
            className="block max-h-[360px] w-full object-cover"
          />
        </button>

        {caption?.trim() ? (
          <div className="px-4 py-3">
            <LinkifiedText text={caption} />
          </div>
        ) : null}
      </div>
    </BubbleFrame>
  );
}

function BubbleVideo({
  mine,
  messageId,
  url,
  caption,
  createdAt,
  readAt,
  editedAt,
  reactions,
  replyTo,
  onOpen,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
  onOpenMenu,
}: {
  mine: boolean;
  messageId?: string;
  url: string;
  caption?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: ReactionSummary[];
  replyTo?: ReplyPreview | null;
  onOpen: (kind: "image" | "video", url: string) => void;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
  onOpenMenu?: (point: MenuPoint) => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink href={senderProfileHref} name={senderName} url={senderAvatarUrl} />
      }
      header={
        <MessageHeader
          mine={mine}
          senderProfileHref={senderProfileHref}
          senderName={senderName}
          senderTitleLabel={senderTitleLabel}
          senderTitleRank={senderTitleRank}
          senderLevel={senderLevel}
        />
      }
      meta={
        <MessageMeta
          mine={mine}
          messageId={messageId}
          createdAt={createdAt}
          readAt={readAt}
          editedAt={editedAt}
          reactions={reactions}
        />
      }
      onOpenMenu={onOpenMenu}
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        {replyTo ? (
          <div className="px-3 pt-3">
            <ReplyPreviewBox reply={replyTo} />
          </div>
        ) : null}
        <video
          src={url}
          controls
          preload="metadata"
          className="block max-h-[360px] w-full bg-black"
        />
        <button
          type="button"
          onClick={() => onOpen("video", url)}
          className="w-full px-4 py-2 text-left text-xs text-primary hover:underline"
        >
          大きく表示
        </button>

        {caption?.trim() ? (
          <div className="px-4 py-3 pt-0">
            <LinkifiedText text={caption} />
          </div>
        ) : null}
      </div>
    </BubbleFrame>
  );
}

function BubbleFile({
  mine,
  messageId,
  url,
  fileName,
  mime,
  size,
  caption,
  createdAt,
  readAt,
  editedAt,
  reactions,
  replyTo,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  senderTitleLabel,
  senderTitleRank,
  senderLevel,
  onOpenMenu,
}: {
  mine: boolean;
  messageId?: string;
  url: string;
  fileName: string;
  mime: string;
  size: number;
  caption?: string;
  createdAt: string;
  readAt?: string | null;
  editedAt?: string | null;
  reactions?: ReactionSummary[];
  replyTo?: ReplyPreview | null;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  senderTitleLabel?: string | null;
  senderTitleRank?: TitleRank;
  senderLevel?: number | null;
  onOpenMenu?: (point: MenuPoint) => void;
}) {
  const label = mime?.includes("pdf") ? "PDF" : "FILE";

  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink href={senderProfileHref} name={senderName} url={senderAvatarUrl} />
      }
      header={
        <MessageHeader
          mine={mine}
          senderProfileHref={senderProfileHref}
          senderName={senderName}
          senderTitleLabel={senderTitleLabel}
          senderTitleRank={senderTitleRank}
          senderLevel={senderLevel}
        />
      }
      meta={
        <MessageMeta
          mine={mine}
          messageId={messageId}
          createdAt={createdAt}
          readAt={readAt}
          editedAt={editedAt}
          reactions={reactions}
        />
      }
      onOpenMenu={onOpenMenu}
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <ReplyPreviewBox reply={replyTo} />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="block rounded-xl border border-border bg-background/70 px-4 py-3 hover:bg-background transition"
        >
          <div className="text-sm font-semibold break-all">{fileName}</div>
          <div className="mt-1 text-xs text-muted-foreground break-all">
            {label} ・ {bytes(size)} ・ {mime || "application/octet-stream"}
          </div>
          <div className="mt-2 text-xs text-primary">開く</div>
        </a>

        {caption?.trim() ? (
          <div className="mt-3">
            <LinkifiedText text={caption} />
          </div>
        ) : null}
      </div>
    </BubbleFrame>
  );
}

export default function DmChatClient({
  threadId,
  myUserId,
  messages,
  myProfile,
}: {
  threadId: string;
  myUserId: string;
  messages: Message[];
  myProfile?: MyProfile;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [textSubmitting, setTextSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [modal, setModal] = useState<{ kind: "image" | "video"; url: string } | null>(
    null
  );
  const [unsendingId, setUnsendingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [messageMenu, setMessageMenu] = useState<MessageMenuState | null>(null);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const listContentRef = useRef<HTMLDivElement | null>(null);
  const draftRef = useRef<HTMLTextAreaElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const mediaPickerRef = useRef<HTMLInputElement | null>(null);
  const lastUploadKeyRef = useRef<{ key: string; at: number } | null>(null);
  const textSubmittingRef = useRef(false);
  const pinnedRef = useRef(true);
  const lastRefreshAtRef = useRef(0);

  const textAction = useMemo(() => sendDm.bind(null, threadId), [threadId]);

  const selfSeedMessage = messages.find((m) => m.sender_id === myUserId);
  const selfName =
    (selfSeedMessage?.sender_name ?? "").trim() || myProfile?.name || "あなた";
  const selfAvatarUrl =
    selfSeedMessage?.sender_avatar_url ?? myProfile?.avatarUrl ?? null;
  const selfProfileHref = "/profile";
  const selfTitleLabel =
    selfSeedMessage?.sender_title_label ?? myProfile?.titleLabel ?? null;
  const selfTitleRank =
    selfSeedMessage?.sender_title_rank ?? myProfile?.titleRank ?? null;
  const selfLevel = selfSeedMessage?.sender_level ?? myProfile?.level ?? 1;

  const previewMessage = (message: Message) => {
    if (message.unsent_at) return "送信を取り消しました";
    const text = message.body.trim();
    if (text) return text;
    if (message.message_type === "image") return "画像";
    if (message.message_type === "video") return "動画";
    if (message.message_type === "file") return message.file_name || "ファイル";
    return "メッセージ";
  };

  const openMessageMenu = (message: Message, point: MenuPoint) => {
    const width = 192;
    const height = message.sender_id === myUserId ? 152 : 56;
    const viewportWidth =
      typeof window !== "undefined" ? window.innerWidth : point.x + width;
    const viewportHeight =
      typeof window !== "undefined" ? window.innerHeight : point.y + height;

    setMessageMenu({
      message,
      point: {
        x: Math.min(Math.max(12, point.x), Math.max(12, viewportWidth - width - 12)),
        y: Math.min(Math.max(12, point.y), Math.max(12, viewportHeight - height - 12)),
      },
    });
  };

  const startReply = (message: Message) => {
    setReplyTarget(message);
    setEditingMessage(null);
    setDraft("");
    setMessageMenu(null);
  };

  const startEdit = (message: Message) => {
    if (message.sender_id !== myUserId || message.unsent_at) return;
    setEditingMessage(message);
    setReplyTarget(null);
    setDraft(message.body);
    setMessageMenu(null);
  };

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = listRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  const scheduleScrollToBottom = useCallback((smooth: boolean, force = false) => {
    if (!force && !pinnedRef.current) return;
    scrollToBottom(smooth);
    window.requestAnimationFrame(() => {
      if (force || pinnedRef.current) scrollToBottom(smooth);
    });
    setTimeout(() => {
      if (force || pinnedRef.current) scrollToBottom(smooth);
    }, 80);
    setTimeout(() => {
      if (force || pinnedRef.current) scrollToBottom(smooth);
    }, 240);
  }, [scrollToBottom]);

  const focusDraft = () => {
    window.requestAnimationFrame(() => {
      draftRef.current?.focus({ preventScroll: true });
    });
  };

  const updatePinned = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 120;
  };

  const maybeStickBottom = useCallback(() => {
    if (pinnedRef.current) {
      scheduleScrollToBottom(false);
    }
  }, [scheduleScrollToBottom]);

  useLayoutEffect(() => {
    pinnedRef.current = true;
    scheduleScrollToBottom(false, true);
  }, [scheduleScrollToBottom]);

  useLayoutEffect(() => {
    maybeStickBottom();
  }, [maybeStickBottom, messages.length, localUploads.length]);

  useEffect(() => {
    const el = listContentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) scheduleScrollToBottom(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleScrollToBottom]);

  useEffect(() => {
    const serverIds = new Set(messages.map((m) => m.id));
    setLocalUploads((prev) => prev.filter((u) => !serverIds.has(u.id)));
  }, [messages]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (typeof navigator !== "undefined" && !navigator.onLine) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < MIN_REFRESH_GAP_MS) return;
      lastRefreshAtRef.current = now;
      router.refresh();
    };

    const id = window.setInterval(refreshIfVisible, DM_REFRESH_MS);

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
  }, [router, threadId]);

  useEffect(() => {
    if (!messageMenu) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMessageMenu(null);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [messageMenu]);

  const openFilePicker = () => {
    setUploadError(null);
    if (!uploading) filePickerRef.current?.click();
  };

  const openMediaPicker = () => {
    setUploadError(null);
    if (!uploading) mediaPickerRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    if (uploading) return;

    const fp = `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
    const last = lastUploadKeyRef.current;
    const now = Date.now();
    if (last && last.key === fp && now - last.at < 2500) return;
    lastUploadKeyRef.current = { key: fp, at: now };

    setUploading(true);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append("threadId", threadId);
      fd.append("file", file);
      if (draft.trim()) fd.append("caption", draft.trim());
      if (replyTarget) fd.append("replyToMessageId", replyTarget.id);

      const res = await fetch("/api/dm/upload-image", {
        method: "POST",
        body: fd,
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Upload failed (HTTP ${res.status})`);
      }

      const signedUrl = json.signedUrl as string | null;
      const messageType = json.messageType as "image" | "video" | "file";
      const messageId = (json.messageId as string | null) ?? null;

      if (signedUrl) {
        pinnedRef.current = true;
        setLocalUploads((prev) => [
          ...prev,
          {
            id: messageId ?? `local-${Date.now()}`,
            sender_id: myUserId,
            sender_name: selfName,
            sender_avatar_url: selfAvatarUrl,
            sender_profile_href: selfProfileHref,
            sender_level: selfLevel,
            created_at: (json.createdAt as string | null) ?? new Date().toISOString(),
            type: messageType,
            signedUrl,
            caption: draft.trim(),
            fileName: (json.fileName as string | null) ?? file.name,
            mime: (json.mime as string | null) ?? file.type ?? "",
            size: (json.size as number | null) ?? file.size ?? 0,
            fingerprint: fp,
          },
        ]);
      }

      setDraft("");
      setReplyTarget(null);
      router.refresh();
      scrollToBottom(true);
      focusDraft();
      setTimeout(() => pinnedRef.current && scrollToBottom(true), 120);
    } catch (err: unknown) {
      setUploadError(getErrorMessage(err, "送信に失敗しました。"));
    } finally {
      setUploading(false);
    }
  };

  const unsendMessage = async (messageId: string) => {
    if (unsendingId) return;

    const ok = window.confirm("このメッセージの送信を取り消しますか？");
    if (!ok) return;

    setUnsendingId(messageId);
    setUploadError(null);

    try {
      const res = await fetch(`/api/dm/messages/${messageId}`, {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      router.refresh();
    } catch (err: unknown) {
      setUploadError(getErrorMessage(err, "送信取り消しに失敗しました。"));
    } finally {
      setUnsendingId(null);
    }
  };

  const saveEdit = async (messageId: string, body: string) => {
    if (editingId) return;

    setEditingId(messageId);
    setUploadError(null);

    try {
      const res = await fetch(`/api/dm/messages/${messageId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setDraft("");
      setEditingMessage(null);
      router.refresh();
      focusDraft();
    } catch (err: unknown) {
      setUploadError(getErrorMessage(err, "編集に失敗しました。"));
    } finally {
      setEditingId(null);
    }
  };

  const onPickFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  const submitText = async () => {
    const body = draft.trim();
    if (!body || uploading || textSubmittingRef.current) return;

    if (editingMessage) {
      await saveEdit(editingMessage.id, body);
      return;
    }

    textSubmittingRef.current = true;
    setTextSubmitting(true);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.set("body", body);
      if (replyTarget) fd.set("reply_to_message_id", replyTarget.id);
      await textAction(fd);
      setDraft("");
      setReplyTarget(null);
      pinnedRef.current = true;
      router.refresh();
      scrollToBottom(true);
      focusDraft();
      setTimeout(() => pinnedRef.current && scrollToBottom(true), 120);
    } catch (err: unknown) {
      setUploadError(getErrorMessage(err, "送信に失敗しました。"));
    } finally {
      textSubmittingRef.current = false;
      setTextSubmitting(false);
    }
  };

  const textBusy = textSubmitting || uploading || Boolean(editingId);
  const canSendText = draft.trim().length > 0 && !textBusy;

  const onDraftKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }

    event.preventDefault();
    if (canSendText) void submitText();
  };

  return (
    <>
      {messageMenu ? (
        <div className="fixed inset-0 z-[80]" onClick={() => setMessageMenu(null)}>
          <div
            className="fixed w-48 overflow-hidden rounded-xl border border-border bg-card py-1 text-sm shadow-glow"
            style={{
              left: messageMenu.point.x,
              top: messageMenu.point.y,
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => startReply(messageMenu.message)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
            >
              <Reply className="h-4 w-4" aria-hidden="true" />
              リプライ
            </button>

            {messageMenu.message.sender_id === myUserId &&
            !messageMenu.message.unsent_at ? (
              <>
                <button
                  type="button"
                  onClick={() => startEdit(messageMenu.message)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-secondary/50"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  編集
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const id = messageMenu.message.id;
                    setMessageMenu(null);
                    void unsendMessage(id);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  削除
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

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

      <div className="flex h-[calc(100dvh-6.5rem)] flex-col gap-3 sm:h-[calc(100dvh-8rem)]">
        <div
          ref={listRef}
          onScroll={updatePinned}
          className="min-h-0 flex-1 overflow-y-auto px-1 py-2 sm:px-2"
        >
          <div ref={listContentRef} className="space-y-4">
            {messages.length === 0 && localUploads.length === 0 ? (
              <div className="flex min-h-[42vh] items-center justify-center px-4 text-center text-sm text-muted-foreground">
                まだメッセージがありません。最初の一言、またはメディアを送ってみよう。
              </div>
            ) : (
              <>
                {messages.map((m) => {
                const mine = m.sender_id === myUserId;
                const senderName = (m.sender_name ?? "").trim() || "NoName";
                const senderAvatarUrl = m.sender_avatar_url ?? null;
                const senderProfileHref =
                  m.sender_profile_href ??
                  (mine ? "/profile" : `/users/${encodeURIComponent(m.sender_id)}`);
                const senderTitleLabel = m.sender_title_label ?? null;
                const senderTitleRank = m.sender_title_rank ?? null;
                const senderLevel = m.sender_level ?? 1;
                if (m.unsent_at) {
                  return (
                    <BubbleUnsent
                      key={m.id}
                      mine={mine}
                      createdAt={m.created_at}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      senderTitleLabel={senderTitleLabel}
                      senderTitleRank={senderTitleRank}
                      senderLevel={senderLevel}
                    />
                  );
                }

                if (m.message_type === "image" && m.image_url) {
                  return (
                    <BubbleImage
                      key={m.id}
                      mine={mine}
                      messageId={m.id}
                      url={m.image_url}
                      caption={m.body}
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      editedAt={m.edited_at}
                      reactions={m.reactions}
                      replyTo={m.reply_to}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      senderTitleLabel={senderTitleLabel}
                      senderTitleRank={senderTitleRank}
                      senderLevel={senderLevel}
                      onOpenMenu={(point) => openMessageMenu(m, point)}
                    />
                  );
                }

                if (m.message_type === "video" && m.file_url) {
                  return (
                    <BubbleVideo
                      key={m.id}
                      mine={mine}
                      messageId={m.id}
                      url={m.file_url}
                      caption={m.body}
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      editedAt={m.edited_at}
                      reactions={m.reactions}
                      replyTo={m.reply_to}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      senderTitleLabel={senderTitleLabel}
                      senderTitleRank={senderTitleRank}
                      senderLevel={senderLevel}
                      onOpenMenu={(point) => openMessageMenu(m, point)}
                    />
                  );
                }

                if (m.message_type === "file" && m.file_url) {
                  return (
                    <BubbleFile
                      key={m.id}
                      mine={mine}
                      messageId={m.id}
                      url={m.file_url}
                      fileName={m.file_name || "file"}
                      mime={m.file_mime || "application/octet-stream"}
                      size={Number(m.file_size ?? 0)}
                      caption={m.body}
                      createdAt={m.created_at}
                      readAt={m.read_at}
                      editedAt={m.edited_at}
                      reactions={m.reactions}
                      replyTo={m.reply_to}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      senderTitleLabel={senderTitleLabel}
                      senderTitleRank={senderTitleRank}
                      senderLevel={senderLevel}
                      onOpenMenu={(point) => openMessageMenu(m, point)}
                    />
                  );
                }

                return (
                  <BubbleText
                    key={m.id}
                    mine={mine}
                    messageId={m.id}
                    body={m.body}
                    createdAt={m.created_at}
                    readAt={m.read_at}
                    editedAt={m.edited_at}
                    reactions={m.reactions}
                    replyTo={m.reply_to}
                    senderName={senderName}
                    senderAvatarUrl={senderAvatarUrl}
                    senderProfileHref={senderProfileHref}
                    senderTitleLabel={senderTitleLabel}
                    senderTitleRank={senderTitleRank}
                    senderLevel={senderLevel}
                    onOpenMenu={(point) => openMessageMenu(m, point)}
                  />
                );
                })}

                {localUploads.map((u) => {
                const mine = u.sender_id === myUserId;

                if (u.type === "image") {
                  return (
                    <BubbleImage
                      key={u.id}
                      mine={mine}
                      url={u.signedUrl}
                      caption={u.caption}
                      createdAt={u.created_at}
                      readAt={null}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={u.sender_name}
                      senderAvatarUrl={u.sender_avatar_url}
                      senderProfileHref={u.sender_profile_href}
                      senderTitleLabel={selfTitleLabel}
                      senderTitleRank={selfTitleRank}
                      senderLevel={u.sender_level}
                    />
                  );
                }

                if (u.type === "video") {
                  return (
                    <BubbleVideo
                      key={u.id}
                      mine={mine}
                      url={u.signedUrl}
                      caption={u.caption}
                      createdAt={u.created_at}
                      readAt={null}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={u.sender_name}
                      senderAvatarUrl={u.sender_avatar_url}
                      senderProfileHref={u.sender_profile_href}
                      senderTitleLabel={selfTitleLabel}
                      senderTitleRank={selfTitleRank}
                      senderLevel={u.sender_level}
                    />
                  );
                }

                return (
                  <BubbleFile
                    key={u.id}
                    mine={mine}
                    url={u.signedUrl}
                    fileName={u.fileName}
                    mime={u.mime || "application/octet-stream"}
                    size={u.size}
                    caption={u.caption}
                    createdAt={u.created_at}
                    readAt={null}
                    senderName={u.sender_name}
                    senderAvatarUrl={u.sender_avatar_url}
                    senderProfileHref={u.sender_profile_href}
                    senderTitleLabel={selfTitleLabel}
                    senderTitleRank={selfTitleRank}
                    senderLevel={u.sender_level}
                  />
                );
                })}

              </>
            )}
          </div>
        </div>

        {uploadError ? (
          <div className="text-sm text-destructive">{uploadError}</div>
        ) : null}

        <form
          action={submitText}
          className="shrink-0 rounded-xl border border-border bg-background/95 p-2 shadow-sm"
        >
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

          {replyTarget || editingMessage ? (
            <div className="mb-2 flex items-start justify-between gap-3 rounded-lg border border-border bg-secondary/30 px-3 py-2 text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-foreground">
                  {editingMessage ? "編集中" : "リプライ"}
                </div>
                <div className="mt-0.5 line-clamp-2 break-words text-muted-foreground">
                  {previewMessage(editingMessage ?? replyTarget!)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReplyTarget(null);
                  setEditingMessage(null);
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
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
            onKeyDown={onDraftKeyDown}
            placeholder={editingMessage ? "編集内容を入力…" : "メッセージを入力…"}
            disabled={textBusy}
            rows={2}
            className="max-h-36 min-h-11 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          />

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={openFilePicker}
                disabled={textBusy}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:opacity-50"
                aria-label="ファイルを送る"
                title="ファイルを送る"
              >
                <Paperclip className="h-4 w-4" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={openMediaPicker}
                disabled={textBusy}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50 disabled:opacity-50"
                aria-label="画像・動画を送る"
                title="画像・動画を送る"
              >
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <SubmitButton
              busy={textSubmitting}
              disabled={!canSendText}
              label={editingMessage ? "保存" : "送信"}
              busyLabel={editingMessage ? "保存中…" : "送信中…"}
              onSettled={() => {
                router.refresh();
              }}
            />
          </div>
        </form>
      </div>
    </>
  );
}
