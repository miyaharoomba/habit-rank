"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatJstStartLabel } from "@/lib/time";

type ChatItem = {
  id: string;
  user_id: string;
  user_name: string;
  body: string;
  created_at: string;
};

type ApiResponse = {
  items: ChatItem[];
};

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

  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/global-chat?limit=${limit}`, {
        cache: "no-store",
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = (await res.json()) as ApiResponse;
      const rows = [...(json.items ?? [])].reverse(); // 古い → 新しい順に並べ替え
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

  const canSend = useMemo(() => draft.trim().length > 0 && draft.trim().length <= 200, [draft]);

  const sendMessage = async () => {
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

      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

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

  return (
    <div className="rounded-xl border border-border bg-card">
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

      <div
        ref={listRef}
        className="max-h-[420px] overflow-y-auto px-4 py-4 space-y-3"
      >
        {loading ? (
          <p className="text-sm text-muted-foreground">読み込み中…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            まだ投稿がありません。最初の一言を送ってみよう。
          </p>
        ) : (
          items.map((item) => {
            const mine = item.user_id === myUserId;

            return (
              <div
                key={item.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div className="max-w-[88%] sm:max-w-[72%]">
                  <div
                    className={[
                      "mb-1 text-[11px]",
                      mine ? "text-right text-muted-foreground" : "text-left text-muted-foreground",
                    ].join(" ")}
                  >
                    {mine ? "あなた" : item.user_name}
                  </div>

                  <div
                    className={[
                      "rounded-2xl border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      mine ? "bg-primary/15" : "bg-secondary/40",
                    ].join(" ")}
                  >
                    {item.body}
                  </div>

                  <div
                    className={[
                      "mt-1 text-[11px] text-muted-foreground tabular-nums",
                      mine ? "text-right" : "text-left",
                    ].join(" ")}
                  >
                    {formatJstStartLabel(item.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-border px-4 py-3 space-y-2">
        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={200}
            placeholder="全体に向けて投稿…（200文字以内）"
            className="flex-1 rounded-lg bg-background border border-input px-3 py-2 text-sm resize-none"
            disabled={sending}
          />

          <button
            type="button"
            onClick={sendMessage}
            disabled={!canSend || sending}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
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
``