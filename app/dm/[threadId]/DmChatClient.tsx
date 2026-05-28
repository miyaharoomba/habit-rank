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

  // 画像対応
  message_type?: "text" | "image";
  image_path?: string | null;
  image_url?: string | null; // ← page.tsxでsigned URLを付与して渡してくる
};

type LocalImage = {
  id: string;
  sender_id: string;
  created_at: string;
  signedUrl: string;
  caption: string;
};

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
        <div
          className={[
            "mt-1 text-[11px] text-muted-foreground tabular-nums",
            mine ? "text-right" : "text-left",
          ].join(" ")}
        >
          {formatJst(createdAt)}
        </div>
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
  onOpen: (url: string) => void;
}) {
  return (
    <div className={`flex ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[85%] sm:max-w-[70%]">
        {/* プレビュー（タップで拡大） */}
        <button
          type="button"
          onClick={() => onOpen(url)}
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
            alt="送信された画像"
            className="block w-full h-auto max-h-[260px] object-cover"
            loading="lazy"
          />
        </button>

        {/* キャプション（任意） */}
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

        <div
          className={[
            "mt-1 text-[11px] text-muted-foreground tabular-nums",
            mine ? "text-right" : "text-left",
          ].join(" ")}
        >
          {formatJst(createdAt)}
        </div>
      </div>
    </div>
  );
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

  // 送った直後にすぐ出す（APIがsignedUrlを返す想定）
  const [localImages, setLocalImages] = useState<LocalImage[]>([]);

  // モーダル（拡大表示）
  const [modalUrl, setModalUrl] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const textAction = useMemo(() => sendDm.bind(null, threadId), [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, localImages.length]);

  const openFilePicker = () => {
    setUploadError(null);
    fileRef.current?.click();
  };

  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";

    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("画像ファイルだけ送れます。");
      return;
    }

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

      // 即プレビュー（LINEっぽい）
      if (json.signedUrl) {
        setLocalImages((prev) => [
          ...prev,
          {
            id: json.messageId ?? `local-${Date.now()}`,
            sender_id: myUserId,
            created_at: json.createdAt ?? new Date().toISOString(),
            signedUrl: json.signedUrl,
            caption: draft.trim(),
          },
        ]);
      }

      setDraft("");
      router.refresh();
    } catch (err: any) {
      setUploadError(err?.message ?? "画像の送信に失敗しました。");
    } finally {
      setUploading(false);
    }
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
      {/* 画像拡大モーダル */}
      {modalUrl && (
        <div className="fixed inset-0 z-[60]">
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => setModalUrl(null)}
            aria-hidden="true"
          />
          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div className="relative max-w-[95vw] max-h-[85vh]">
              <button
                type="button"
                onClick={() => setModalUrl(null)}
                className="absolute -top-10 right-0 text-white/90 hover:text-white text-sm"
              >
                閉じる ✕
              </button>
              <img
                src={modalUrl}
                alt="拡大画像"
                className="block max-w-[95vw] max-h-[85vh] object-contain rounded-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {messages.length === 0 && localImages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだメッセージがありません。最初の一言（または画像）を送ってみよう。
          </p>
        ) : (
          <>
            {messages.map((m) => {
              const mine = m.sender_id === myUserId;

              // ✅ 過去の画像メッセージも表示（page.tsxが signed URL を付けて渡す）
              if (m.message_type === "image") {
                if (m.image_url) {
                  return (
                    <BubbleImage
                      key={m.id}
                      mine={mine}
                      url={m.image_url}
                      caption={m.body || ""}
                      createdAt={m.created_at}
                      onOpen={(url) => setModalUrl(url)}
                    />
                  );
                }
                // signed URLが作れなかった場合のフォールバック
                return (
                  <BubbleText
                    key={m.id}
                    mine={mine}
                    body={m.body || "（画像）"}
                    createdAt={m.created_at}
                  />
                );
              }

              return (
                <BubbleText
                  key={m.id}
                  mine={mine}
                  body={m.body}
                  createdAt={m.created_at}
                />
              );
            })}

            {/* 送った直後に即表示（リロード前でも見える） */}
            {localImages.map((im) => (
              <BubbleImage
                key={im.id}
                mine={im.sender_id === myUserId}
                url={im.signedUrl}
                caption={im.caption}
                createdAt={im.created_at}
                onOpen={(url) => setModalUrl(url)}
              />
            ))}
          </>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 送信エリア */}
      <div className="sticky bottom-0 pt-3 bg-background/80 backdrop-blur">
        {uploadError && (
          <div className="mb-2 text-xs text-destructive">{uploadError}</div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onPickFile}
        />

        {/* ✅ Server Action は form action に渡す */}
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
            aria-label="画像を送る"
            title="画像を送る"
          >
            {uploading ? "…" : "📷"}
          </button>

          <div className="flex-1">
            <Input
              name="body"
              placeholder="メッセージ…（画像ならキャプションにもなる）"
              autoComplete="off"
              value={draft}
              onChange={(e: any) => setDraft(e.target.value)}
            />
          </div>

          <SubmitButton
            onSettled={() => {
              // 送信完了でUIを整える
              router.refresh();
            }}
          />
        </form>
      </div>
    </div>
  );
}