import assert from "node:assert/strict";
import test from "node:test";
import {
  beatX,
  pulseModeAtX,
  SHIP_END_BEAT,
  SHIP_START_BEAT,
} from "../app/games/pulse-runner/level.ts";

test("Pulse Runner changes mode only inside the rocket section", () => {
  const shipStartX = beatX(SHIP_START_BEAT);
  const shipEndX = beatX(SHIP_END_BEAT);

  assert.equal(pulseModeAtX(shipStartX - 1), "cube");
  assert.equal(pulseModeAtX(shipStartX), "ship");
  assert.equal(pulseModeAtX(shipEndX - 1), "ship");
  assert.equal(pulseModeAtX(shipEndX), "cube");
  assert.equal(pulseModeAtX(shipEndX + 1), "cube");
});

test("Pulse Runner does not re-enter rocket mode after returning to cube", () => {
  const shipEndX = beatX(SHIP_END_BEAT);
  const modesAfterPortal = Array.from({ length: 120 }, (_, index) =>
    pulseModeAtX(shipEndX + index * 8)
  );

  assert.deepEqual(new Set(modesAfterPortal), new Set(["cube"]));
});
