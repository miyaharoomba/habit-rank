"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";

import Input from "@/app/components/ui/Input";
import Button from "@/app/components/ui/Button";
import { sendDm } from "./actions";
import { formatJst } from "@/lib/time";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;

  message_type?: "text" | "image" | "video" | "file";

  image_url?: string | null; // signed URL（image）
  file_url?: string | null;  // signed URL（video/file）
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
};

type LocalUpload = {
  id: string;
  sender_id: string;
  created_at: string;
  type: "image" | "video" | "file";
  signedUrl: string;
  caption: string;
  fileName: string;
  mime: string;
  size: number;
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

function SubmitButton({ onSettled }: { onSettled: () => void }) {
  const { pending } = useFormStatus();
  const prev = useRef(false);

  useEffect(() => {
    if (prev.current && !pending) onSettled();
    prev.current = pending;
  }, [pending, onSettled]);

  return (
    <Button type="submit" disabled={pending} className="whitespace-nowrap">
      {pending ? "送信中…" : "送信"}
    </Button>
  );
}

function BubbleMeta({ mine, createdAt }: { mine: boolean; createdAt: string }) {
  return (
    <div
      className={[
        "mt-1 text-[11px] text-muted-foreground tabular-nums",
        mine ? "text-right" : "text-left",
      ].join(" ")}
    >
      {formatJst(createdAt)}
    </div>
  );
}

function BubbleText({
  mine,
  body,
  createdAt,
}: {
  mine: boolean;
  body: string;
  createdAt: string;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div
          className={[
            "rounded-2xl px-3 py-2 border border-border",
            "whitespace-pre-wrap break-words text-sm leading-relaxed",
            mine ? "bg-primary/15" : "bg-secondary/40",
          ].join(" ")}
        >
          {body}
        </div>
        <BubbleMeta mine={mine} createdAt={createdAt} />
      </div>
    </div>
  );
}

function BubbleImage({
  mine,
  url,
  caption,
  createdAt,
  onOpen,
}: {
  mine: boolean;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <button
          type="button"
          onClick={() => onOpen("image", url)}
          className={[
            "block overflow-hidden rounded-2xl border border-border",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            mine ? "bg-primary/10" : "bg-secondary/30",
          ].join(" ")}
          aria-label="画像を拡大表示"
          title="タップで拡大"
        >
          <img
            src={url}
            alt="image"
            className="block w-full h-auto max-h-[360px] object-cover"
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

        <BubbleMeta mine={mine} createdAt={createdAt} />
      </div>
    </div>
  );
}

function BubbleVideo({
  mine,
  url,
  caption,
  createdAt,
  onOpen,
}: {
  mine: boolean;
  url: string;
  caption?: string;
  createdAt: string;
  onOpen: (kind: "image" | "video", url: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        <div
          className={[
            "overflow-hidden rounded-2xl border border-border",
            mine ? "bg-primary/10" : "bg-secondary/30",
          ].join(" ")}
        >
          <video
            src={url}
            className="block w-full h-auto max-h-[360px] bg-black"
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

        <BubbleMeta mine={mine} createdAt={createdAt} />
      </div>
    </div>
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
}: {
  mine: boolean;
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
      <div className="max-w-[85%] sm:max-w-[70%]">
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={[
            "block rounded-2xl border border-border px-4 py-3",
            "hover:bg-secondary/40 transition",
            mine ? "bg-primary/10" : "bg-secondary/30",
          ].join(" ")}
          title="新しいタブで開く"
        >
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

        <BubbleMeta mine={mine} createdAt={createdAt} />
      </div>
    </div>
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
  const [modal, setModal] = useState<{ kind: "image" | "video"; url: string } | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const filePickerRef = useRef<HTMLInputElement | null>(null);
  const mediaPickerRef = useRef<HTMLInputElement | null>(null);

  const textAction = useMemo(() => sendDm.bind(null, threadId), [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, localUploads.length]);

  const openFilePicker = () => {
    setUploadError(null);
    filePickerRef.current?.click();
  };

  const openMediaPicker = () => {
    setUploadError(null);
    mediaPickerRef.current?.click();
  };

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadError(null);

    try {
      const fd = new FormData();
      fd.append("threadId", threadId);
      fd.append("file", file);
      if (draft.trim()) fd.append("caption", draft.trim());

      const res = await fetch("/api/dm/upload-image", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `Upload failed (HTTP ${res.status})`);
      }

      const signedUrl = json.signedUrl as string | null;
      const messageType = json.messageType as "image" | "video" | "file";

      if (signedUrl) {
        setLocalUploads((prev) => [
          ...prev,
          {
            id: json.messageId ?? `local-${Date.now()}`,
            sender_id: myUserId,
            created_at: json.createdAt ?? new Date().toISOString(),
            type: messageType,
            signedUrl,
            caption: draft.trim(),
            fileName: json.fileName ?? file.name,
            mime: json.mime ?? file.type ?? "",
            size: json.size ?? file.size ?? 0,
          },
        ]);
      }

      setDraft("");
      router.refresh();
    } catch (err: any) {
      setUploadError(err?.message ?? "送信に失敗しました。");
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadFile(file);
  };

  return (
    <div
      className={[
        "flex flex-col",
        "min-h-[420px]",
        "h-[calc(100dvh-240px)]",
        "max-h-[75vh] sm:max-h-[72vh]",
      ].join(" ")}
    >
      {modal && (
        <div className="fixed inset-0 z-[60]">
          <div className="absolute inset-0 bg-black/70" onClick={() => setModal(null)} />
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
                  className="block max-w-[95vw] max-h-[85vh] object-contain mx-auto"
                />
              ) : (
                <video
                  src={modal.url}
                  className="block w-full max-w-[95vw] max-h-[85vh] bg-black"
                  controls
                  autoPlay
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
      />
      <input
        ref={mediaPickerRef}
        type="file"
        accept="image/*,video/*"
        className="hidden"
        onChange={onPickFile}
      />

      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {messages.length === 0 && localUploads.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだメッセージがありません。最初の一言（またはメディア）を送ってみよう。
          </p>
        ) : (
          <>
            {messages.map((m) => {
              const mine = m.sender_id === myUserId;

              if (m.message_type === "image" && m.image_url) {
                return (
                  <BubbleImage
                    key={m.id}
                    mine={mine}
                    url={m.image_url}
                    caption={m.body || ""}
                    createdAt={m.created_at}
                    onOpen={(kind, url) => setModal({ kind, url })}
                  />
                );
              }

              if (m.message_type === "video" && m.file_url) {
                return (
                  <BubbleVideo
                    key={m.id}
                    mine={mine}
                    url={m.file_url}
                    caption={m.body || ""}
                    createdAt={m.created_at}
                    onOpen={(kind, url) => setModal({ kind, url })}
                  />
                );
              }

              if (m.message_type === "file" && m.file_url) {
                return (
                  <BubbleFile
                    key={m.id}
                    mine={mine}
                    url={m.file_url}
                    fileName={m.file_name ?? "file"}
                    mime={m.file_mime ?? ""}
                    size={m.file_size ?? 0}
                    caption={m.body || ""}
                    createdAt={m.created_at}
                  />
                );
              }

              return (
                <BubbleText
                  key={m.id}
                  mine={mine}
                  body={
                    m.body ||
                    (m.message_type === "file"
                      ? "（ファイル）"
                      : m.message_type === "video"
                      ? "（動画）"
                      : m.message_type === "image"
                      ? "（画像）"
                      : "")
                  }
                  createdAt={m.created_at}
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
                  />
                );
              }

              return (
                <BubbleFile
                  key={u.id}
                  mine={mine}
                  url={u.signedUrl}
                  fileName={u.fileName}
                  mime={u.mime}
                  size={u.size}
                  caption={u.caption}
                  createdAt={u.created_at}
                />
              );
            })}
          </>
        )}

        <div ref={bottomRef} />
      </div>

      <div className="sticky bottom-0 pt-3 bg-background/80 backdrop-blur">
        {uploadError && <div className="mb-2 text-xs text-destructive">{uploadError}</div>}

        <form
          action={async (fd: FormData) => {
            fd.set("body", draft);
            await textAction(fd);
            setDraft("");
            router.refresh();
          }}
          className="flex gap-2"
        >
          <button
            type="button"
            onClick={openFilePicker}
            disabled={uploading}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2
                       hover:bg-secondary/50 transition disabled:opacity-50"
            aria-label="ファイルを送る"
            title="ファイルを送る"
          >
            📎
          </button>

          <button
            type="button"
            onClick={openMediaPicker}
            disabled={uploading}
            className="inline-flex items-center justify-center rounded-lg border border-border px-3 py-2
                       hover:bg-secondary/50 transition disabled:opacity-50"
            aria-label="画像・動画を送る"
            title="画像・動画を送る"
          >
            🎞️
          </button>

          <div className="flex-1">
            <Input
              name="body"
              placeholder="メッセージ…（メディア/ファイルならキャプションにもなる）"
              autoComplete="off"
              value={draft}
              onChange={(e: any) => setDraft(e.target.value)}
            />
          </div>

          <SubmitButton onSettled={() => router.refresh()} />
        </form>
      </div>
    </div>
  );
}