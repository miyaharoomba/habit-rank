export const PULSE_GAME_VERSION = "pulse_runner_v5";
export const PULSE_BPM = 140;
export const BEAT_MS = 60_000 / PULSE_BPM;
export const PX_PER_BEAT = 190;
export const RUN_SPEED = PX_PER_BEAT / (BEAT_MS / 1000);
export const CUBE_GRAVITY = 4200;
export const CUBE_JUMP_SPEED = 900;
export const CUBE_BODY_SIZE = 42;
export const CUBE_MAX_VERTICAL_SPEED = 2000;
export const BOUNCE_PAD_WIDTH = 76;
export const SPIKE_BODY_WIDTH = 34;
export const SPIKE_HEIGHT = 50;
export const LEVEL_BEATS = 224;
export const LEVEL_DISTANCE_METERS = LEVEL_BEATS * 10;
export const LEVEL_START_X = 320;
export const LEVEL_END_X = LEVEL_START_X + LEVEL_BEATS * PX_PER_BEAT;
export const LEVEL_DURATION_MS = LEVEL_BEATS * BEAT_MS;
export const MUSIC_SYNC_TOLERANCE_SECONDS = 0.75;
export const FLOOR_Y = 440;
export const CEILING_Y = 42;

export type PulseMode = "cube" | "ship";
export type PulseGravity = 1 | -1;
export type PulseInput = { atMs: number; action: "down" | "up" };
export type BeatBlock = {
  beat: number;
  widthBeats: number;
  periodBeats: number;
};
export type CubePressGate = {
  beat: number;
  width: number;
  closedBottomY: number;
  openBottomY: number;
  pulseBeats: number;
};

export type ShipGate = {
  beat: number;
  gapY: number;
  closedGap: number;
  openGap: number;
  pulseBeats: number;
};

export type ShipMovingHazard = {
  beat: number;
  width: number;
  height: number;
  centerY: number;
  amplitude: number;
  periodBeats: number;
  phase: number;
};

export const PULSE_SHIP_SECTIONS = [
  { startBeat: 32, endBeat: 58 },
  { startBeat: 128, endBeat: 158 },
] as const;

export const PULSE_GRAVITY_SECTIONS = [
  { startBeat: 76, endBeat: 110 },
] as const;

export const PULSE_MINI_SECTIONS = [
  { startBeat: 190, endBeat: 204 },
] as const;

export const SEGMENTED_FLOOR_START_BEAT = 158;

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

export function pulseMiniAtX(x: number) {
  return PULSE_MINI_SECTIONS.some(
    ({ startBeat, endBeat }) => x >= beatX(startBeat) && x < beatX(endBeat)
  );
}

export function pulseUsesSegmentedFloorAtX(x: number) {
  return x >= beatX(SEGMENTED_FLOOR_START_BEAT);
}

export function pulseDistanceFromProgress(progressPercent: number) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  return Math.round((progress / 100) * LEVEL_DISTANCE_METERS);
}

export function pulseMusicSyncPlan({
  progressPercent,
  currentTime,
  paused,
  ended,
}: {
  progressPercent: number;
  currentTime: number;
  paused: boolean;
  ended: boolean;
}) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  const targetTime = (progress / 100) * (LEVEL_DURATION_MS / 1000);
  return {
    targetTime,
    shouldSeek:
      ended ||
      !Number.isFinite(currentTime) ||
      Math.abs(currentTime - targetTime) > MUSIC_SYNC_TOLERANCE_SECONDS,
    shouldPlay: progress < 100 && (paused || ended),
  };
}

export function pulseSurfaceState(
  mode: PulseMode,
  gravity: PulseGravity,
  segmentedFloor = false
) {
  return {
    groundEnabled: mode === "cube" && gravity === 1 && !segmentedFloor,
    ceilingEnabled: mode === "cube" && gravity === -1,
  };
}

export const COLLAPSING_FLOORS = Array.from({ length: 8 }, (_, index) => ({
  beat: 158.5 + index,
  widthBeats: 1,
})) as readonly { beat: number; widthBeats: number }[];

