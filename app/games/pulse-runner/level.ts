export const PULSE_GAME_VERSION = "pulse_runner_v3";
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
export const LEVEL_BEATS = 176;
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

export function pulseSurfaceState(mode: PulseMode, gravity: PulseGravity) {
  return {
    groundEnabled: mode === "cube" && gravity === 1,
    ceilingEnabled: mode === "cube" && gravity === -1,
  };
}

export const SHIP_GATES: readonly ShipGate[] = [
  { beat: 39, gapY: 270, closedGap: 132, openGap: 238, pulseBeats: 2 },
  { beat: 53.2, gapY: 325, closedGap: 132, openGap: 226, pulseBeats: 2 },
  { beat: 119, gapY: 215, closedGap: 128, openGap: 228, pulseBeats: 2 },
  { beat: 132, gapY: 330, closedGap: 128, openGap: 220, pulseBeats: 2 },
] as const;

export const SHIP_MOVING_HAZARDS: readonly ShipMovingHazard[] = [
  { beat: 43, width: 98, height: 104, centerY: 270, amplitude: 135, periodBeats: 4, phase: 0.25 },
  { beat: 55.5, width: 92, height: 96, centerY: 270, amplitude: 125, periodBeats: 3, phase: 0.75 },
  { beat: 122.5, width: 104, height: 110, centerY: 270, amplitude: 140, periodBeats: 4, phase: 0.25 },
  { beat: 135.5, width: 96, height: 104, centerY: 270, amplitude: 135, periodBeats: 3, phase: 0 },
  { beat: 138.2, width: 90, height: 96, centerY: 270, amplitude: 130, periodBeats: 3, phase: 0.5 },
] as const;

export const SHIP_WIND_ZONES = [
  { startBeat: 46, endBeat: 51, forceY: -620 },
  { startBeat: 124.5, endBeat: 129.5, forceY: 560 },
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
  { beat: 68, power: 1450 },
  { beat: 98, power: 1350 },
  { beat: 158.5, power: 1450 },
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
  { beat: 41, side: "top" as const, height: 135, width: 105 },
  { beat: 45, side: "bottom" as const, height: 155, width: 110 },
  { beat: 48.5, side: "top" as const, height: 145, width: 115 },
  { beat: 51, side: "bottom" as const, height: 145, width: 105 },
  { beat: 114, side: "top" as const, height: 150, width: 120 },
  { beat: 116, side: "bottom" as const, height: 180, width: 120 },
  { beat: 120.7, side: "bottom" as const, height: 135, width: 100 },
  { beat: 124, side: "top" as const, height: 150, width: 110 },
  { beat: 127, side: "bottom" as const, height: 145, width: 110 },
  { beat: 130, side: "top" as const, height: 145, width: 105 },
  { beat: 134, side: "bottom" as const, height: 135, width: 95 },
  { beat: 140, side: "top" as const, height: 155, width: 115 },
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
