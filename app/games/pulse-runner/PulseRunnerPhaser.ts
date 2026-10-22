import { applyPulseInput, createPulseState, MAX_PULSE_INPUTS, pulseElapsed, pulseProgress, PULSE_STEP_MS, stepPulse } from "./gameEngine";
import {
  AIR_JUMP_RINGS,
  AIR_RING_BODY_SIZE,
  BEAT_MS,
  BEAT_BLOCKS,
  beatX,
  BOUNCE_PAD_WIDTH,
  BOUNCE_PADS,
  BRANCH_PLATFORMS,
  CEILING_SPIKES,
  CEILING_Y,
  COLLAPSING_FLOORS,
  CUBE_PLATFORMS,
  CUBE_PRESS_GATES,
  CUBE_BODY_SIZE,
  CUBE_SPIKE_BEATS,
  DASH_RINGS,
  FLOOR_Y,
  INVERTED_BOUNCE_PADS,
  INVERTED_PLATFORMS,
  LEVEL_BEATS,
  LEVEL_END_X,
  LEVEL_START_X,
  MINI_CEILING_OBSTACLES,
  PULSE_COINS,
  PULSE_DEBUG_SPEEDS,
  pulseBeatBlockActive,
  pulseDebugRewindBeat,
  pulseDistanceFromProgress,
  pulseGateGapAtBeat,
  pulseGravityAtX,
  PULSE_GRAVITY_SECTIONS,
  PULSE_MINI_SECTIONS,
  pulseMiniAtX,
  pulseModeAtX,
  pulseMovingHazardYAtBeat,
  pulsePressGateBottomAtBeat,
  PULSE_SHIP_SECTIONS,
  PX_PER_BEAT,
  RUN_SPEED,
  SHIP_GATES,
  SHIP_HAZARDS,
  SHIP_MOVING_HAZARDS,
  SHIP_WIND_ZONES,
  SPECIAL_FLOOR_PLATFORMS,
  SPIKE_BODY_WIDTH,
  pulseSurfaceState,
  pulseUsesSegmentedFloorAtX,
  pulseWindAtBeat,
  type PulseGravity,
  type PulseInput,
  type PulseMode,
} from "./level";

export type PulseRunSummary = {
  progressPercent: number;
  distanceMeters: number;
  completed: boolean;
  durationMs: number;
  coins: number;
  inputs: PulseInput[];
};

export type PulseRunnerCallbacks = {
  onReady: () => void;
  onProgress: (progress: number) => void;
  onModeChange: (mode: PulseMode) => void;
  onInteraction: () => void;
  onFinish: (summary: PulseRunSummary) => void;
};

type PhaserGame = import("phaser").Game;
type ArcadeSprite = import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;
type ArcadeBody = import("phaser").Physics.Arcade.Body;
type GateRuntime = {
  gate: (typeof SHIP_GATES)[number];
  top: import("phaser").GameObjects.Rectangle;
  bottom: import("phaser").GameObjects.Rectangle;
};
type MovingHazardRuntime = {
  hazard: (typeof SHIP_MOVING_HAZARDS)[number];
  object: import("phaser").GameObjects.Rectangle;
};
type WindStreakRuntime = {
  object: import("phaser").GameObjects.Rectangle;
  baseX: number;
  phase: number;
  speed: number;
  direction: -1 | 1;
  wobble: number;
  baseAlpha: number;
};
type BeatBlockRuntime = {
  block: (typeof BEAT_BLOCKS)[number];
  object: import("phaser").GameObjects.Rectangle;
};
type PressGateRuntime = {
  gate: (typeof CUBE_PRESS_GATES)[number];
  object: import("phaser").GameObjects.Rectangle;
};

function clampProgress(x: number) {
  return Math.max(0, Math.min(100, ((x - LEVEL_START_X) / (LEVEL_END_X - LEVEL_START_X)) * 100));
}