export const AIR_JUMP_RINGS = [
  { beat: 166.6, y: 335, power: 1350 },
  { beat: 168.05, y: 335, power: 1350 },
  { beat: 169.5, y: 335, power: 1350 },
  { beat: 170.95, y: 335, power: 1350 },
  { beat: 172.4, y: 335, power: 1350 },
  { beat: 173.85, y: 335, power: 1350 },
  { beat: 204.7, y: 340, power: 1100 },
  { beat: 208.2, y: 255, power: 920 },
] as const;

export const BEAT_BLOCKS: readonly BeatBlock[] = Array.from(
  { length: 8 },
  (_, index) => ({ beat: 174.45 + index, widthBeats: 0.9, periodBeats: 2 })
);

export const CUBE_PRESS_GATES: readonly CubePressGate[] = [
  { beat: 184, width: 52, closedBottomY: 440, openBottomY: 338, pulseBeats: 2 },
  { beat: 187, width: 56, closedBottomY: 440, openBottomY: 330, pulseBeats: 2 },
] as const;

export const SPECIAL_FLOOR_PLATFORMS = [
  { beat: 186, widthBeats: 8 },
  { beat: 197, widthBeats: 14 },
  { beat: 205.5, widthBeats: 3 },
  { beat: 209.5, widthBeats: 3 },
  { beat: 218, widthBeats: 12 },
] as const;

export const MINI_CEILING_OBSTACLES = [
  { beat: 192.5, widthBeats: 2.2, bottomY: 399 },
  { beat: 200.5, widthBeats: 2.4, bottomY: 399 },
] as const;

export const DASH_RINGS = [
  { beat: 196, y: 414, durationMs: 620, speedMultiplier: 1.65 },
] as const;

export const BRANCH_PLATFORMS = [
  { beat: 206.5, widthBeats: 2, height: 110 },
  { beat: 209, widthBeats: 2, height: 160 },
  { beat: 212, widthBeats: 2, height: 110 },
] as const;

export function pulseBeatBlockActive(block: BeatBlock, courseBeat: number) {
  const phase = ((courseBeat - block.beat) / block.periodBeats) * Math.PI * 2;
  return Math.cos(phase) >= 0;
}

export function pulsePressGateBottomAtBeat(
  gate: CubePressGate,
  courseBeat: number
) {
  const phase = ((courseBeat - gate.beat) / gate.pulseBeats) * Math.PI * 2;
  const openness = (Math.cos(phase) + 1) / 2;
  return gate.closedBottomY -
    (gate.closedBottomY - gate.openBottomY) * openness;
}

export const SHIP_GATES: readonly ShipGate[] = [
  { beat: 39, gapY: 270, closedGap: 132, openGap: 238, pulseBeats: 2 },
  { beat: 53.2, gapY: 325, closedGap: 132, openGap: 226, pulseBeats: 2 },
  { beat: 135, gapY: 215, closedGap: 128, openGap: 228, pulseBeats: 2 },
  { beat: 148, gapY: 330, closedGap: 128, openGap: 220, pulseBeats: 2 },
] as const;

export const SHIP_MOVING_HAZARDS: readonly ShipMovingHazard[] = [
  { beat: 43, width: 98, height: 104, centerY: 270, amplitude: 135, periodBeats: 4, phase: 0.25 },
  { beat: 55.5, width: 92, height: 96, centerY: 270, amplitude: 125, periodBeats: 3, phase: 0.75 },
  { beat: 138.5, width: 104, height: 110, centerY: 270, amplitude: 140, periodBeats: 4, phase: 0.25 },
  { beat: 151.5, width: 96, height: 104, centerY: 270, amplitude: 135, periodBeats: 3, phase: 0 },
  { beat: 154.2, width: 90, height: 96, centerY: 270, amplitude: 130, periodBeats: 3, phase: 0.5 },
] as const;

export const SHIP_WIND_ZONES = [
  { startBeat: 46, endBeat: 51, forceY: -620 },
  { startBeat: 140.5, endBeat: 145.5, forceY: 560 },
] as const;

export function pulseGateGapAtBeat(gate: ShipGate, courseBeat: number) {
  const phase = ((courseBeat - gate.beat) / gate.pulseBeats) * Math.PI * 2;
  const openness = (Math.cos(phase) + 1) / 2;
  return gate.closedGap + (gate.openGap - gate.closedGap) * openness;
}

