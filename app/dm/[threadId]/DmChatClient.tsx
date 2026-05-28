"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFormStatus } from "react-dom";

import Input from "@/app/components/ui/Input";
import Button from "@/app/components/ui/Button";
import { sendDm } from "./actions";

// ✅ JST固定フォーマッタ（timeZone: Asia/Tokyo を内部で指定）
// toLocaleString() は環境のローカルTZに依存するため、固定するのが正解。[1](https://github.com/orgs/vercel/repositories)[2](https://attendence-system-1910.vercel.app/users/login)
import { formatJst } from "@/lib/time";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

function Bubble({
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

        {/* ✅ JST固定の表示（サーバ/ブラウザ環境差が出ない） */}
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

function SubmitButton() {
  const { pending } = useFormStatus();
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
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  // メッセージが増えたら一番下へスクロール
  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount]);

  const action = useMemo(() => sendDm.bind(null, threadId), [threadId]);

  return (
    <div
      className={[
        "flex flex-col",
        "min-h-[420px]",
        "h-[calc(100dvh-240px)]",
        "max-h-[75vh] sm:max-h-[72vh]",
      ].join(" ")}
    >
      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだメッセージがありません。最初の一言を送ってみよう。
          </p>
        ) : (
          messages.map((m) => (
            <Bubble
              key={m.id}
              mine={m.sender_id === myUserId}
              body={m.body}
              createdAt={m.created_at}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* 送信フォーム（下固定） */}
      <div className="sticky bottom-0 pt-3 bg-background/80 backdrop-blur">
        <form
          ref={formRef}
          action={async (fd) => {
            await action(fd);
            // 送信後に入力をクリア
            setTimeout(() => formRef.current?.reset(), 0);
          }}
          className="flex gap-2"
        >
          <Input name="body" placeholder="メッセージ…" autoComplete="off" />
          <SubmitButton />
        </form>
      </div>
    </div>
  );
}