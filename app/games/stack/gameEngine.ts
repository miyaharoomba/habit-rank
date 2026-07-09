export const STACK_GAME_VERSION = "stack_v2";
export const BASE_SIZE = 3.2;
export const MAX_STACK_SIZE = 4.25;
export const PERFECT_SIZE_UP_INTERVAL = 5;
export const PERFECT_SIZE_UP_AMOUNT = 0.35;
export const BLOCK_HEIGHT = 0.52;
export const TRAVEL_LIMIT = 4.8;
export const MAX_REPLAY_TAPS = 100;

export type StackAxis = "x" | "z";

export type StackBlock = {
  x: number;
  z: number;
  width: number;
  depth: number;
};

export type StackCut = StackBlock & {
  axis: StackAxis;
};

export type StackPlacement = {
  gameOver: boolean;
  perfect: boolean;
  overlapRatio: number;
  block: StackBlock | null;
  cut: StackCut | null;
  combo: number;
  points: number;
  sizeUp: boolean;
};

export type StackReplayResult = {
  score: number;
  blocks: number;
  perfects: number;
  maxCombo: number;
  gameOver: boolean;
  stack: StackBlock[];
};

export function initialStack(): StackBlock[] {
  return [{ x: 0, z: 0, width: BASE_SIZE, depth: BASE_SIZE }];
}

export function axisForStage(stage: number): StackAxis {
  return stage % 2 === 1 ? "x" : "z";
}

function seededSign(seed: number, stage: number) {
  let value = (seed ^ Math.imul(stage + 1, 0x45d9f3b)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b) >>> 0;
  value ^= value >>> 16;
  return (value & 1) === 0 ? 1 : -1;
}

export function speedForStage(stage: number) {
  return Math.min(6.2, 2.35 + Math.max(0, stage - 1) * 0.095);
}

export function movingCoordinate(stage: number, elapsedMs: number, seed: number) {
  const distance = Math.max(0, elapsedMs) * speedForStage(stage) / 1000;
  const span = TRAVEL_LIMIT * 2;
  const cycle = span * 2;
  const phase = distance % cycle;
  const coordinate =
    phase <= span
      ? -TRAVEL_LIMIT + phase
      : TRAVEL_LIMIT - (phase - span);
  return coordinate * seededSign(seed, stage);
}

export function movingBlock(
  previous: StackBlock,
  stage: number,
  elapsedMs: number,
  seed: number
): StackBlock {
  const axis = axisForStage(stage);
  const coordinate = movingCoordinate(stage, elapsedMs, seed);

  return {
    x: axis === "x" ? coordinate : previous.x,
    z: axis === "z" ? coordinate : previous.z,
    width: previous.width,
    depth: previous.depth,
  };
}

export function placeBlock({
  previous,
  moving,
  stage,
  combo,
}: {
  previous: StackBlock;
  moving: StackBlock;
  stage: number;
  combo: number;
}): StackPlacement {
  const axis = axisForStage(stage);
  const previousCenter = axis === "x" ? previous.x : previous.z;
  const movingCenter = axis === "x" ? moving.x : moving.z;
  const size = axis === "x" ? previous.width : previous.depth;
  const offset = movingCenter - previousCenter;
  const perfectTolerance = Math.min(0.09, Math.max(0.045, size * 0.035));
  const perfect = Math.abs(offset) <= perfectTolerance;

  if (perfect) {
    const nextCombo = combo + 1;
    const shouldSizeUp = nextCombo % PERFECT_SIZE_UP_INTERVAL === 0;
    const width = shouldSizeUp
      ? Math.min(MAX_STACK_SIZE, moving.width + PERFECT_SIZE_UP_AMOUNT)
      : moving.width;
    const depth = shouldSizeUp
      ? Math.min(MAX_STACK_SIZE, moving.depth + PERFECT_SIZE_UP_AMOUNT)
      : moving.depth;
    const sizeUp = width > moving.width || depth > moving.depth;

    return {
      gameOver: false,
      perfect: true,
      overlapRatio: 1,
      block: {
        ...moving,
        x: axis === "x" ? previous.x : moving.x,
        z: axis === "z" ? previous.z : moving.z,
        width,
        depth,
      },
      cut: null,
      combo: nextCombo,
      points: 250 + Math.min(300, nextCombo * 20) + (sizeUp ? 180 : 0),
      sizeUp,
    };
  }

  const overlap = size - Math.abs(offset);
  if (overlap <= 0) {
    return {
      gameOver: true,
      perfect: false,
      overlapRatio: 0,
      block: null,
      cut: { ...moving, axis },
      combo: 0,
      points: 0,
      sizeUp: false,
    };
  }

  const overlapRatio = overlap / size;
  const placedCenter = previousCenter + offset / 2;
  const cutSize = size - overlap;
  const cutCenter =
    offset > 0
      ? previousCenter + size / 2 + cutSize / 2
      : previousCenter - size / 2 - cutSize / 2;

  const block: StackBlock = {
    ...moving,
    x: axis === "x" ? placedCenter : moving.x,
    z: axis === "z" ? placedCenter : moving.z,
    width: axis === "x" ? overlap : moving.width,
    depth: axis === "z" ? overlap : moving.depth,
  };

  const cut: StackCut = {
    ...moving,
    x: axis === "x" ? cutCenter : moving.x,
    z: axis === "z" ? cutCenter : moving.z,
    width: axis === "x" ? cutSize : moving.width,
    depth: axis === "z" ? cutSize : moving.depth,
    axis,
  };

  return {
    gameOver: false,
    perfect: false,
    overlapRatio,
    block,
    cut,
    combo: 0,
    points: 80 + Math.round(overlapRatio * 140),
    sizeUp: false,
  };
}

export function evaluateReplay(tapsMs: number[], seed: number): StackReplayResult {
  const stack = initialStack();
  let score = 0;
  let perfects = 0;
  let combo = 0;
  let maxCombo = 0;
  let gameOver = false;

  for (let index = 0; index < tapsMs.length && index < MAX_REPLAY_TAPS; index += 1) {
    const stage = index + 1;
    const previous = stack[stack.length - 1];
    const moving = movingBlock(previous, stage, tapsMs[index], seed);
    const placement = placeBlock({ previous, moving, stage, combo });

    if (placement.gameOver || !placement.block) {
      gameOver = true;
      break;
    }

    stack.push(placement.block);
    score += placement.points;
    combo = placement.combo;
    maxCombo = Math.max(maxCombo, combo);
    if (placement.perfect) perfects += 1;
  }

  return {
    score,
    blocks: stack.length - 1,
    perfects,
    maxCombo,
    gameOver,
    stack,
  };
}

export function stackRewardXp(score: number) {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.min(15, Math.round((1.5 + score / 450) * 10) / 10);
}
