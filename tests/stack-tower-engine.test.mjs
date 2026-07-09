import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_SIZE,
  evaluateReplay,
  initialStack,
  MAX_STACK_SIZE,
  PERFECT_SIZE_UP_AMOUNT,
  PERFECT_SIZE_UP_START,
  placeBlock,
  speedForStage,
  STACK_GAME_VERSION,
} from "../app/games/stack/gameEngine.ts";

test("perfect placements grow the stack every time after the fifth combo", () => {
  const stack = initialStack();
  let combo = 0;
  const placements = [];

  for (let stage = 1; stage <= PERFECT_SIZE_UP_START + 2; stage += 1) {
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
    assert.equal(placement.sizeUp, stage >= PERFECT_SIZE_UP_START);

    placements.push(placement);
    stack.push(placement.block);
    combo = placement.combo;
  }

  const grown = stack.at(-1);
  const growthCount = placements.filter((placement) => placement.sizeUp).length;
  assert.equal(growthCount, 3);
  assert.equal(grown.width, Math.min(MAX_STACK_SIZE, BASE_SIZE + PERFECT_SIZE_UP_AMOUNT * 3));
  assert.equal(grown.depth, Math.min(MAX_STACK_SIZE, BASE_SIZE + PERFECT_SIZE_UP_AMOUNT * 3));
});

test("perfect size boosts are capped and reflected in replay evaluation", () => {
  const tapsMs = Array.from({ length: PERFECT_SIZE_UP_START + 10 }, (_, index) =>
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
  assert.equal(STACK_GAME_VERSION, "stack_v3");
});
