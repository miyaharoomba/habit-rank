import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_SIZE,
  evaluateReplay,
  initialStack,
  MAX_STACK_SIZE,
  PERFECT_SIZE_UP_AMOUNT,
  PERFECT_SIZE_UP_INTERVAL,
  placeBlock,
  speedForStage,
  STACK_GAME_VERSION,
} from "../app/games/stack/gameEngine.ts";

test("five consecutive perfect placements increase the stack size", () => {
  const stack = initialStack();
  let combo = 0;

  for (let stage = 1; stage <= PERFECT_SIZE_UP_INTERVAL; stage += 1) {
    const previous = stack.at(-1);
    const placement = placeBlock({
      previous,
      moving: previous,
      stage,
      combo,
    });

    assert.equal(placement.gameOver, false);
    assert.equal(placement.perfect, true);
    assert.equal(placement.combo, stage);
    assert.equal(placement.sizeUp, stage === PERFECT_SIZE_UP_INTERVAL);

    stack.push(placement.block);
    combo = placement.combo;
  }

  const grown = stack.at(-1);
  assert.equal(grown.width, BASE_SIZE + PERFECT_SIZE_UP_AMOUNT);
  assert.equal(grown.depth, BASE_SIZE + PERFECT_SIZE_UP_AMOUNT);
});

test("perfect size boosts are capped and reflected in replay evaluation", () => {
  const tapsMs = Array.from({ length: PERFECT_SIZE_UP_INTERVAL * 8 }, (_, index) =>
    Math.round(4800 / speedForStage(index + 1))
  );
  const result = evaluateReplay(tapsMs, 0);
  const top = result.stack.at(-1);

  assert.equal(result.gameOver, false);
  assert.equal(result.maxCombo, tapsMs.length);
  assert.equal(top.width, MAX_STACK_SIZE);
  assert.equal(top.depth, MAX_STACK_SIZE);
});

test("stack version is bumped for the size-up scoring rule", () => {
  assert.equal(STACK_GAME_VERSION, "stack_v2");
});
