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
  pulseGateGapAtBeat,
  pulseGravityAtX,
  pulseModeAtX,
  pulseMovingHazardYAtBeat,
  pulseSurfaceState,
  PULSE_GRAVITY_SECTIONS,
  PULSE_SHIP_SECTIONS,
  PX_PER_BEAT,
  SHIP_HAZARDS,
  SHIP_GATES,
  SHIP_MOVING_HAZARDS,
  SHIP_WIND_ZONES,
  SPIKE_BODY_WIDTH,
  SPIKE_HEIGHT,
  pulseWindAtBeat,
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
  for (const gate of SHIP_GATES) assert.equal(isShipBeat(gate.beat), true);
  for (const hazard of SHIP_MOVING_HAZARDS) assert.equal(isShipBeat(hazard.beat), true);
  for (const zone of SHIP_WIND_ZONES) {
    assert.equal(isShipBeat(zone.startBeat), true);
    assert.equal(isShipBeat(zone.endBeat - 0.01), true);
  }
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

test("beat gates are widest exactly when the rocket reaches them", () => {
  for (const gate of SHIP_GATES) {
    assert.equal(pulseGateGapAtBeat(gate, gate.beat), gate.openGap);
    assert.equal(
      pulseGateGapAtBeat(gate, gate.beat + gate.pulseBeats / 2),
      gate.closedGap
    );
    for (let offset = -4; offset <= 4; offset += 0.125) {
      const gap = pulseGateGapAtBeat(gate, gate.beat + offset);
      assert.ok(gap >= gate.closedGap && gap <= gate.openGap);
    }
  }
});

test("moving rocket hazards stay on-screen and follow deterministic beat phases", () => {
  for (const hazard of SHIP_MOVING_HAZARDS) {
    const arrivalY = pulseMovingHazardYAtBeat(hazard, hazard.beat);
    const repeatedY = pulseMovingHazardYAtBeat(
      hazard,
      hazard.beat + hazard.periodBeats
    );
    assert.ok(Math.abs(arrivalY - repeatedY) < 0.001);
    for (let offset = 0; offset <= hazard.periodBeats; offset += 0.1) {
      const y = pulseMovingHazardYAtBeat(hazard, hazard.beat + offset);
      assert.ok(y - hazard.height / 2 >= 0);
      assert.ok(y + hazard.height / 2 <= 540);
    }
  }
});

test("rocket wind applies only inside each marked zone", () => {
  for (const zone of SHIP_WIND_ZONES) {
    assert.equal(pulseWindAtBeat(zone.startBeat - 0.001), 0);
    assert.equal(pulseWindAtBeat(zone.startBeat), zone.forceY);
    assert.equal(pulseWindAtBeat((zone.startBeat + zone.endBeat) / 2), zone.forceY);
    assert.equal(pulseWindAtBeat(zone.endBeat), 0);
  }
});

test("both rocket sections have a traversable one-button flight path", () => {
  const shipWidth = 52;
  const shipHeight = 28;
  const stepsPerBeat = 16;
  const deltaSeconds = BEAT_MS / 1000 / stepsPerBeat;

  const collidesAt = (courseBeat, y) => {
    if (y - shipHeight / 2 < 12 || y + shipHeight / 2 > 528) return true;

    for (const hazard of SHIP_HAZARDS) {
      const horizontalDistance = Math.abs(courseBeat - hazard.beat) * PX_PER_BEAT;
      if (horizontalDistance > (shipWidth + hazard.width) / 2) continue;
      if (hazard.side === "top" && y - shipHeight / 2 < hazard.height) return true;
      if (hazard.side === "bottom" && y + shipHeight / 2 > 540 - hazard.height) return true;
    }

    for (const gate of SHIP_GATES) {
      const horizontalDistance = Math.abs(courseBeat - gate.beat) * PX_PER_BEAT;
      if (horizontalDistance > (shipWidth + 44) / 2) continue;
      const gap = pulseGateGapAtBeat(gate, courseBeat);
      if (
        y - shipHeight / 2 < gate.gapY - gap / 2 ||
        y + shipHeight / 2 > gate.gapY + gap / 2
      ) return true;
    }

    for (const hazard of SHIP_MOVING_HAZARDS) {
      const horizontalDistance = Math.abs(courseBeat - hazard.beat) * PX_PER_BEAT;
      if (horizontalDistance > (shipWidth + hazard.width) / 2) continue;
      const hazardY = pulseMovingHazardYAtBeat(hazard, courseBeat);
      if (Math.abs(y - hazardY) < (shipHeight + hazard.height) / 2) return true;
    }

    return false;
  };

  for (const section of PULSE_SHIP_SECTIONS) {
    let states = new Map([["300:-80", { y: 300, velocityY: -80 }]]);
    const totalSteps = Math.ceil((section.endBeat - section.startBeat) * stepsPerBeat);

    for (let step = 1; step <= totalSteps; step += 1) {
      const courseBeat = section.startBeat + step / stepsPerBeat;
      const nextStates = new Map();
      for (const state of states.values()) {
        for (const pressed of [false, true]) {
          const acceleration = (pressed ? -1450 : 1050) + pulseWindAtBeat(courseBeat);
          const velocityY = Math.max(
            -430,
            Math.min(430, state.velocityY + acceleration * deltaSeconds)
          );
          const y = state.y + velocityY * deltaSeconds;
          if (collidesAt(courseBeat, y)) continue;
          const key = `${Math.round(y / 5)}:${Math.round(velocityY / 20)}`;
          if (!nextStates.has(key)) nextStates.set(key, { y, velocityY });
        }
      }
      states = nextStates;
      assert.ok(
        states.size > 0,
        `rocket section ${section.startBeat}-${section.endBeat} becomes impossible near beat ${courseBeat}`
      );
    }
  }
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

test("held one-beat jumps clear every consecutive spike in rhythm", () => {
  const sequences = [];
  let currentSequence = [];
  for (const beat of CUBE_SPIKE_BEATS) {
    const previous = currentSequence.at(-1);
    if (previous == null || beat - previous <= 1.05) {
      currentSequence.push(beat);
    } else {
      if (currentSequence.length > 1) sequences.push(currentSequence);
      currentSequence = [beat];
    }
  }
  if (currentSequence.length > 1) sequences.push(currentSequence);

  const jumpBeats = ((2 * CUBE_JUMP_SPEED) / CUBE_GRAVITY) / (BEAT_MS / 1000);
  assert.ok(Math.abs(jumpBeats - 1) < 0.001);
  const apexRise = CUBE_JUMP_SPEED ** 2 / (2 * CUBE_GRAVITY);
  assert.ok(apexRise > SPIKE_HEIGHT + 10);

  for (const sequence of sequences) {
    for (let index = 1; index < sequence.length; index += 1) {
      const beatGap = sequence[index] - sequence[index - 1];
      assert.ok(Math.abs(beatGap - jumpBeats) < 0.001, "spikes must match held-jump cadence");
      const centerDistance = beatGap * PX_PER_BEAT;
      const safeLandingWidth = centerDistance - SPIKE_BODY_WIDTH - CUBE_BODY_SIZE;
      assert.ok(safeLandingWidth >= 100, "landing point between jumps must stay clear");
    }
  }
});
