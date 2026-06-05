"use client";

import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import Input from "@/app/components/ui/Input";
import Button from "@/app/components/ui/Button";
import { sendDm } from "./actions";
import { formatJst } from "@/lib/time";
import LinkifiedText from "@/app/components/LinkifiedText";

type Message = {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_avatar_url?: string | null;
  sender_profile_href?: string;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "video" | "file";
  image_url?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  read_at?: string | null;
  unsent_at?: string | null;
};

type LocalUpload = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  sender_profile_href: string;
  created_at: string;
  type: "image" | "video" | "file";
  signedUrl: string;
  caption: string;
  fileName: string;
  mime: string;
  size: number;
  fingerprint: string;
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
}: {
  mine: boolean;
  href: string;
  name: string;
}) {
  if (mine) {
    return <div className="text-xs font-semibold">あなた</div>;
  }

  return (
    <Link href={href} className="text-xs font-semibold hover:underline break-all">
      {name}
    </Link>
  );
}

function SubmitButton({ onSettled }: { onSettled: () => void }) {
  const { pending } = useFormStatus();
  const prev = useRef(false);

  useEffect(() => {
    if (prev.current && !pending) onSettled();
    prev.current = pending;
  }, [pending, onSettled]);

  return <Button type="submit">{pending ? "送信中…" : "送信"}</Button>;
}

function BubbleMeta({
  createdAt,
  mine,
  readAt,
}: {
  createdAt: string;
  mine: boolean;
  readAt?: string | null;
}) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
      <span>{formatJst(createdAt)}</span>
      {mine ? <span>{readAt ? "既読" : "未読"}</span> : null}
    </div>
  );
}

function UnsendButton({
  visible,
  busy,
  onClick,
}: {
  visible: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="ml-auto rounded-md border border-border bg-background px-2 py-1 text-[11px] font-semibold hover:bg-secondary/40 disabled:opacity-50"
    >
      {busy ? "取消中…" : "取り消し"}
    </button>
  );
}

function BubbleFrame({
  mine,
  avatar,
  header,
  meta,
  action,
  children,
}: {
  mine: boolean;
  avatar: React.ReactNode;
  header: React.ReactNode;
  meta: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={["flex gap-3", mine ? "justify-end" : "justify-start"].join(" ")}>
      {!mine && avatar}
      <div className="min-w-0 max-w-[85%]">
        <div
          className={[
            "mb-1 flex items-center gap-2",
            mine ? "justify-end" : "justify-start",
          ].join(" ")}
        >
          {header}
          {meta}
          {action}
        </div>
        {children}
      </div>
      {mine && avatar}
    </div>
  );
}

