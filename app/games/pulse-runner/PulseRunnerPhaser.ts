import {
  AIR_JUMP_RINGS,
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
  CUBE_GRAVITY,
  CUBE_JUMP_SPEED,
  CUBE_MAX_VERTICAL_SPEED,
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
  pulseBeatBlockActive,
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
}: {
  parent: HTMLElement;
  callbacks: PulseRunnerCallbacks;
}) {
  const PhaserModule = await import("phaser");
  const Phaser = (PhaserModule.default ?? PhaserModule) as typeof PhaserModule;

  class PulseRunnerScene extends Phaser.Scene {
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
    private dashUntil = 0;
    private dashSpeedMultiplier = 1;
    private pressed = false;
    private jumpQueuedUntil = 0;
    private bounceLockedUntil = 0;
    private startedAt = 0;
    private lastProgressAt = 0;
    private inputs: PulseInput[] = [];
    private coins = 0;
    private ended = false;
    private started = false;
    private orientationPaused = false;
    private orientationPausedAt = 0;
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

      this.physics.add.collider(this.player, this.ground);
      this.physics.add.collider(this.player, this.ceiling);
      this.physics.add.collider(this.player, this.platforms, (_player, object) => {
        const platform = object as import("phaser").GameObjects.Rectangle;
        const playerBody = this.player.body as ArcadeBody;
        const platformGravity = Number(platform.getData("gravity")) as PulseGravity;
        const landedOnSurface =
          this.mode === "cube" &&
          this.gravityDirection === platformGravity &&
          (platformGravity === 1
            ? playerBody.blocked.down && this.player.y < platform.y
            : playerBody.blocked.up && this.player.y > platform.y);
        if (!landedOnSurface) {
          this.finish(false);
          return;
        }
        if (
          platform.getData("collapsible") === true &&
          platform.getData("collapseTriggered") !== true
        ) {
          platform.setData("collapseTriggered", true);
          this.time.delayedCall(150, () => {
            const platformBody = platform.body as import("phaser").Physics.Arcade.StaticBody;
            platformBody.enable = false;
            this.tweens.add({
              targets: platform,
              y: platform.y + 34,
              angle: platform.x % 2 === 0 ? 9 : -9,
              alpha: 0,
              duration: 280,
            });
          });
        }
      });
      this.physics.add.collider(this.player, this.hazards, () => this.finish(false));
      this.physics.add.collider(this.player, this.movingHazards, () => this.finish(false));
      this.physics.add.overlap(this.player, this.bouncePads, (_player, object) => {
        const pad = object as import("phaser").GameObjects.Rectangle;
        if (
          this.mode !== "cube" ||
          this.gravityDirection !== Number(pad.getData("gravity")) ||
          pad.getData("used") === true
        ) return;
        const body = this.player.body as ArcadeBody;
        const danger = pad.getData("danger") === true;
        pad
          .setData("used", true)
          .setFillStyle(danger ? 0xff6b7a : 0x7bf1a8, 0.45);
        this.jumpQueuedUntil = 0;
        this.bounceLockedUntil = this.time.now + 240;
        body.setVelocityY(-Number(pad.getData("power")) * this.gravityDirection);
        this.cameras.main.flash(
          120,
          danger ? 255 : 123,
          danger ? 107 : 241,
          danger ? 122 : 168,
          false
        );
      });
      this.physics.add.overlap(this.player, this.coinsGroup, (_player, object) => {
        const coin = object as import("phaser").Physics.Arcade.Image;
        if (!coin.active) return;
        coin.disableBody(true, true);
        this.coins += 1;
        this.cameras.main.flash(80, 255, 215, 90, false);
      });
      this.physics.add.overlap(this.player, this.airRings, (_player, object) => {
        const ring = object as import("phaser").Physics.Arcade.Image;
        if (this.mode !== "cube" || !this.pressed || ring.getData("used") === true) return;
        ring.setData("used", true).setAlpha(0.28);
        this.jumpQueuedUntil = 0;
        (this.player.body as ArcadeBody).setVelocityY(
          -Number(ring.getData("power")) * this.gravityDirection
        );
        this.cameras.main.flash(90, 255, 215, 90, false);
      });
      this.physics.add.overlap(this.player, this.dashRings, (_player, object) => {
        const ring = object as import("phaser").Physics.Arcade.Image;
        if (this.mode !== "cube" || !this.pressed || ring.getData("used") === true) return;
        ring.setData("used", true).setAlpha(0.3);
        this.dashUntil = this.time.now + Number(ring.getData("durationMs"));
        this.dashSpeedMultiplier = Number(ring.getData("speedMultiplier"));
        this.cameras.main.flash(120, 98, 216, 255, false);
      });

      this.physics.pause();
      this.verifyRenderedPixels();
      callbacks.onModeChange(this.mode);
      callbacks.onReady();
    }

    update(time: number) {
      if (!this.started || this.ended || this.orientationPaused || !this.player?.body) return;
      const body = this.player.body as ArcadeBody;
      const courseBeat = (this.player.x - LEVEL_START_X) / PX_PER_BEAT;
      const horizontalSpeed =
        time < this.dashUntil ? RUN_SPEED * this.dashSpeedMultiplier : RUN_SPEED;
      body.setVelocityX(horizontalSpeed);

      const expectedMode = pulseModeAtX(this.player.x);
      if (expectedMode !== this.mode) this.switchMode(expectedMode);
      const expectedGravity = this.mode === "cube" ? pulseGravityAtX(this.player.x) : 1;
      if (expectedGravity !== this.gravityDirection) this.switchGravity(expectedGravity);
      const expectedMini = this.mode === "cube" && pulseMiniAtX(this.player.x);
      if (expectedMini !== this.mini) this.switchCubeSize(expectedMini);
      this.syncSurfaces();
      this.updateNormalMechanics(courseBeat);
      this.updateWindEffects(time);

      if (this.mode === "cube") {
        body.setAccelerationY(CUBE_GRAVITY * this.gravityDirection);
        body.setMaxVelocity(horizontalSpeed, CUBE_MAX_VERTICAL_SPEED);
        const grounded =
          this.gravityDirection === 1
            ? body.blocked.down || body.touching.down
            : body.blocked.up || body.touching.up;
        if (grounded) {
          this.player.setAngle(Math.round(this.player.angle / 90) * 90);
          if (time >= this.bounceLockedUntil && (this.pressed || time <= this.jumpQueuedUntil)) {
            body.setVelocityY(-CUBE_JUMP_SPEED * this.gravityDirection);
            this.jumpQueuedUntil = 0;
          }
        } else {
          this.player.angle += 260 * this.gravityDirection * (this.game.loop.delta / 1000);
        }
      } else {
        this.updateShipMechanics(courseBeat);
        const windForce = pulseWindAtBeat(courseBeat);
        body.setAccelerationY((this.pressed ? -1450 : 1050) + windForce);
        body.setMaxVelocity(horizontalSpeed, 430);
        const turbulence = windForce === 0 ? 0 : Math.sin(time * 0.045) * 2.4;
        this.player.setAngle(
          Math.max(-24, Math.min(28, body.velocity.y * 0.07 + turbulence))
        );
        this.modeLabel
          .setText(
            windForce < 0
              ? "ROCKET // UPDRAFT"
              : windForce > 0
                ? "ROCKET // DOWNDRAFT"
                : "ROCKET MODE"
          )
          .setColor(windForce < 0 ? "#8ce6ff" : windForce > 0 ? "#d9b8ff" : "#ff8b98");
        if (this.pressed && this.time.now % 80 < 20) {
          const spark = this.add.circle(this.player.x - 32, this.player.y, 5, 0xffd166, 0.9);
          spark.setDepth(9);
          this.tweens.add({
            targets: spark,
            x: spark.x - 42,
            alpha: 0,
            scale: 0.2,
            duration: 220,
            onComplete: () => spark.destroy(),
          });
        }
      }

      if (time < this.dashUntil && time % 55 < 18) {
        const trail = this.add.rectangle(
          this.player.x - 34,
          this.player.y,
          52,
          this.mini ? 14 : 20,
          0x62d8ff,
          0.55
        );
        trail.setDepth(8);
        this.tweens.add({
          targets: trail,
          x: trail.x - 90,
          scaleX: 1.8,
          alpha: 0,
          duration: 240,
          onComplete: () => trail.destroy(),
        });
      }

      if (this.player.y < 12 || this.player.y > 528) this.finish(false);
      if (this.player.x >= LEVEL_END_X) this.finish(true);

      this.cameras.main.scrollX = Math.max(0, this.player.x - 190);
      const elapsed = performance.now() - this.startedAt;
      const beatPhase = (elapsed % BEAT_MS) / BEAT_MS;
      this.beatFlash.setAlpha(Math.max(0, 0.09 * (1 - beatPhase * 4)));

      if (time - this.lastProgressAt > 100) {
        this.lastProgressAt = time;
        callbacks.onProgress(clampProgress(this.player.x));
      }
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
      if (!this.orientationPaused) this.physics.resume();
      (this.player.body as ArcadeBody).setVelocityX(RUN_SPEED);
    }

    setOrientationPaused(paused: boolean) {
      if (this.orientationPaused === paused) return;
      this.orientationPaused = paused;
      if (paused) {
        this.pressed = false;
        if (this.started && !this.ended) this.orientationPausedAt = performance.now();
        this.physics.pause();
      } else if (this.started && !this.ended) {
        if (this.orientationPausedAt > 0) {
          this.startedAt += performance.now() - this.orientationPausedAt;
          this.orientationPausedAt = 0;
        }
        this.physics.resume();
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
          .setData("collapseTriggered", false);
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
        (ring.body as import("phaser").Physics.Arcade.StaticBody).setSize(54, 54).setOffset(3, 3);
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
        callbacks.onInteraction();
        this.pressed = true;
        this.inputs.push({ atMs: Math.round(performance.now() - this.startedAt), action: "down" });
        if (this.mode === "cube") this.jumpQueuedUntil = this.time.now + 120;
      };
      const up = () => {
        if (!this.started || this.ended || this.orientationPaused || !this.pressed) return;
        this.pressed = false;
        this.inputs.push({ atMs: Math.round(performance.now() - this.startedAt), action: "up" });
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
        durationMs: Math.max(0, Math.round(performance.now() - this.startedAt)),
        coins: this.coins,
        inputs: this.inputs.slice(0, 500),
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
    destroy() {
      game.destroy(true);
    },
  };
}
