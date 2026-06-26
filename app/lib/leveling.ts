export const XP_PER_LEVEL_STEP = 100;

export function normalizeXp(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value) * 10) / 10);
}

export function normalizeLevel(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 1;
  return Math.max(1, Math.floor(Number(value)));
}

export function levelFromXp(totalXp: number | null | undefined) {
  const xp = normalizeXp(totalXp);
  return Math.max(
    1,
    Math.floor((1 + Math.sqrt(1 + (8 * xp) / XP_PER_LEVEL_STEP)) / 2)
  );
}

export function xpRequiredForLevel(level: number) {
  const lv = normalizeLevel(level);
  return Math.floor(((lv - 1) * lv * XP_PER_LEVEL_STEP) / 2);
}

export function levelProgress(totalXp: number, level: number) {
  const xp = normalizeXp(totalXp);
  const lv = normalizeLevel(level);
  const currentFloor = xpRequiredForLevel(lv);
  const nextFloor = xpRequiredForLevel(lv + 1);
  const span = Math.max(1, nextFloor - currentFloor);
  const earnedInLevel = Math.max(0, Math.min(span, xp - currentFloor));

  return {
    level: lv,
    totalXp: xp,
    currentFloor,
    nextFloor,
    earnedInLevel,
    requiredInLevel: span,
    remaining: Math.max(0, nextFloor - xp),
    ratio: earnedInLevel / span,
  };
}

export function streakSessionXp(
  startedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined
) {
  if (!startedAt || !endedAt) return 0;

  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

  const minutes = Math.max(0, (end - start) / 60000);
  if (minutes <= 0) return 0;

  const rate = Math.min(
    2.2,
    0.1 + (1.1 * Math.log(Math.max(minutes, 1))) / Math.log(1440)
  );

  return normalizeXp(minutes * rate);
}

export function formatXp(value: number | null | undefined) {
  const xp = normalizeXp(value);
  return new Intl.NumberFormat("ja-JP", {
    minimumFractionDigits: Number.isInteger(xp) ? 0 : 1,
    maximumFractionDigits: 1,
  }).format(xp);
}
