export const XP_PER_LEVEL_STEP = 100;

export function normalizeXp(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.round(Number(value) * 10) / 10);
}

export function normalizeLevel(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return 1;
  return Math.max(1, Math.floor(Number(value)));
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
