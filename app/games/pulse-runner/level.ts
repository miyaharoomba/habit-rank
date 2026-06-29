export const PULSE_GAME_VERSION = "pulse_runner_v1";
export const PULSE_BPM = 140;
export const BEAT_MS = 60_000 / PULSE_BPM;
export const PX_PER_BEAT = 190;
export const RUN_SPEED = PX_PER_BEAT / (BEAT_MS / 1000);
export const LEVEL_BEATS = 64;
export const LEVEL_START_X = 320;
export const LEVEL_END_X = LEVEL_START_X + LEVEL_BEATS * PX_PER_BEAT;
export const LEVEL_DURATION_MS = LEVEL_BEATS * BEAT_MS;
export const FLOOR_Y = 440;
export const SHIP_START_BEAT = 20;
export const SHIP_END_BEAT = 36;

export type PulseMode = "cube" | "ship";
export type PulseInput = { atMs: number; action: "down" | "up" };

export function beatX(beat: number) {
  return LEVEL_START_X + beat * PX_PER_BEAT;
}

export const CUBE_SPIKE_BEATS = [
  4, 6, 8, 9, 12, 14, 16, 18,
  39, 41, 43, 44, 47, 50, 52, 53, 56, 58, 60, 62,
];

export const SHIP_HAZARDS = [
  { beat: 22, side: "bottom" as const, height: 165 },
  { beat: 24, side: "top" as const, height: 175 },
  { beat: 26, side: "bottom" as const, height: 205 },
  { beat: 28, side: "top" as const, height: 205 },
  { beat: 30, side: "bottom" as const, height: 190 },
  { beat: 32, side: "top" as const, height: 185 },
  { beat: 34, side: "bottom" as const, height: 215 },
];

export const PULSE_COINS = [
  { beat: 10.5, y: 330 },
  { beat: 27, y: 260 },
  { beat: 49, y: 325 },
];

export function pulseRewardXp(progressPercent: number, completed: boolean, coins: number) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  if (completed) return Math.min(18, Math.round((12 + coins * 1.5) * 10) / 10);
  return Math.min(5, Math.round((progress / 25) * 10) / 10);
}
