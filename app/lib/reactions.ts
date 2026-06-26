export const REACTION_EMOJIS = ["👍", "❤️", "😂", "🔥", "👏"] as const;

export const REACTION_TARGET_TYPES = [
  "dm_message",
  "global_chat_message",
  "streak_session",
] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];
export type ReactionTargetType = (typeof REACTION_TARGET_TYPES)[number];

export type ReactionSummary = {
  emoji: ReactionEmoji;
  count: number;
  reacted: boolean;
};

export type ReactionRow = {
  target_id: string | number | null;
  emoji: string | null;
  user_id: string | null;
};

export function isReactionEmoji(value: unknown): value is ReactionEmoji {
  return (
    typeof value === "string" &&
    (REACTION_EMOJIS as readonly string[]).includes(value)
  );
}

export function isReactionTargetType(
  value: unknown
): value is ReactionTargetType {
  return (
    typeof value === "string" &&
    (REACTION_TARGET_TYPES as readonly string[]).includes(value)
  );
}

export function emptyReactionSummaries(): ReactionSummary[] {
  return REACTION_EMOJIS.map((emoji) => ({
    emoji,
    count: 0,
    reacted: false,
  }));
}

export function normalizeReactionSummaries(
  summaries: ReactionSummary[] | null | undefined
): ReactionSummary[] {
  const byEmoji = new Map((summaries ?? []).map((item) => [item.emoji, item]));

  return REACTION_EMOJIS.map((emoji) => {
    const item = byEmoji.get(emoji);
    return {
      emoji,
      count: Math.max(0, Number(item?.count ?? 0)),
      reacted: Boolean(item?.reacted),
    };
  });
}

export function summarizeReactionRows({
  rows,
  targetId,
  myUserId,
}: {
  rows: ReactionRow[];
  targetId: string | number;
  myUserId: string;
}): ReactionSummary[] {
  const id = String(targetId);
  const counts = new Map<ReactionEmoji, number>();
  const reacted = new Set<ReactionEmoji>();

  for (const row of rows) {
    if (String(row.target_id) !== id) continue;
    if (!isReactionEmoji(row.emoji)) continue;

    counts.set(row.emoji, (counts.get(row.emoji) ?? 0) + 1);
    if (row.user_id === myUserId) {
      reacted.add(row.emoji);
    }
  }

  return REACTION_EMOJIS.map((emoji) => ({
    emoji,
    count: counts.get(emoji) ?? 0,
    reacted: reacted.has(emoji),
  }));
}

export function summarizeReactionMap({
  rows,
  targetIds,
  myUserId,
}: {
  rows: ReactionRow[];
  targetIds: Array<string | number>;
  myUserId: string;
}) {
  const map = new Map<string, ReactionSummary[]>();

  for (const targetId of targetIds) {
    map.set(
      String(targetId),
      summarizeReactionRows({ rows, targetId, myUserId })
    );
  }

  return map;
}
