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
  onChange?: (items: ReactionSummary[]) => void;
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

function useReactionController({
  targetType,
  targetId,
  initialReactions,
  onChange,
}: Pick<Props, "targetType" | "targetId" | "initialReactions" | "onChange">) {
  const [items, setItems] = useState(() =>
    normalizeReactionSummaries(initialReactions)
  );
  const [pendingEmoji, setPendingEmoji] = useState<ReactionEmoji | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(normalizeReactionSummaries(initialReactions));
  }, [initialReactions]);

  const updateItems = (nextItems: ReactionSummary[]) => {
    setItems(nextItems);
    onChange?.(nextItems);
  };

  const toggle = async (emoji: ReactionEmoji) => {
    if (pendingEmoji) return;

    const previous = items;
    updateItems(optimisticToggle(items, emoji));
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

      updateItems(normalizeReactionSummaries(json?.items));
    } catch (e) {
      updateItems(previous);
      setError(e instanceof Error ? e.message : "reaction failed");
    } finally {
      setPendingEmoji(null);
    }
  };

  return { items, pendingEmoji, error, toggle };
}

export default function ReactionBar({
  targetType,
  targetId,
  initialReactions,
  align = "start",
  size = "compact",
  className = "",
  onChange,
}: Props) {
  const { items, pendingEmoji, error, toggle } = useReactionController({
    targetType,
    targetId,
    initialReactions,
    onChange,
  });
  const compact = size === "compact";
  const visibleItems = items.filter((item) => item.count > 0 || item.reacted);

  if (visibleItems.length === 0 && !error) return null;

  return (
    <div className={["mt-1 flex flex-wrap gap-1", alignClass(align), className].join(" ")}>
      {visibleItems.map((item) => {
        const pending = pendingEmoji === item.emoji;

        return (
          <button
            key={item.emoji}
            type="button"
            onClick={() => void toggle(item.emoji)}
            disabled={pendingEmoji !== null}
            aria-pressed={item.reacted}
            aria-label={`${item.emoji} reaction`}
            title={`${item.emoji} reaction`}
            className={[
              "inline-flex shrink-0 items-center justify-center gap-1 rounded-full border transition",
              compact ? "h-7 min-w-7 px-2 text-[12px]" : "h-9 min-w-10 px-3 text-sm",
              item.reacted
                ? "border-primary/50 bg-primary/15 text-primary"
                : "border-border bg-secondary/40 text-foreground hover:bg-secondary/60",
              pending ? "opacity-60" : "",
            ].join(" ")}
          >
            <span>{item.emoji}</span>
            <span className="tabular-nums">{item.count}</span>
          </button>
        );
      })}
      {error ? (
        <span className="self-center text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}

export function ReactionPicker({
  targetType,
  targetId,
  initialReactions,
  align = "start",
  size = "compact",
  className = "",
  onChange,
}: Props) {
  const { items, pendingEmoji, error, toggle } = useReactionController({
    targetType,
    targetId,
    initialReactions,
    onChange,
  });
  const compact = size === "compact";

  return (
    <div className={["flex flex-col gap-1", className].join(" ")}>
      <div className={["flex flex-wrap gap-1", alignClass(align)].join(" ")}>
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
                compact ? "h-8 min-w-8 px-2 text-sm" : "h-10 min-w-10 px-3 text-base",
                reacted
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border bg-secondary/30 text-foreground hover:bg-secondary/60",
                pending ? "opacity-60" : "",
              ].join(" ")}
            >
              <span>{emoji}</span>
              {count > 0 ? <span className="text-[11px] tabular-nums">{count}</span> : null}
            </button>
          );
        })}
      </div>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </div>
  );
}

export function ReactionPanel({
  targetType,
  targetId,
  initialReactions,
  align = "start",
  size = "normal",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(() =>
    normalizeReactionSummaries(initialReactions)
  );

  useEffect(() => {
    setItems(normalizeReactionSummaries(initialReactions));
  }, [initialReactions]);

  return (
    <div className={["flex flex-col gap-3", className].join(" ")}>
      <ReactionBar
        targetType={targetType}
        targetId={targetId}
        initialReactions={items}
        align={align}
        size={size}
        onChange={setItems}
      />
      <div className={alignClass(align)}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex h-9 items-center justify-center rounded-full border border-border bg-secondary/30 px-4 text-sm font-semibold transition hover:bg-secondary/60"
          aria-expanded={open}
        >
          リアクションする
        </button>
      </div>
      {open ? (
        <ReactionPicker
          targetType={targetType}
          targetId={targetId}
          initialReactions={items}
          align={align}
          size={size}
          onChange={setItems}
        />
      ) : null}
    </div>
  );
}