export async function mountPulseRunner({
  parent,
  callbacks,
  debugMode = false,
}: {
  parent: HTMLElement;
  callbacks: PulseRunnerCallbacks;
  debugMode?: boolean;
}) {
  const PhaserModule = await import("phaser");
  const Phaser = (PhaserModule.default ?? PhaserModule) as typeof PhaserModule;

  class PulseRunnerScene extends Phaser.Scene {
    private simulation = createPulseState();
    private simulationAccumulator = 0;
    private simulationWallTime = 0;
    private inputCursor = 0;
    private player!: ArcadeSprite;
    private ground!: import("phaser").GameObjects.Rectangle;
    private ceiling!: import("phaser").GameObjects.Rectangle;
    private hazards!: import("phaser").Physics.Arcade.StaticGroup;
    private platforms!: import("phaser").Physics.Arcade.StaticGroup;
    private bouncePads!: import("phaser").Physics.Arcade.StaticGroup;
    private airRings!: import("phaser").Physics.Arcade.StaticGroup;
    private dashRings!: import("phaser").Physics.Arcade.StaticGroup;
    private coinsGroup!: import("phaser").Physics.Arcade.StaticGroup;
    private movingHazards!: import("phaser").Physics.Arcade.Group;
    private gateRuntimes: GateRuntime[] = [];
    private movingHazardRuntimes: MovingHazardRuntime[] = [];
    private windStreakRuntimes: WindStreakRuntime[] = [];
    private beatBlockRuntimes: BeatBlockRuntime[] = [];
    private pressGateRuntimes: PressGateRuntime[] = [];
    private mode: PulseMode = "cube";
    private gravityDirection: PulseGravity = 1;
    private mini = false;
    private pressed = false;
    private startedAt = 0;
    private lastProgressAt = 0;
    private inputs: PulseInput[] = [];
    private coins = 0;
    private ended = false;
    private started = false;
    private orientationPaused = false;
    private orientationPausedAt = 0;
    private debugSpeedMultiplier = 1;
    private beatFlash!: import("phaser").GameObjects.Rectangle;
    private modeLabel!: import("phaser").GameObjects.Text;

    constructor() {
      super("pulse-runner");
    }

    create() {
      this.createTextures();
      this.createBackground();
      this.hazards = this.physics.add.staticGroup();
      this.platforms = this.physics.add.staticGroup();
      this.bouncePads = this.physics.add.staticGroup();
      this.airRings = this.physics.add.staticGroup();
      this.dashRings = this.physics.add.staticGroup();
      this.coinsGroup = this.physics.add.staticGroup();
      this.movingHazards = this.physics.add.group({ allowGravity: false, immovable: true });
      this.createSurfaces();
      this.createLevel();
      this.createPlayer();
      this.bindInput();

      this.physics.pause();
      this.verifyRenderedPixels();
      callbacks.onModeChange(this.mode);
      callbacks.onReady();
    }

    update(time: number) {
      if (!this.started || this.ended || this.orientationPaused || !this.player?.body) return;
      const now = performance.now();
      this.simulationAccumulator += Math.max(0, now - this.simulationWallTime) * this.debugSpeedMultiplier;
      this.simulationWallTime = now;
      const state = this.simulation;
      while (this.simulationAccumulator >= PULSE_STEP_MS && !state.ended) {
        while (this.inputCursor < this.inputs.length &&
          this.inputs[this.inputCursor].atMs <= pulseElapsed(state) + .00001) {
          applyPulseInput(state, this.inputs[this.inputCursor++]);
        }
        stepPulse(state, debugMode);
        this.simulationAccumulator -= PULSE_STEP_MS;
      }
      if (state.mode !== this.mode) this.switchMode(state.mode);
      if (state.gravity !== this.gravityDirection) this.switchGravity(state.gravity);
      if (state.mini !== this.mini) this.switchCubeSize(state.mini);
      (this.player.body as ArcadeBody).reset(state.x, state.y);
      this.coins = state.coins;
      this.syncSurfaces();
      const courseBeat = (state.x - LEVEL_START_X) / PX_PER_BEAT;
      this.updateNormalMechanics(courseBeat);
      this.updateShipMechanics(courseBeat);
      this.updateWindEffects(time);
      if (state.mode === "cube") {
        if (state.grounded) this.player.setAngle(Math.round(this.player.angle / 90) * 90);
        else this.player.angle += 260 * state.gravity * this.game.loop.delta / 1000;
      } else {
        this.player.setAngle(Math.max(-24, Math.min(28, state.vy * .07)));
        const wind = pulseWindAtBeat(courseBeat);
        this.modeLabel.setText(wind < 0 ? "ROCKET // UPDRAFT" : wind > 0 ? "ROCKET // DOWNDRAFT" : "ROCKET MODE");
      }
      for (const [prefix, group] of [["air", this.airRings], ["dash", this.dashRings], ["coin", this.coinsGroup]] as const) {
        group.getChildren().forEach((object, index) => {
          const sprite = object as import("phaser").Physics.Arcade.Image;
          if (state.used.includes(prefix + ":" + index)) {
            if (prefix === "coin") sprite.setVisible(false); else sprite.setAlpha(.28);
          }
        });
      }
      for (const object of this.platforms.getChildren()) {
        const platform = object as import("phaser").GameObjects.Rectangle;
        if (platform.getData("collapsible") !== true) continue;
        const index = COLLAPSING_FLOORS.findIndex(p => beatX(p.beat) === platform.x);
        const remaining = state.collapseAt[index] - pulseElapsed(state);
        if (remaining < 0) platform.setAlpha(Math.max(0, .92 + remaining / 280));
      }
      this.bouncePads.getChildren().forEach((object, index) => {
        if (!state.used.includes("pad:" + index)) return;
        const pad = object as import("phaser").GameObjects.Rectangle;
        pad.setFillStyle(pad.getData("danger") ? 0xff6b7a : 0x7bf1a8, .45);
      });
      if (state.pressed && state.mode === "ship" && time % 80 < 20) {
        const spark = this.add.circle(state.x - 32, state.y, 5, 0xffd166, .9).setDepth(9);
        this.tweens.add({targets:spark,x:spark.x-42,alpha:0,scale:.2,duration:220,onComplete:()=>spark.destroy()});
      }
      if (pulseElapsed(state) < state.dashUntil && time % 55 < 18) {
        const trail = this.add.rectangle(state.x-34,state.y,52,state.mini?14:20,0x62d8ff,.55).setDepth(8);
        this.tweens.add({targets:trail,x:trail.x-90,scaleX:1.8,alpha:0,duration:240,onComplete:()=>trail.destroy()});
      }
      this.cameras.main.scrollX = Math.max(0, state.x - 190);
      const beatPhase = (pulseElapsed(state) % BEAT_MS) / BEAT_MS;
      this.beatFlash.setAlpha(Math.max(0, .09 * (1 - beatPhase * 4)));
      if (time - this.lastProgressAt > 100) {
        this.lastProgressAt = time;
        callbacks.onProgress(pulseProgress(state));
      }
      if (state.ended) this.finish(state.completed);
    }

    private createTextures() {
      const cube = this.add.graphics().setVisible(false);
      cube.fillStyle(0x62d8ff, 1).fillRoundedRect(0, 0, 48, 48, 5);
      cube.lineStyle(4, 0xffffff, 0.9).strokeRoundedRect(2, 2, 44, 44, 4);
      cube.fillStyle(0x09111f, 1).fillRect(12, 14, 7, 8).fillRect(29, 14, 7, 8);
      cube.generateTexture("pulse-cube", 48, 48).destroy();

      const ship = this.add.graphics().setVisible(false);
      ship.fillStyle(0xff6b7a, 1).fillTriangle(2, 34, 58, 18, 2, 2);
      ship.lineStyle(3, 0xffffff, 0.85).strokeTriangle(2, 34, 58, 18, 2, 2);
      ship.fillStyle(0x09111f, 1).fillCircle(28, 18, 6);
      ship.generateTexture("pulse-ship", 62, 36).destroy();

      const spike = this.add.graphics().setVisible(false);
      spike.fillStyle(0xffd166, 1).fillTriangle(0, 50, 25, 0, 50, 50);
      spike.lineStyle(3, 0xffffff, 0.65).strokeTriangle(1, 49, 25, 2, 49, 49);
      spike.generateTexture("pulse-spike", 50, 50).destroy();

      const spikeDown = this.add.graphics().setVisible(false);
      spikeDown.fillStyle(0xffd166, 1).fillTriangle(0, 0, 25, 50, 50, 0);
      spikeDown.lineStyle(3, 0xffffff, 0.65).strokeTriangle(1, 1, 25, 48, 49, 1);
      spikeDown.generateTexture("pulse-spike-down", 50, 50).destroy();

      const coin = this.add.graphics().setVisible(false);
      coin.fillStyle(0x7bf1a8, 1).fillCircle(18, 18, 16);
      coin.lineStyle(3, 0xffffff, 0.9).strokeCircle(18, 18, 13);
      coin.generateTexture("pulse-coin", 36, 36).destroy();

      const jumpRing = this.add.graphics().setVisible(false);
      jumpRing.lineStyle(7, 0xffd75a, 1).strokeCircle(30, 30, 23);
      jumpRing.lineStyle(2, 0xffffff, 0.9).strokeCircle(30, 30, 16);
      jumpRing.fillStyle(0xffd75a, 0.22).fillCircle(30, 30, 13);
      jumpRing.generateTexture("pulse-jump-ring", 60, 60).destroy();

      const dashRing = this.add.graphics().setVisible(false);
      dashRing.lineStyle(7, 0x62d8ff, 1).strokeCircle(32, 32, 25);
      dashRing.fillStyle(0xffffff, 0.92).fillTriangle(20, 18, 50, 32, 20, 46);
      dashRing.generateTexture("pulse-dash-ring", 64, 64).destroy();

      const grid = this.add.graphics().setVisible(false);
      grid.fillStyle(0x090d18, 1).fillRect(0, 0, 128, 128);
      grid.lineStyle(1, 0x1f3452, 0.55).lineBetween(0, 127, 128, 127).lineBetween(127, 0, 127, 128);
      grid.generateTexture("pulse-grid", 128, 128).destroy();
    }

    beginRun() {
      if (this.started || this.ended) return;
      this.started = true;
      this.startedAt = performance.now();
      this.simulationWallTime = performance.now();
      (this.player.body as ArcadeBody).setVelocityX(RUN_SPEED * this.debugSpeedMultiplier);
    }

    setDebugSpeed(multiplier: number) {
      if (!debugMode || !PULSE_DEBUG_SPEEDS.some((speed) => speed === multiplier)) return;
      this.debugSpeedMultiplier = multiplier;
      if (this.started && !this.ended) {
        (this.player.body as ArcadeBody).setVelocityX(RUN_SPEED * multiplier);
      }
    }

    rewindDebug(seconds: number) {
      if (!debugMode || !this.started || this.ended) return;
      const currentBeat = (this.player.x - LEVEL_START_X) / PX_PER_BEAT;
      const targetBeat = pulseDebugRewindBeat(currentBeat, seconds);
      const targetX = beatX(targetBeat);

      this.restoreDebugGimmicks();
      this.simulation = createPulseState();
      this.simulation.x = targetX;
      this.simulation.tick = Math.round(targetBeat * BEAT_MS / PULSE_STEP_MS);
      this.simulationAccumulator = 0;
      this.simulationWallTime = performance.now();
      this.inputs = [];
      this.inputCursor = 0;
      this.pressed = false;

      this.player.x = targetX;
      const targetMode = pulseModeAtX(targetX);
      if (targetMode !== this.mode) this.switchMode(targetMode);
      const targetGravity = targetMode === "cube" ? pulseGravityAtX(targetX) : 1;
      if (targetGravity !== this.gravityDirection) this.switchGravity(targetGravity);
      const targetMini = targetMode === "cube" && pulseMiniAtX(targetX);
      if (targetMini !== this.mini) this.switchCubeSize(targetMini);

      const targetY =
        targetMode === "ship"
          ? 270
          : targetGravity === 1
            ? FLOOR_Y - (targetMini ? 24 : 34)
            : CEILING_Y + (targetMini ? 24 : 34);
      const body = this.player.body as ArcadeBody;
      this.simulation.y = targetY;
      body.reset(targetX, targetY);
      body.setVelocity(RUN_SPEED * this.debugSpeedMultiplier, 0).setAcceleration(0, 0);
      this.syncSurfaces();
      this.updateNormalMechanics(targetBeat);
      this.updateShipMechanics(targetBeat);
      this.cameras.main.scrollX = Math.max(0, targetX - 190);
      callbacks.onProgress(clampProgress(targetX));
      callbacks.onModeChange(targetMode);
      this.cameras.main.flash(180, 123, 241, 168, false);
    }

    setOrientationPaused(paused: boolean) {
      if (this.orientationPaused === paused) return;
      this.orientationPaused = paused;
      if (paused) {
        if (this.pressed) this.inputs.push({ atMs: Math.floor(pulseElapsed(this.simulation)), action: "up" });
        this.pressed = false;
        if (this.started && !this.ended) this.orientationPausedAt = performance.now();
        this.physics.pause();
      } else if (this.started && !this.ended) {
        if (this.orientationPausedAt > 0) {
          this.startedAt += performance.now() - this.orientationPausedAt;
          this.orientationPausedAt = 0;
        }
        this.simulationWallTime = performance.now();
      }
    }

    private verifyRenderedPixels() {
      const colors = new Set<number>();
      const points = [
        [160, 430],
        [480, 270],
        [760, 430],
      ];
      points.forEach(([x, y], index) => {
        this.time.delayedCall(250 + index * 80, () => {
          this.game.renderer.snapshotPixel(x, y, (snapshot) => {
            if ("color" in snapshot) colors.add(snapshot.color);
            if (index === points.length - 1) {
              this.game.canvas.dataset.renderReady = colors.size > 1 ? "true" : "false";
              this.game.canvas.dataset.pixelColorCount = String(colors.size);
            }
          });
        });
      });
    }

    private createBackground() {
      const bg = this.add.tileSprite(0, 0, 960, 540, "pulse-grid").setOrigin(0).setScrollFactor(0);
      bg.setDepth(-20);
      const horizon = this.add.rectangle(0, FLOOR_Y - 110, LEVEL_END_X + 1200, 220, 0x121c31, 0.5);
      horizon.setOrigin(0, 0).setDepth(-15);
      for (let beat = 0; beat <= LEVEL_BEATS; beat += 2) {
        const bar = this.add.rectangle(beatX(beat), 250, 5, 250, beat % 8 === 0 ? 0xff5f78 : 0x4fbfff, 0.14);
        bar.setDepth(-10);
      }
      this.beatFlash = this.add.rectangle(0, 0, 960, 540, 0x58c9ff, 0).setOrigin(0).setScrollFactor(0).setDepth(20);
      this.modeLabel = this.add
        .text(480, 76, "CUBE MODE", {
          fontFamily: "Arial, sans-serif",
          fontSize: "18px",
          fontStyle: "bold",
          color: "#ffffff",
          letterSpacing: 3,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setAlpha(0.55)
        .setDepth(21);
    }

    private createSurfaces() {
      this.ground = this.add.rectangle(LEVEL_END_X / 2, FLOOR_Y + 30, LEVEL_END_X + 1400, 60, 0x24344d, 1);
      this.ground.setStrokeStyle(3, 0x65d9ff, 0.55);
      this.physics.add.existing(this.ground, true);

      this.ceiling = this.add.rectangle(
        LEVEL_END_X / 2,
        CEILING_Y - 30,
        LEVEL_END_X + 1400,
        60,
        0x2d2747,
        1
      );
      this.ceiling.setStrokeStyle(3, 0xc79bff, 0.65).setVisible(false);
      this.physics.add.existing(this.ceiling, true);
      (this.ceiling.body as import("phaser").Physics.Arcade.StaticBody).enable = false;
    }

    private createLevel() {
      for (const beat of CUBE_SPIKE_BEATS) {
        const spike = this.hazards.create(beatX(beat), FLOOR_Y, "pulse-spike") as import("phaser").Physics.Arcade.Image;
        spike.setOrigin(0.5, 1).refreshBody();
        const body = spike.body as import("phaser").Physics.Arcade.StaticBody;
        body.setSize(SPIKE_BODY_WIDTH, 37).setOffset(8, 12);
      }

      for (const item of CEILING_SPIKES) {
        const spike = this.hazards.create(
          beatX(item.beat),
          item.baseY,
          "pulse-spike-down"
        ) as import("phaser").Physics.Arcade.Image;
        spike.setOrigin(0.5, 0).refreshBody();
        const body = spike.body as import("phaser").Physics.Arcade.StaticBody;
        body.setSize(SPIKE_BODY_WIDTH, 37).setOffset(8, 1);
      }

      for (const item of CUBE_PLATFORMS) {
        const width = item.widthBeats * PX_PER_BEAT;
        const platform = this.add.rectangle(
          beatX(item.beat),
          FLOOR_Y - item.height / 2,
          width,
          item.height,
          0x304a72,
          0.95
        );
        platform.setStrokeStyle(3, 0x62d8ff, 0.7);
        platform.setData("gravity", 1);
        this.physics.add.existing(platform, true);
        this.platforms.add(platform);
      }

      for (const item of INVERTED_PLATFORMS) {
        const width = item.widthBeats * PX_PER_BEAT;
        const platform = this.add.rectangle(
          beatX(item.beat),
          CEILING_Y + item.depth / 2,
          width,
          item.depth,
          0x493b70,
          0.95
        );
        platform.setStrokeStyle(3, 0xc79bff, 0.78).setData("gravity", -1);
        this.physics.add.existing(platform, true);
        this.platforms.add(platform);
      }

      for (const item of SPECIAL_FLOOR_PLATFORMS) {
        const platform = this.add.rectangle(
          beatX(item.beat),
          FLOOR_Y + 50,
          item.widthBeats * PX_PER_BEAT,
          100,
          0x294466,
          0.96
        );
        platform.setStrokeStyle(3, 0x62d8ff, 0.68).setData("gravity", 1);
        this.physics.add.existing(platform, true);
        this.platforms.add(platform);
      }

      for (const item of COLLAPSING_FLOORS) {
        const platform = this.add.rectangle(
          beatX(item.beat),
          FLOOR_Y + 28,
          item.widthBeats * PX_PER_BEAT,
          56,
          0xff9f43,
          0.92
        );
        platform
          .setStrokeStyle(3, 0xffffff, 0.62)
          .setData("gravity", 1)
          .setData("collapsible", true)
          .setData("collapseTriggered", false)
          .setData("collapseGeneration", 0)
          .setData("homeY", platform.y);
        this.physics.add.existing(platform, true);
        this.platforms.add(platform);
      }

      for (const block of BEAT_BLOCKS) {
        const object = this.add.rectangle(
          beatX(block.beat),
          FLOOR_Y + 28,
          block.widthBeats * PX_PER_BEAT,
          56,
          0x55e6d8,
          0.92
        );
        object.setStrokeStyle(3, 0xffffff, 0.72).setData("gravity", 1);
        this.physics.add.existing(object, true);
        this.platforms.add(object);
        this.beatBlockRuntimes.push({ block, object });
      }

      for (const item of BRANCH_PLATFORMS) {
        const platform = this.add.rectangle(
          beatX(item.beat),
          FLOOR_Y - item.height,
          item.widthBeats * PX_PER_BEAT,
          24,
          0x7f6cff,
          0.94
        );
        platform.setStrokeStyle(3, 0xffffff, 0.72).setData("gravity", 1);
        this.physics.add.existing(platform, true);
        this.platforms.add(platform);
      }

      for (const item of MINI_CEILING_OBSTACLES) {
        const obstacle = this.add.rectangle(
          beatX(item.beat),
          item.bottomY / 2,
          item.widthBeats * PX_PER_BEAT,
          item.bottomY,
          0x493b70,
          0.94
        );
        obstacle.setStrokeStyle(3, 0xc79bff, 0.72);
        this.physics.add.existing(obstacle, true);
        this.hazards.add(obstacle);
      }

      for (const item of AIR_JUMP_RINGS) {
        const ring = this.airRings.create(
          beatX(item.beat),
          item.y,
          "pulse-jump-ring"
        ) as import("phaser").Physics.Arcade.Image;
        ring.setData("power", item.power).setData("used", false).refreshBody();
        (ring.body as import("phaser").Physics.Arcade.StaticBody)
          .setSize(AIR_RING_BODY_SIZE, AIR_RING_BODY_SIZE)
          .setOffset(
            (60 - AIR_RING_BODY_SIZE) / 2,
            (60 - AIR_RING_BODY_SIZE) / 2
          );
        this.tweens.add({ targets: ring, scale: 1.12, alpha: 0.72, duration: 430, yoyo: true, repeat: -1 });
      }

      for (const item of DASH_RINGS) {
        const ring = this.dashRings.create(
          beatX(item.beat),
          item.y,
          "pulse-dash-ring"
        ) as import("phaser").Physics.Arcade.Image;
        ring
          .setData("durationMs", item.durationMs)
          .setData("speedMultiplier", item.speedMultiplier)
          .setData("used", false)
          .refreshBody();
        (ring.body as import("phaser").Physics.Arcade.StaticBody).setSize(58, 58).setOffset(3, 3);
        this.tweens.add({ targets: ring, angle: 360, duration: 900, repeat: -1 });
      }

      for (const gate of CUBE_PRESS_GATES) {
        const height = 460;
        const object = this.add.rectangle(
          beatX(gate.beat),
          gate.closedBottomY - height / 2,
          gate.width,
          height,
          0xff6b7a,
          0.94
        );
        object.setStrokeStyle(4, 0xffffff, 0.65).setDepth(3);
        this.physics.add.existing(object);
        const gateBody = object.body as ArcadeBody;
        gateBody.setAllowGravity(false).setImmovable(true).setSize(gate.width, height);
        this.movingHazards.add(object);
        this.pressGateRuntimes.push({ gate, object });
        this.add
          .text(beatX(gate.beat), 472, "BEAT PRESS", {
            fontFamily: "Arial, sans-serif",
            fontSize: "12px",
            fontStyle: "bold",
            color: "#ff9aa5",
          })
          .setOrigin(0.5)
          .setAlpha(0.82);
      }

      for (const label of [
        { beat: 12, y: 350, text: "BEAT BLOCKS", color: "#7fffe9" },
        { beat: 63, y: 350, text: "CRUMBLE RUN", color: "#ffc37a" },
        { beat: 116, y: 330, text: "MINI TUNNEL", color: "#ffe090" },
        { beat: 162, y: 360, text: "CRUMBLE RUN", color: "#ffc37a" },
      ]) {
        this.add
          .text(beatX(label.beat), label.y, label.text, {
            fontFamily: "Arial, sans-serif",
            fontSize: "15px",
            fontStyle: "bold",
            color: label.color,
          })
          .setOrigin(0.5)
          .setAlpha(0.82);
      }
      this.add
        .text(beatX(17.6), 92, "HOLD THE RINGS", {
          fontFamily: "Arial, sans-serif",
          fontSize: "15px",
          fontStyle: "bold",
          color: "#ffe790",
        })
        .setOrigin(0.5)
        .setAlpha(0.85);
      this.add
        .text(beatX(170), 92, "HOLD THE RINGS", {
          fontFamily: "Arial, sans-serif",
          fontSize: "15px",
          fontStyle: "bold",
          color: "#ffe790",
        })
        .setOrigin(0.5)
        .setAlpha(0.85);
      this.add
        .text(beatX(210), 92, "HIGH ROUTE // SHARD", {
          fontFamily: "Arial, sans-serif",
          fontSize: "14px",
          fontStyle: "bold",
          color: "#b9aaff",
        })
        .setOrigin(0.5)
        .setAlpha(0.85);

      for (const item of BOUNCE_PADS) {
        const pad = this.add.rectangle(
          beatX(item.beat),
          FLOOR_Y - 6,
          BOUNCE_PAD_WIDTH,
          12,
          0x7bf1a8,
          0.9
        );
        pad
          .setStrokeStyle(2, 0xffffff, 0.85)
          .setData("power", item.power)
          .setData("gravity", 1)
          .setData("danger", false)
          .setData("used", false);
        this.physics.add.existing(pad, true);
        this.bouncePads.add(pad);
      }

      for (const item of INVERTED_BOUNCE_PADS) {
        const pad = this.add.rectangle(
          beatX(item.beat),
          CEILING_Y + 6,
          BOUNCE_PAD_WIDTH,
          12,
          item.danger ? 0xff6b7a : 0x7bf1a8,
          0.92
        );
        pad
          .setStrokeStyle(2, 0xffffff, 0.85)
          .setData("power", item.power)
          .setData("gravity", -1)
          .setData("danger", item.danger)
          .setData("used", false);
        this.physics.add.existing(pad, true);
        this.bouncePads.add(pad);
        if (item.danger) {
          this.add
            .text(beatX(item.beat), 118, "DANGER PAD", {
              fontFamily: "Arial, sans-serif",
              fontSize: "12px",
              fontStyle: "bold",
              color: "#ff8b98",
            })
            .setOrigin(0.5)
            .setAlpha(0.85);
        }
      }

      for (const hazard of SHIP_HAZARDS) {
        const y = hazard.side === "top" ? hazard.height / 2 : 540 - hazard.height / 2;
        const rectangle = this.add.rectangle(
          beatX(hazard.beat),
          y,
          hazard.width,
          hazard.height,
          0xff5f78,
          0.9
        );
        rectangle.setStrokeStyle(3, 0xffffff, 0.45);
        this.physics.add.existing(rectangle, true);
        this.hazards.add(rectangle);
      }

      for (const gate of SHIP_GATES) this.createShipGate(gate);

      for (const hazard of SHIP_MOVING_HAZARDS) {
        const x = beatX(hazard.beat);
        const guide = this.add.rectangle(x, 270, 4, 410, 0xffd166, 0.16).setDepth(-2);
        guide.setStrokeStyle(1, 0xffd166, 0.24);
        this.add
          .text(x, 72, "↕ MOVING", {
            fontFamily: "Arial, sans-serif",
            fontSize: "12px",
            fontStyle: "bold",
            color: "#ffd166",
          })
          .setOrigin(0.5)
          .setAlpha(0.72);
        const object = this.add.rectangle(
          x,
          pulseMovingHazardYAtBeat(hazard, 0),
          hazard.width,
          hazard.height,
          0xffb84d,
          0.94
        );
        object.setStrokeStyle(4, 0xffffff, 0.62).setDepth(3);
        this.physics.add.existing(object);
        const movingBody = object.body as ArcadeBody;
        movingBody.setAllowGravity(false).setImmovable(true).setSize(hazard.width, hazard.height);
        this.movingHazards.add(object);
        this.movingHazardRuntimes.push({ hazard, object });
      }

      for (const zone of SHIP_WIND_ZONES) {
        const startX = beatX(zone.startBeat);
        const width = (zone.endBeat - zone.startBeat) * PX_PER_BEAT;
        const up = zone.forceY < 0;
        const color = up ? 0x62d8ff : 0xc79bff;
        this.add
          .rectangle(startX + width / 2, 270, width, 480, color, 0.11)
          .setStrokeStyle(3, color, 0.55)
          .setDepth(-1);

        for (let index = 0; index < 18; index += 1) {
          const fraction = (index + 0.5) / 18;
          const length = 34 + (index % 5) * 11;
          const streak = this.add
            .rectangle(
              startX + width * fraction,
              30 + ((index * 83) % 480),
              index % 4 === 0 ? 4 : 2,
              length,
              color,
              0.38 + (index % 4) * 0.04
            )
            .setAngle(index % 2 === 0 ? -5 : 5)
            .setDepth(1);
          this.windStreakRuntimes.push({
            object: streak,
            baseX: streak.x,
            phase: (index * 137) % 480,
            speed: 0.22 + (index % 6) * 0.035,
            direction: up ? -1 : 1,
            wobble: 4 + (index % 5) * 2,
            baseAlpha: 0.38 + (index % 4) * 0.04,
          });
        }

        for (let index = 0; index < 3; index += 1) {
          const gust = this.add
            .rectangle(
              startX + width / 2,
              80 + index * 160,
              width * (0.72 + index * 0.07),
              3,
              color,
              0.32
            )
            .setDepth(1);
          this.windStreakRuntimes.push({
            object: gust,
            baseX: gust.x,
            phase: index * 157,
            speed: 0.3 + index * 0.035,
            direction: up ? -1 : 1,
            wobble: 0,
            baseAlpha: 0.32,
          });
        }

        for (let x = startX + 80; x < startX + width; x += 180) {
          this.add
            .text(x, 270 + ((x / 180) % 2) * 75, up ? "↑" : "↓", {
              fontFamily: "Arial, sans-serif",
              fontSize: "52px",
              fontStyle: "bold",
              color: up ? "#62d8ff" : "#c79bff",
            })
            .setOrigin(0.5)
            .setAlpha(0.2);
        }
        this.add
          .text(startX + width / 2, 96, up ? "WIND ↑" : "WIND ↓", {
            fontFamily: "Arial, sans-serif",
            fontSize: "15px",
            fontStyle: "bold",
            color: up ? "#8ce6ff" : "#d9b8ff",
          })
          .setOrigin(0.5)
          .setAlpha(0.8);
      }

      for (const item of PULSE_COINS) {
        const coin = this.coinsGroup.create(beatX(item.beat), item.y, "pulse-coin") as import("phaser").Physics.Arcade.Image;
        coin.refreshBody();
        this.tweens.add({ targets: coin, angle: 360, duration: 1400, repeat: -1 });
      }

      for (const section of PULSE_SHIP_SECTIONS) {
        this.createPortal(beatX(section.startBeat), 0xff6b7a, "ROCKET");
        this.createPortal(beatX(section.endBeat), 0x62d8ff, "CUBE");
      }
      for (const section of PULSE_GRAVITY_SECTIONS) {
        this.createPortal(beatX(section.startBeat), 0xc79bff, "FLIP");
        this.createPortal(beatX(section.endBeat), 0x7bf1a8, "NORMAL");
      }
      for (const section of PULSE_MINI_SECTIONS) {
        this.createPortal(beatX(section.startBeat), 0xffd166, "MINI");
        this.createPortal(beatX(section.endBeat), 0x62d8ff, "NORMAL");
      }
      for (const ring of DASH_RINGS) {
        this.add
          .text(beatX(ring.beat), 330, "HOLD TO DASH", {
            fontFamily: "Arial, sans-serif",
            fontSize: "13px",
            fontStyle: "bold",
            color: "#9de9ff",
          })
          .setOrigin(0.5)
          .setAlpha(0.85);
      }
      this.createPortal(LEVEL_END_X, 0x7bf1a8, "GOAL");
    }

    private createPortal(x: number, color: number, label: string) {
      const portal = this.add.rectangle(x, 270, 24, 330, color, 0.22);
      portal.setStrokeStyle(4, color, 0.85).setDepth(2);
      this.add
        .text(x, 92, label, { fontFamily: "Arial, sans-serif", fontSize: "14px", fontStyle: "bold", color: "#ffffff" })
        .setOrigin(0.5)
        .setAlpha(0.7);
    }

    private updateWindEffects(time: number) {
      const minY = 22;
      const range = 496;
      for (const streak of this.windStreakRuntimes) {
        const travel = (streak.phase + time * streak.speed) % range;
        streak.object.y =
          streak.direction === -1 ? minY + range - travel : minY + travel;
        streak.object.x =
          streak.baseX + Math.sin(time * 0.004 + streak.phase) * streak.wobble;
        streak.object.setAlpha(
          streak.baseAlpha * (0.82 + Math.sin(time * 0.009 + streak.phase) * 0.14)
        );
      }
    }

    private createShipGate(gate: (typeof SHIP_GATES)[number]) {
      const x = beatX(gate.beat);
      const segmentHeight = 360;
      const top = this.add.rectangle(x, 0, 44, segmentHeight, 0x55e6d8, 0.92);
      const bottom = this.add.rectangle(x, 540, 44, segmentHeight, 0x55e6d8, 0.92);
      for (const segment of [top, bottom]) {
        segment.setStrokeStyle(4, 0xffffff, 0.65).setDepth(3);
        this.physics.add.existing(segment);
        const gateBody = segment.body as ArcadeBody;
        gateBody.setAllowGravity(false).setImmovable(true).setSize(44, segmentHeight);
        this.movingHazards.add(segment);
      }
      this.add
        .text(x, 72, "BEAT GATE", {
          fontFamily: "Arial, sans-serif",
          fontSize: "12px",
          fontStyle: "bold",
          color: "#7fffe9",
        })
        .setOrigin(0.5)
        .setAlpha(0.78);
      this.gateRuntimes.push({ gate, top, bottom });
    }

    private updateShipMechanics(courseBeat: number) {
      const segmentHeight = 360;
      for (const { gate, top, bottom } of this.gateRuntimes) {
        const gap = pulseGateGapAtBeat(gate, courseBeat);
        const topY = gate.gapY - gap / 2 - segmentHeight / 2;
        const bottomY = gate.gapY + gap / 2 + segmentHeight / 2;
        (top.body as ArcadeBody).reset(top.x, topY);
        (bottom.body as ArcadeBody).reset(bottom.x, bottomY);
      }
      for (const { hazard, object } of this.movingHazardRuntimes) {
        const y = pulseMovingHazardYAtBeat(hazard, courseBeat);
        (object.body as ArcadeBody).reset(object.x, y);
      }
    }

    private updateNormalMechanics(courseBeat: number) {
      for (const { block, object } of this.beatBlockRuntimes) {
        const active = pulseBeatBlockActive(block, courseBeat);
        const blockBody = object.body as import("phaser").Physics.Arcade.StaticBody;
        blockBody.enable = active;
        object.setAlpha(active ? 0.94 : 0.14);
        object.setScale(1, active ? 1 : 0.55);
      }

      const gateHeight = 460;
      for (const { gate, object } of this.pressGateRuntimes) {
        const bottomY = pulsePressGateBottomAtBeat(gate, courseBeat);
        (object.body as ArcadeBody).reset(object.x, bottomY - gateHeight / 2);
        object.setAlpha(0.78 + (gate.closedBottomY - bottomY) / 700);
      }
    }

    private createPlayer() {
      this.player = this.physics.add.sprite(LEVEL_START_X, FLOOR_Y - 26, "pulse-cube") as ArcadeSprite;
      this.player.setDepth(10).setCollideWorldBounds(false);
      this.player.body.setSize(CUBE_BODY_SIZE, CUBE_BODY_SIZE).setOffset(3, 3);
      this.player.body.setVelocityX(RUN_SPEED);
    }

    private bindInput() {
      const down = () => {
        if (!this.started || this.ended || this.orientationPaused || this.pressed) return;
        if (this.inputs.length >= MAX_PULSE_INPUTS - 1) return;
        callbacks.onInteraction();
        this.pressed = true;
        this.inputs.push({ atMs: Math.floor(pulseElapsed(this.simulation)), action: "down" });
      };
      const up = () => {
        if (!this.started || this.ended || this.orientationPaused || !this.pressed) return;
        this.pressed = false;
        this.inputs.push({ atMs: Math.floor(pulseElapsed(this.simulation)), action: "up" });
      };
      const keyDown = (event: KeyboardEvent) => {
        if (event.code !== "Space") return;
        event.preventDefault();
        down();
      };
      const keyUp = (event: KeyboardEvent) => {
        if (event.code !== "Space") return;
        event.preventDefault();
        up();
      };
      this.input.on("pointerdown", down);
      this.input.on("pointerup", up);
      window.addEventListener("keydown", keyDown);
      window.addEventListener("keyup", keyUp);
      window.addEventListener("blur", up);
      this.events.once("shutdown", () => {
        window.removeEventListener("keydown", keyDown);
        window.removeEventListener("keyup", keyUp);
        window.removeEventListener("blur", up);
      });
    }

    private switchMode(next: PulseMode) {
      this.mode = next;
      const body = this.player.body as ArcadeBody;
      if (next === "ship") {
        this.mini = false;
        this.gravityDirection = 1;
        this.syncSurfaces();
        this.player
          .setTexture("pulse-ship")
          .setScale(1)
          .setPosition(this.player.x, 300)
          .setAngle(0);
        this.player.setFlipY(false);
        body.setSize(52, 28).setOffset(5, 4).setVelocityY(-80);
        this.modeLabel.setText("ROCKET MODE").setColor("#ff8b98");
      } else {
        this.mini = false;
        this.gravityDirection = pulseGravityAtX(this.player.x);
        this.syncSurfaces();
        this.player
          .setTexture("pulse-cube")
          .setScale(1)
          .setPosition(this.player.x, FLOOR_Y - 28)
          .setAngle(0);
        this.player.setFlipY(this.gravityDirection === -1);
        body.setSize(CUBE_BODY_SIZE, CUBE_BODY_SIZE).setOffset(3, 3).setVelocityY(0);
        this.modeLabel
          .setText(this.gravityDirection === -1 ? "CUBE // INVERTED" : "CUBE MODE")
          .setColor(this.gravityDirection === -1 ? "#d9b8ff" : "#8ce6ff");
      }
      callbacks.onModeChange(next);
      this.cameras.main.flash(180, next === "ship" ? 255 : 98, next === "ship" ? 107 : 216, next === "ship" ? 122 : 255, false);
    }

    private switchCubeSize(nextMini: boolean) {
      if (this.mode !== "cube") return;
      this.mini = nextMini;
      const body = this.player.body as ArcadeBody;
      const grounded = body.blocked.down || body.touching.down;
      this.player.setScale(nextMini ? 0.7 : 1);
      body.setSize(CUBE_BODY_SIZE, CUBE_BODY_SIZE).setOffset(3, 3);
      if (grounded && this.gravityDirection === 1) {
        this.player.y = FLOOR_Y - (nextMini ? 17 : 26);
      }
      this.modeLabel
        .setText(nextMini ? "MINI CUBE" : "CUBE MODE")
        .setColor(nextMini ? "#ffe090" : "#8ce6ff");
      this.cameras.main.flash(160, nextMini ? 255 : 98, nextMini ? 209 : 216, 102, false);
    }

    private switchGravity(next: PulseGravity) {
      this.gravityDirection = next;
      this.syncSurfaces();
      this.player.setFlipY(next === -1);
      this.modeLabel
        .setText(next === -1 ? "CUBE // INVERTED" : "CUBE MODE")
        .setColor(next === -1 ? "#d9b8ff" : "#8ce6ff");
      this.cameras.main.flash(220, next === -1 ? 199 : 98, next === -1 ? 155 : 216, 255, false);
    }

    private restoreDebugGimmicks() {
      for (const object of this.bouncePads.getChildren()) {
        const pad = object as import("phaser").GameObjects.Rectangle;
        const danger = pad.getData("danger") === true;
        pad
          .setData("used", false)
          .setFillStyle(danger ? 0xff6b7a : 0x7bf1a8, danger ? 0.92 : 0.9);
      }
      for (const object of this.airRings.getChildren()) {
        (object as import("phaser").Physics.Arcade.Image).setData("used", false).setAlpha(1);
      }
      for (const object of this.dashRings.getChildren()) {
        (object as import("phaser").Physics.Arcade.Image).setData("used", false).setAlpha(1);
      }
      for (const object of this.coinsGroup.getChildren()) {
        const coin = object as import("phaser").Physics.Arcade.Image;
        coin.enableBody(false, coin.x, coin.y, true, true);
      }
      this.coins = 0;

      for (const object of this.platforms.getChildren()) {
        const platform = object as import("phaser").GameObjects.Rectangle;
        if (platform.getData("collapsible") !== true) continue;
        this.tweens.killTweensOf(platform);
        platform
          .setData("collapseTriggered", false)
          .setData("collapseGeneration", Number(platform.getData("collapseGeneration")) + 1)
          .setPosition(platform.x, Number(platform.getData("homeY")))
          .setAngle(0)
          .setAlpha(0.92);
        const platformBody = platform.body as import("phaser").Physics.Arcade.StaticBody;
        platformBody.enable = true;
        platformBody.updateFromGameObject();
      }
    }

    private syncSurfaces() {
      const { groundEnabled, ceilingEnabled } = pulseSurfaceState(
        this.mode,
        this.gravityDirection,
        pulseUsesSegmentedFloorAtX(this.player?.x ?? LEVEL_START_X)
      );
      this.ground.setVisible(groundEnabled);
      this.ceiling.setVisible(ceilingEnabled);
      (this.ground.body as import("phaser").Physics.Arcade.StaticBody).enable = groundEnabled;
      (this.ceiling.body as import("phaser").Physics.Arcade.StaticBody).enable = ceilingEnabled;
    }

    private finish(completed: boolean) {
      if (this.ended) return;
      this.ended = true;
      const body = this.player.body as ArcadeBody;
      body.setVelocity(0, 0).setAcceleration(0, 0);
      this.physics.pause();
      if (!completed) {
        this.player.setTint(0xff5268);
        this.cameras.main.shake(240, 0.012);
      } else {
        this.player.setTint(0x7bf1a8);
        this.cameras.main.flash(420, 123, 241, 168, false);
      }
      callbacks.onProgress(completed ? 100 : clampProgress(this.player.x));
      const progressPercent = completed ? 100 : clampProgress(this.player.x);
      callbacks.onFinish({
        progressPercent,
        distanceMeters: pulseDistanceFromProgress(progressPercent),
        completed,
        durationMs: Math.round(pulseElapsed(this.simulation)),
        coins: this.coins,
        inputs: this.inputs,
      });
    }
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 960,
    height: 540,
    backgroundColor: "#090d18",
    transparent: false,
    render: { antialias: true, pixelArt: false, roundPixels: false },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 960,
      height: 540,
    },
    physics: {
      default: "arcade",
      arcade: { gravity: { x: 0, y: 0 }, debug: false },
    },
    scene: PulseRunnerScene,
  });

  return {
    game: game as PhaserGame,
    begin() {
      const scene = game.scene.getScene("pulse-runner") as PulseRunnerScene;
      scene.beginRun();
    },
    setPaused(paused: boolean) {
      const scene = game.scene.getScene("pulse-runner") as PulseRunnerScene;
      scene.setOrientationPaused(paused);
    },
    setDebugSpeed(multiplier: number) {
      const scene = game.scene.getScene("pulse-runner") as PulseRunnerScene;
      scene.setDebugSpeed(multiplier);
    },
    rewindDebug(seconds: number) {
      const scene = game.scene.getScene("pulse-runner") as PulseRunnerScene;
      scene.rewindDebug(seconds);
    },
    destroy() {
      game.destroy(true);
    },
  };
}
