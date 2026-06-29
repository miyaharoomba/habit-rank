export const PULSE_GAME_VERSION = "pulse_runner_v2";
export const PULSE_BPM = 140;
export const BEAT_MS = 60_000 / PULSE_BPM;
export const PX_PER_BEAT = 190;
export const RUN_SPEED = PX_PER_BEAT / (BEAT_MS / 1000);
export const CUBE_GRAVITY = 2800;
export const CUBE_BODY_SIZE = 42;
export const CUBE_MAX_VERTICAL_SPEED = 1500;
export const BOUNCE_PAD_WIDTH = 76;
export const LEVEL_BEATS = 176;
export const LEVEL_DISTANCE_METERS = LEVEL_BEATS * 10;
export const LEVEL_START_X = 320;
export const LEVEL_END_X = LEVEL_START_X + LEVEL_BEATS * PX_PER_BEAT;
export const LEVEL_DURATION_MS = LEVEL_BEATS * BEAT_MS;
export const FLOOR_Y = 440;
export const CEILING_Y = 42;

export type PulseMode = "cube" | "ship";
export type PulseGravity = 1 | -1;
export type PulseInput = { atMs: number; action: "down" | "up" };

export const PULSE_SHIP_SECTIONS = [
  { startBeat: 32, endBeat: 58 },
  { startBeat: 112, endBeat: 142 },
] as const;

export const PULSE_GRAVITY_SECTIONS = [
  { startBeat: 76, endBeat: 94 },
] as const;

export function beatX(beat: number) {
  return LEVEL_START_X + beat * PX_PER_BEAT;
}

export function pulseModeAtX(x: number): PulseMode {
  return PULSE_SHIP_SECTIONS.some(
    ({ startBeat, endBeat }) => x >= beatX(startBeat) && x < beatX(endBeat)
  )
    ? "ship"
    : "cube";
}

export function pulseGravityAtX(x: number): PulseGravity {
  return PULSE_GRAVITY_SECTIONS.some(
    ({ startBeat, endBeat }) => x >= beatX(startBeat) && x < beatX(endBeat)
  )
    ? -1
    : 1;
}

export function pulseDistanceFromProgress(progressPercent: number) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  return Math.round((progress / 100) * LEVEL_DISTANCE_METERS);
}

export function pulseSurfaceState(mode: PulseMode, gravity: PulseGravity) {
  return {
    groundEnabled: mode === "cube" && gravity === 1,
    ceilingEnabled: mode === "cube" && gravity === -1,
  };
}

export const CUBE_SPIKE_BEATS = [
  4, 6, 8, 9, 12, 15, 18,
  61, 64, 72, 73,
  97, 104, 106, 109,
  145, 147, 154, 155, 162, 165, 168, 170, 173,
];

export const CUBE_PLATFORMS = [
  { beat: 20.5, widthBeats: 0.72, height: 50 },
  { beat: 21.45, widthBeats: 0.72, height: 88 },
  { beat: 22.4, widthBeats: 0.72, height: 126 },
  { beat: 23.35, widthBeats: 0.9, height: 164 },
  { beat: 27.75, widthBeats: 2.3, height: 188, bouncePadBeat: 26 },
  { beat: 99.75, widthBeats: 2.3, height: 184, bouncePadBeat: 98 },
  { beat: 149.1, widthBeats: 0.75, height: 48 },
  { beat: 150.05, widthBeats: 0.75, height: 86 },
  { beat: 151, widthBeats: 0.75, height: 124 },
  { beat: 151.95, widthBeats: 1.15, height: 162 },
] as const;

export const BOUNCE_PADS = [
  { beat: 26, power: 1350 },
  { beat: 68, power: 1200 },
  { beat: 98, power: 1350 },
  { beat: 158.5, power: 1180 },
] as const;

export const CEILING_SPIKES = [
  { beat: 69.1, baseY: 168 },
  { beat: 80, baseY: CEILING_Y },
  { beat: 83, baseY: CEILING_Y },
  { beat: 86, baseY: CEILING_Y },
  { beat: 89, baseY: CEILING_Y },
  { beat: 92, baseY: CEILING_Y },
  { beat: 159.6, baseY: 160 },
] as const;

export const SHIP_HAZARDS = [
  { beat: 34, side: "bottom" as const, height: 150, width: 105 },
  { beat: 36, side: "top" as const, height: 165, width: 115 },
  { beat: 38, side: "bottom" as const, height: 205, width: 120 },
  { beat: 40, side: "top" as const, height: 215, width: 120 },
  { beat: 42, side: "bottom" as const, height: 180, width: 150 },
  { beat: 44.2, side: "top" as const, height: 190, width: 150 },
  { beat: 46.5, side: "bottom" as const, height: 230, width: 100 },
  { beat: 48.2, side: "top" as const, height: 225, width: 100 },
  { beat: 50, side: "bottom" as const, height: 200, width: 135 },
  { beat: 52, side: "top" as const, height: 205, width: 135 },
  { beat: 54, side: "bottom" as const, height: 240, width: 95 },
  { beat: 56, side: "top" as const, height: 230, width: 95 },
  { beat: 114, side: "top" as const, height: 150, width: 120 },
  { beat: 116, side: "bottom" as const, height: 180, width: 120 },
  { beat: 118, side: "top" as const, height: 210, width: 140 },
  { beat: 120.3, side: "bottom" as const, height: 225, width: 105 },
  { beat: 122, side: "top" as const, height: 235, width: 105 },
  { beat: 124, side: "bottom" as const, height: 195, width: 170 },
  { beat: 126.4, side: "top" as const, height: 185, width: 170 },
  { beat: 129, side: "bottom" as const, height: 245, width: 95 },
  { beat: 130.6, side: "top" as const, height: 245, width: 95 },
  { beat: 132.2, side: "bottom" as const, height: 220, width: 95 },
  { beat: 134, side: "top" as const, height: 215, width: 135 },
  { beat: 136.1, side: "bottom" as const, height: 235, width: 110 },
  { beat: 138, side: "top" as const, height: 225, width: 110 },
  { beat: 140, side: "bottom" as const, height: 190, width: 145 },
];

export const PULSE_COINS = [
  { beat: 29, y: 215 },
  { beat: 87, y: 155 },
  { beat: 132, y: 270 },
];

export function pulseRewardXp(progressPercent: number, completed: boolean, coins: number) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  if (completed) return Math.min(22, Math.round((16 + coins * 2) * 10) / 10);
  return Math.min(8, Math.round((progress / 16) * 10) / 10);
}