export function pulseMovingHazardYAtBeat(
  hazard: ShipMovingHazard,
  courseBeat: number
) {
  const phase =
    ((courseBeat - hazard.beat) / hazard.periodBeats + hazard.phase) * Math.PI * 2;
  return hazard.centerY + Math.sin(phase) * hazard.amplitude;
}

export function pulseWindAtBeat(courseBeat: number) {
  return SHIP_WIND_ZONES.reduce(
    (force, zone) =>
      courseBeat >= zone.startBeat && courseBeat < zone.endBeat
        ? force + zone.forceY
        : force,
    0
  );
}

export const CUBE_SPIKE_BEATS = [
  4, 6, 8, 9, 12, 15, 18,
  61, 64, 72, 73,
  97.7,
  113, 120, 122, 125,
  218, 220, 222,
];

export const CUBE_PLATFORMS = [
  { beat: 20.5, widthBeats: 0.72, height: 50 },
  { beat: 21.45, widthBeats: 0.72, height: 88 },
  { beat: 22.4, widthBeats: 0.72, height: 126 },
  { beat: 23.35, widthBeats: 0.9, height: 164 },
  { beat: 27.75, widthBeats: 2.3, height: 188, bouncePadBeat: 26 },
  { beat: 115.75, widthBeats: 2.3, height: 184, bouncePadBeat: 114 },
] as const;

export const INVERTED_PLATFORMS = [
  { beat: 79.5, widthBeats: 0.72, depth: 50 },
  { beat: 80.45, widthBeats: 0.72, depth: 88 },
  { beat: 81.4, widthBeats: 0.72, depth: 126 },
  { beat: 82.35, widthBeats: 0.9, depth: 164 },
  { beat: 88.75, widthBeats: 2.3, depth: 188, bouncePadBeat: 87 },
  { beat: 98.5, widthBeats: 0.72, depth: 48 },
  { beat: 99.45, widthBeats: 0.72, depth: 86 },
  { beat: 100.4, widthBeats: 0.9, depth: 124 },
  { beat: 103.75, widthBeats: 2.3, depth: 180, bouncePadBeat: 102 },
] as const;

export const BOUNCE_PADS = [
  { beat: 26, power: 1350 },
  { beat: 68, power: 1450 },
  { beat: 114, power: 1350 },
] as const;

export const INVERTED_BOUNCE_PADS = [
  { beat: 87, power: 1350, danger: false },
  { beat: 96.5, power: 1800, danger: true },
  { beat: 102, power: 1350, danger: false },
] as const;

export const CEILING_SPIKES = [
  { beat: 69.1, baseY: 168 },
  { beat: 84.5, baseY: CEILING_Y },
  { beat: 92, baseY: CEILING_Y },
  { beat: 94.5, baseY: CEILING_Y },
  { beat: 106.5, baseY: CEILING_Y },
  { beat: 107.5, baseY: CEILING_Y },
] as const;

export const SHIP_HAZARDS = [
  { beat: 34, side: "bottom" as const, height: 150, width: 105 },
  { beat: 36, side: "top" as const, height: 165, width: 115 },
  { beat: 41, side: "top" as const, height: 135, width: 105 },
  { beat: 45, side: "bottom" as const, height: 155, width: 110 },
  { beat: 48.5, side: "top" as const, height: 145, width: 115 },
  { beat: 51, side: "bottom" as const, height: 145, width: 105 },
  { beat: 130, side: "top" as const, height: 150, width: 120 },
  { beat: 132, side: "bottom" as const, height: 180, width: 120 },
  { beat: 136.7, side: "bottom" as const, height: 135, width: 100 },
  { beat: 140, side: "top" as const, height: 150, width: 110 },
  { beat: 143, side: "bottom" as const, height: 145, width: 110 },
  { beat: 146, side: "top" as const, height: 145, width: 105 },
  { beat: 150, side: "bottom" as const, height: 135, width: 95 },
  { beat: 156, side: "top" as const, height: 155, width: 115 },
];

export const PULSE_COINS = [
  { beat: 29, y: 215 },
  { beat: 93, y: 245 },
  { beat: 211, y: 225 },
];

export function pulseRewardXp(progressPercent: number, completed: boolean, coins: number) {
  const progress = Math.max(0, Math.min(100, progressPercent));
  if (completed) return Math.min(22, Math.round((16 + coins * 2) * 10) / 10);
  return Math.min(8, Math.round((progress / 16) * 10) / 10);
}
