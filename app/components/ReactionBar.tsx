"use client";

import { useEffect, useState } from "react";
import {
  normalizeReactionSummaries,
  REACTION_EMOJIS,
  type ReactionEmoji,
  type ReactionSummary,
  type ReactionTargetType,
} from "@/app/lib/reactions";

type Props = {
  targetType: ReactionTargetType;
  targetId: string | number;
  initialReactions?: ReactionSummary[] | null;
  align?: "start" | "end" | "center";
  size?: "compact" | "normal";
  className?: string;
};

type ReactionResponse = {
  items?: ReactionSummary[];
  error?: string;
};

function alignClass(align: Props["align"]) {
  if (align === "end") return "justify-end";
  if (align === "center") return "justify-center";
  return "justify-start";
}

function optimisticToggle(
  items: ReactionSummary[],
  emoji: ReactionEmoji
): ReactionSummary[] {
  return items.map((item) => {
    if (item.emoji !== emoji) return item;
    const reacted = !item.reacted;
    return {
      ...item,
      reacted,
      count: Math.max(0, item.count + (reacted ? 1 : -1)),
    };
  });
}

export default function ReactionBar({
  targetType,
  targetId,
  initialReactions,
  align = "start",
  size = "compact",
  className = "",
}: Props) {
  const [items, setItems] = useState(() =>
    normalizeReactionSummaries(initialReactions)
  );
  const [pendingEmoji, setPendingEmoji] = useState<ReactionEmoji | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(normalizeReactionSummaries(initialReactions));
  }, [initialReactions]);

  const toggle = async (emoji: ReactionEmoji) => {
    if (pendingEmoji) return;

    const previous = items;
    setItems((prev) => optimisticToggle(prev, emoji));
    setPendingEmoji(emoji);
    setError(null);

    try {
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId: String(targetId),
          emoji,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | ReactionResponse
        | null;

      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setItems(normalizeReactionSummaries(json?.items));
    } catch (e) {
      setItems(previous);
      setError(e instanceof Error ? e.message : "reaction failed");
    } finally {
      setPendingEmoji(null);
    }
  };

  const compact = size === "compact";

  return (
    <div className={["mt-1 flex flex-wrap gap-1", alignClass(align), className].join(" ")}>
      {REACTION_EMOJIS.map((emoji) => {
        const item = items.find((candidate) => candidate.emoji === emoji);
        const count = item?.count ?? 0;
        const reacted = Boolean(item?.reacted);
        const pending = pendingEmoji === emoji;

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => void toggle(emoji)}
            disabled={pendingEmoji !== null}
            aria-pressed={reacted}
            aria-label={`${emoji} reaction`}
            title={`${emoji} reaction`}
            className={[
              "inline-flex shrink-0 items-center justify-center gap-1 rounded-full border transition",
              compact ? "h-7 min-w-7 px-2 text-[12px]" : "h-9 min-w-10 px-3 text-sm",
              reacted
                ? "border-primary/50 bg-primary/15 text-primary"
                : count > 0
                ? "border-border bg-secondary/40 text-foreground hover:bg-secondary/60"
                : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground",
              pending ? "opacity-60" : "",
            ].join(" ")}
          >
            <span>{emoji}</span>
            {count > 0 ? <span className="tabular-nums">{count}</span> : null}
          </button>
        );
      })}
      {error ? (
        <span className="self-center text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