function BubbleText({
  mine,
  body,
  createdAt,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  readAt,
  showUnsend,
  unsendBusy,
  onUnsend,
}: {
  mine: boolean;
  body: string;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  readAt?: string | null;
  showUnsend: boolean;
  unsendBusy: boolean;
  onUnsend: () => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink
          href={senderProfileHref}
          name={senderName}
          url={senderAvatarUrl}
        />
      }
      header={<NameLine mine={mine} href={senderProfileHref} name={senderName} />}
      meta={<BubbleMeta createdAt={createdAt} mine={mine} readAt={readAt} />}
      action={
        <UnsendButton visible={showUnsend} busy={unsendBusy} onClick={onUnsend} />
      }
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
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
  readAt,
}: {
  mine: boolean;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  readAt?: string | null;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink
          href={senderProfileHref}
          name={senderName}
          url={senderAvatarUrl}
        />
      }
      header={<NameLine mine={mine} href={senderProfileHref} name={senderName} />}
      meta={<BubbleMeta createdAt={createdAt} mine={mine} readAt={readAt} />}
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
  url,
  caption,
  createdAt,
  onOpen,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  readAt,
  showUnsend,
  unsendBusy,
  onUnsend,
}: {
  mine: boolean;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  readAt?: string | null;
  showUnsend: boolean;
  unsendBusy: boolean;
  onUnsend: () => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink
          href={senderProfileHref}
          name={senderName}
          url={senderAvatarUrl}
        />
      }
      header={<NameLine mine={mine} href={senderProfileHref} name={senderName} />}
      meta={<BubbleMeta createdAt={createdAt} mine={mine} readAt={readAt} />}
      action={
        <UnsendButton visible={showUnsend} busy={unsendBusy} onClick={onUnsend} />
      }
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
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
  url,
  caption,
  createdAt,
  onOpen,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  readAt,
  showUnsend,
  unsendBusy,
  onUnsend,
}: {
  mine: boolean;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  readAt?: string | null;
  showUnsend: boolean;
  unsendBusy: boolean;
  onUnsend: () => void;
}) {
  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink
          href={senderProfileHref}
          name={senderName}
          url={senderAvatarUrl}
        />
      }
      header={<NameLine mine={mine} href={senderProfileHref} name={senderName} />}
      meta={<BubbleMeta createdAt={createdAt} mine={mine} readAt={readAt} />}
      action={
        <UnsendButton visible={showUnsend} busy={unsendBusy} onClick={onUnsend} />
      }
    >
      <div
        className={[
          "overflow-hidden rounded-2xl border border-border",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
        <video src={url} controls className="block max-h-[360px] w-full bg-black" />
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
  url,
  fileName,
  mime,
  size,
  caption,
  createdAt,
  senderName,
  senderAvatarUrl,
  senderProfileHref,
  readAt,
  showUnsend,
  unsendBusy,
  onUnsend,
}: {
  mine: boolean;
  url: string;
  fileName: string;
  mime: string;
  size: number;
  caption?: string;
  createdAt: string;
  senderName: string;
  senderAvatarUrl: string | null;
  senderProfileHref: string;
  readAt?: string | null;
  showUnsend: boolean;
  unsendBusy: boolean;
  onUnsend: () => void;
}) {
  const label = mime?.includes("pdf") ? "PDF" : "FILE";

  return (
    <BubbleFrame
      mine={mine}
      avatar={
        <AvatarLink
          href={senderProfileHref}
          name={senderName}
          url={senderAvatarUrl}
        />
      }
      header={<NameLine mine={mine} href={senderProfileHref} name={senderName} />}
      meta={<BubbleMeta createdAt={createdAt} mine={mine} readAt={readAt} />}
      action={
        <UnsendButton visible={showUnsend} busy={unsendBusy} onClick={onUnsend} />
      }
    >
      <div
        className={[
          "rounded-2xl border border-border px-4 py-3",
          mine ? "bg-primary/10" : "bg-secondary/30",
        ].join(" ")}
      >
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
}: {
  threadId: string;
  myUserId: string;
  messages: Message[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localUploads, setLocalUploads] = useState<LocalUpload[]>([]);
  const [modal, setModal] = useState<{ kind: "image" | "video"; url: string } | null>(
    null
  );
  const [unsendingId, setUnsendingId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const mediaPickerRef = useRef<HTMLInputElement | null>(null);
  const lastUploadKeyRef = useRef<{ key: string; at: number } | null>(null);
  const pinnedRef = useRef(true);

  const textAction = useMemo(() => sendDm.bind(null, threadId), [threadId]);

  const selfSeedMessage = messages.find((m) => m.sender_id === myUserId);
  const selfName = (selfSeedMessage?.sender_name ?? "").trim() || "あなた";
  const selfAvatarUrl = selfSeedMessage?.sender_avatar_url ?? null;
  const selfProfileHref = "/profile";

  const scrollToBottom = (smooth: boolean) => {
    const el = bottomRef.current;
    if (!el) return;
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "end" });
  };

  const updatePinned = () => {
    const el = listRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    pinnedRef.current = distance < 120;
  };

  const maybeStickBottom = () => {
    if (pinnedRef.current) {
      scrollToBottom(false);
      setTimeout(() => pinnedRef.current && scrollToBottom(false), 60);
      setTimeout(() => pinnedRef.current && scrollToBottom(false), 160);
    }
  };

  useLayoutEffect(() => {
    pinnedRef.current = true;
    scrollToBottom(false);
    setTimeout(() => scrollToBottom(false), 50);
    setTimeout(() => scrollToBottom(false), 150);
    setTimeout(() => scrollToBottom(false), 300);
  }, []);

  useLayoutEffect(() => {
    maybeStickBottom();
  }, [messages.length, localUploads.length]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom(false);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const serverIds = new Set(messages.map((m) => m.id));
    setLocalUploads((prev) => prev.filter((u) => !serverIds.has(u.id)));
  }, [messages]);

  // 相手からの新着を数秒ごとに取り込む
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    }, 2500);

    return () => window.clearInterval(id);
  }, [router, threadId]);

  // スレッドを見たら既読化
  useEffect(() => {
    let mounted = true;

    const markRead = async () => {
      try {
        await fetch(`/api/dm/${threadId}/read`, {
          method: "POST",
        });
        if (mounted) {
          router.refresh();
        }
      } catch {
        // ignore
      }
    };

    markRead();
    return () => {
      mounted = false;
    };
  }, [threadId, router, messages.length]);

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
      router.refresh();
      scrollToBottom(true);
      setTimeout(() => pinnedRef.current && scrollToBottom(true), 120);
    } catch (err: any) {
      setUploadError(err?.message ?? "送信に失敗しました。");
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
    } catch (err: any) {
      setUploadError(err?.message ?? "送信取り消しに失敗しました。");
    } finally {
      setUnsendingId(null);
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
        <div
          ref={listRef}
          onScroll={updatePinned}
          className="max-h-[60vh] overflow-y-auto space-y-4"
        >
          {messages.length === 0 && localUploads.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              まだメッセージがありません。最初の一言（またはメディア）を送ってみよう。
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

                const showUnsend = mine && !m.unsent_at;
                const unsendBusy = unsendingId === m.id;

                if (m.unsent_at) {
                  return (
                    <BubbleUnsent
                      key={m.id}
                      mine={mine}
                      createdAt={m.created_at}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      readAt={m.read_at}
                    />
                  );
                }

                if (m.message_type === "image" && m.image_url) {
                  return (
                    <BubbleImage
                      key={m.id}
                      mine={mine}
                      url={m.image_url}
                      caption={m.body}
                      createdAt={m.created_at}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      readAt={m.read_at}
                      showUnsend={showUnsend}
                      unsendBusy={unsendBusy}
                      onUnsend={() => unsendMessage(m.id)}
                    />
                  );
                }

                if (m.message_type === "video" && m.file_url) {
                  return (
                    <BubbleVideo
                      key={m.id}
                      mine={mine}
                      url={m.file_url}
                      caption={m.body}
                      createdAt={m.created_at}
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      readAt={m.read_at}
                      showUnsend={showUnsend}
                      unsendBusy={unsendBusy}
                      onUnsend={() => unsendMessage(m.id)}
                    />
                  );
                }

                if (m.message_type === "file" && m.file_url) {
                  return (
                    <BubbleFile
                      key={m.id}
                      mine={mine}
                      url={m.file_url}
                      fileName={m.file_name || "file"}
                      mime={m.file_mime || "application/octet-stream"}
                      size={Number(m.file_size ?? 0)}
                      caption={m.body}
                      createdAt={m.created_at}
                      senderName={senderName}
                      senderAvatarUrl={senderAvatarUrl}
                      senderProfileHref={senderProfileHref}
                      readAt={m.read_at}
                      showUnsend={showUnsend}
                      unsendBusy={unsendBusy}
                      onUnsend={() => unsendMessage(m.id)}
                    />
                  );
                }

                return (
                  <BubbleText
                    key={m.id}
                    mine={mine}
                    body={m.body}
                    createdAt={m.created_at}
                    senderName={senderName}
                    senderAvatarUrl={senderAvatarUrl}
                    senderProfileHref={senderProfileHref}
                    readAt={m.read_at}
                    showUnsend={showUnsend}
                    unsendBusy={unsendBusy}
                    onUnsend={() => unsendMessage(m.id)}
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
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={u.sender_name}
                      senderAvatarUrl={u.sender_avatar_url}
                      senderProfileHref={u.sender_profile_href}
                      readAt={null}
                      showUnsend={false}
                      unsendBusy={false}
                      onUnsend={() => {}}
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
                      onOpen={(kind, url) => setModal({ kind, url })}
                      senderName={u.sender_name}
                      senderAvatarUrl={u.sender_avatar_url}
                      senderProfileHref={u.sender_profile_href}
                      readAt={null}
                      showUnsend={false}
                      unsendBusy={false}
                      onUnsend={() => {}}
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
                    senderName={u.sender_name}
                    senderAvatarUrl={u.sender_avatar_url}
                    senderProfileHref={u.sender_profile_href}
                    readAt={null}
                    showUnsend={false}
                    unsendBusy={false}
                    onUnsend={() => {}}
                  />
                );
              })}

              <div ref={bottomRef} />
            </>
          )}
        </div>

        {uploadError ? (
          <div className="text-sm text-destructive">{uploadError}</div>
        ) : null}

        <form
          action={async () => {
            const fd = new FormData();
            fd.set("body", draft);
            await textAction(fd);
            setDraft("");
            pinnedRef.current = true;
            router.refresh();
            scrollToBottom(true);
            setTimeout(() => pinnedRef.current && scrollToBottom(true), 120);
          }}
          className="flex gap-2"
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

          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-secondary/50 transition disabled:opacity-50"
            aria-label="ファイルを送る"
            title="ファイルを送る"
          >
            📎
          </button>

          <button
            type="button"
            onClick={openMediaPicker}
            disabled={uploading}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border hover:bg-secondary/50 transition disabled:opacity-50"
            aria-label="画像・動画を送る"
            title="画像・動画を送る"
          >
            🎞️
          </button>

          <Input
            name="body"
            value={draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
            placeholder="メッセージを入力…"
            disabled={uploading}
          />

          <SubmitButton
            onSettled={() => {
              router.refresh();
            }}
          />
        </form>
      </div>
    </>
  );
}
