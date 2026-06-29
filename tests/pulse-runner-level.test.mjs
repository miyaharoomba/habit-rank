import assert from "node:assert/strict";
import test from "node:test";
import {
  BOUNCE_PADS,
  BOUNCE_PAD_WIDTH,
  BEAT_MS,
  beatX,
  CUBE_PLATFORMS,
  CUBE_BODY_SIZE,
  CUBE_GRAVITY,
  CUBE_JUMP_SPEED,
  CUBE_MAX_VERTICAL_SPEED,
  CUBE_SPIKE_BEATS,
  LEVEL_BEATS,
  LEVEL_DISTANCE_METERS,
  pulseDistanceFromProgress,
  pulseGravityAtX,
  pulseModeAtX,
  pulseSurfaceState,
  PULSE_GRAVITY_SECTIONS,
  PULSE_SHIP_SECTIONS,
  SHIP_HAZARDS,
} from "../app/games/pulse-runner/level.ts";

test("each rocket section has stable boundaries and does not re-enter after its portal", () => {
  for (const { startBeat, endBeat } of PULSE_SHIP_SECTIONS) {
    const startX = beatX(startBeat);
    const endX = beatX(endBeat);
    assert.equal(pulseModeAtX(startX - 1), "cube");
    assert.equal(pulseModeAtX(startX), "ship");
    assert.equal(pulseModeAtX(endX - 1), "ship");
    assert.equal(pulseModeAtX(endX), "cube");
  }

  const finalEndX = beatX(PULSE_SHIP_SECTIONS.at(-1).endBeat);
  const modesAfterFinalPortal = Array.from({ length: 240 }, (_, index) =>
    pulseModeAtX(finalEndX + index * 8)
  );
  assert.deepEqual(new Set(modesAfterFinalPortal), new Set(["cube"]));
});

test("gravity inversion is active only inside configured cube sections", () => {
  for (const { startBeat, endBeat } of PULSE_GRAVITY_SECTIONS) {
    const startX = beatX(startBeat);
    const endX = beatX(endBeat);
    assert.equal(pulseGravityAtX(startX - 1), 1);
    assert.equal(pulseGravityAtX(startX), -1);
    assert.equal(pulseGravityAtX(endX - 1), -1);
    assert.equal(pulseGravityAtX(endX), 1);
  }
});

test("mode surfaces are restored correctly after every transformation", () => {
  assert.deepEqual(pulseSurfaceState("cube", 1), {
    groundEnabled: true,
    ceilingEnabled: false,
  });
  assert.deepEqual(pulseSurfaceState("ship", 1), {
    groundEnabled: false,
    ceilingEnabled: false,
  });
  assert.deepEqual(pulseSurfaceState("cube", -1), {
    groundEnabled: false,
    ceilingEnabled: true,
  });
  assert.deepEqual(pulseSurfaceState("cube", 1), {
    groundEnabled: true,
    ceilingEnabled: false,
  });
});

test("distance score is clamped and derived from course progress", () => {
  assert.equal(pulseDistanceFromProgress(-10), 0);
  assert.equal(pulseDistanceFromProgress(50), LEVEL_DISTANCE_METERS / 2);
  assert.equal(pulseDistanceFromProgress(100), LEVEL_DISTANCE_METERS);
  assert.equal(pulseDistanceFromProgress(130), LEVEL_DISTANCE_METERS);
});

test("course objects stay inside their intended mode sections", () => {
  const isShipBeat = (beat) =>
    PULSE_SHIP_SECTIONS.some(({ startBeat, endBeat }) => beat >= startBeat && beat < endBeat);

  for (const hazard of SHIP_HAZARDS) assert.equal(isShipBeat(hazard.beat), true);
  for (const beat of CUBE_SPIKE_BEATS) assert.equal(isShipBeat(beat), false);
  for (const platform of CUBE_PLATFORMS) assert.equal(isShipBeat(platform.beat), false);
  for (const pad of BOUNCE_PADS) assert.equal(isShipBeat(pad.beat), false);
  for (const section of PULSE_GRAVITY_SECTIONS) {
    assert.equal(isShipBeat(section.startBeat), false);
    assert.equal(isShipBeat(section.endBeat - 0.01), false);
  }

  const furthestBeat = Math.max(
    ...SHIP_HAZARDS.map(({ beat }) => beat),
    ...CUBE_SPIKE_BEATS,
    ...CUBE_PLATFORMS.map(({ beat }) => beat),
    ...BOUNCE_PADS.map(({ beat }) => beat)
  );
  assert.ok(furthestBeat < LEVEL_BEATS);
});

test("safe bounce pads clear the leading wall and land on their high platform", () => {
  for (const platform of CUBE_PLATFORMS.filter((item) => "bouncePadBeat" in item)) {
    const pad = BOUNCE_PADS.find((item) => item.beat === platform.bouncePadBeat);
    assert.ok(pad);

    assert.ok(pad.power < CUBE_MAX_VERTICAL_SPEED, "bounce power must not be velocity-capped");
    const contactOffsetBeats = (BOUNCE_PAD_WIDTH / 2 + CUBE_BODY_SIZE / 2) / 190;
    const launchBeat = pad.beat - contactOffsetBeats;
    const leadingBeat = platform.beat - platform.widthBeats / 2;
    const secondsToWall = (leadingBeat - launchBeat) * (BEAT_MS / 1000);
    const displacementAtWall =
      -pad.power * secondsToWall + (CUBE_GRAVITY / 2) * secondsToWall ** 2;
    const playerBottomAtWall = 440 + displacementAtWall;
    const platformTop = 440 - platform.height;
    assert.ok(playerBottomAtWall < platformTop, "bounce must clear the platform wall");

    const discriminant = pad.power ** 2 - 2 * CUBE_GRAVITY * platform.height;
    assert.ok(discriminant > 0, "bounce must rise above the platform");
    const landingSeconds = (pad.power + Math.sqrt(discriminant)) / CUBE_GRAVITY;
    const landingBeat = launchBeat + landingSeconds / (BEAT_MS / 1000);
    const trailingBeat = platform.beat + platform.widthBeats / 2;
    assert.ok(landingBeat >= leadingBeat && landingBeat <= trailingBeat);
  }
});

test("normal jump cadence matches one beat and lands on each rising stair", () => {
  const airtimeMs = (2 * CUBE_JUMP_SPEED * 1000) / CUBE_GRAVITY;
  assert.ok(Math.abs(airtimeMs - BEAT_MS) < 1, "normal jump must stay synchronized to one beat");

  const risingStairPairs = CUBE_PLATFORMS.slice(0, -1)
    .map((platform, index) => [platform, CUBE_PLATFORMS[index + 1]])
    .filter(
      ([current, next]) =>
        next.beat - current.beat <= 1 &&
        next.height > current.height &&
        next.height - current.height <= 40
    );

  for (const [current, next] of risingStairPairs) {
    const rise = next.height - current.height;
    const discriminant = CUBE_JUMP_SPEED ** 2 - 2 * CUBE_GRAVITY * rise;
    assert.ok(discriminant > 0);
    const landingSeconds = (CUBE_JUMP_SPEED + Math.sqrt(discriminant)) / CUBE_GRAVITY;
    const landingBeat = current.beat + landingSeconds / (BEAT_MS / 1000);
    const nextLeadingBeat = next.beat - next.widthBeats / 2;
    const nextTrailingBeat = next.beat + next.widthBeats / 2;
    assert.ok(
      landingBeat >= nextLeadingBeat && landingBeat <= nextTrailingBeat,
      `jump from ${current.beat} must land on stair ${next.beat}`
    );
  }
});
