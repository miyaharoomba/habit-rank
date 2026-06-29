import {
  BEAT_MS,
  beatX,
  CUBE_SPIKE_BEATS,
  FLOOR_Y,
  LEVEL_END_X,
  LEVEL_START_X,
  PULSE_COINS,
  pulseModeAtX,
  RUN_SPEED,
  SHIP_END_BEAT,
  SHIP_HAZARDS,
  SHIP_START_BEAT,
  type PulseInput,
  type PulseMode,
} from "./level";

export type PulseRunSummary = {
  progressPercent: number;
  completed: boolean;
  durationMs: number;
  coins: number;
  inputs: PulseInput[];
};

export type PulseRunnerCallbacks = {
  onReady: () => void;
  onProgress: (progress: number) => void;
  onModeChange: (mode: PulseMode) => void;
  onFinish: (summary: PulseRunSummary) => void;
};

type PhaserGame = import("phaser").Game;
type ArcadeSprite = import("phaser").Types.Physics.Arcade.SpriteWithDynamicBody;
type ArcadeBody = import("phaser").Physics.Arcade.Body;

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
    private hazards!: import("phaser").Physics.Arcade.StaticGroup;
    private coinsGroup!: import("phaser").Physics.Arcade.StaticGroup;
    private mode: PulseMode = "cube";
    private pressed = false;
    private jumpQueuedUntil = 0;
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
      this.coinsGroup = this.physics.add.staticGroup();
      this.createGround();
      this.createLevel();
      this.createPlayer();
      this.bindInput();

      this.physics.add.collider(this.player, this.ground, () => {
        if (this.mode === "ship") this.finish(false);
      });
      this.physics.add.collider(this.player, this.hazards, () => this.finish(false));
      this.physics.add.overlap(this.player, this.coinsGroup, (_player, object) => {
        const coin = object as import("phaser").Physics.Arcade.Image;
        if (!coin.active) return;
        coin.disableBody(true, true);
        this.coins += 1;
        this.cameras.main.flash(80, 255, 215, 90, false);
      });

      this.physics.pause();
      this.verifyRenderedPixels();
      callbacks.onModeChange(this.mode);
      callbacks.onReady();
    }

    update(time: number) {
      if (!this.started || this.ended || this.orientationPaused || !this.player?.body) return;
      const body = this.player.body as ArcadeBody;
      body.setVelocityX(RUN_SPEED);

      if (this.mode === "cube") {
        body.setAccelerationY(2800);
        body.setMaxVelocity(RUN_SPEED, 900);
        const grounded = body.blocked.down || body.touching.down;
        if (grounded) {
          this.player.setAngle(Math.round(this.player.angle / 90) * 90);
          if (this.pressed || time <= this.jumpQueuedUntil) {
            body.setVelocityY(-760);
            this.jumpQueuedUntil = 0;
          }
        } else {
          this.player.angle += 260 * (this.game.loop.delta / 1000);
        }
      } else {
        body.setAccelerationY(this.pressed ? -1450 : 1050);
        body.setMaxVelocity(RUN_SPEED, 430);
        this.player.setAngle(Math.max(-24, Math.min(28, body.velocity.y * 0.07)));
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

      const expectedMode = pulseModeAtX(this.player.x);
      if (expectedMode !== this.mode) this.switchMode(expectedMode);

      if (this.player.y < 30 || this.player.y > 525) this.finish(false);
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

      const coin = this.add.graphics().setVisible(false);
      coin.fillStyle(0x7bf1a8, 1).fillCircle(18, 18, 16);
      coin.lineStyle(3, 0xffffff, 0.9).strokeCircle(18, 18, 13);
      coin.generateTexture("pulse-coin", 36, 36).destroy();

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
      for (let beat = 0; beat <= 64; beat += 2) {
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

    private createGround() {
      this.ground = this.add.rectangle(LEVEL_END_X / 2, FLOOR_Y + 30, LEVEL_END_X + 1400, 60, 0x24344d, 1);
      this.ground.setStrokeStyle(3, 0x65d9ff, 0.55);
      this.physics.add.existing(this.ground, true);
    }

    private createLevel() {
      for (const beat of CUBE_SPIKE_BEATS) {
        const spike = this.hazards.create(beatX(beat), FLOOR_Y, "pulse-spike") as import("phaser").Physics.Arcade.Image;
        spike.setOrigin(0.5, 1).refreshBody();
        const body = spike.body as import("phaser").Physics.Arcade.StaticBody;
        body.setSize(34, 37).setOffset(8, 12);
      }

      for (const hazard of SHIP_HAZARDS) {
        const y = hazard.side === "top" ? hazard.height / 2 : 540 - hazard.height / 2;
        const rectangle = this.add.rectangle(beatX(hazard.beat), y, 110, hazard.height, 0xff5f78, 0.9);
        rectangle.setStrokeStyle(3, 0xffffff, 0.45);
        this.physics.add.existing(rectangle, true);
        this.hazards.add(rectangle);
      }

      for (const item of PULSE_COINS) {
        const coin = this.coinsGroup.create(beatX(item.beat), item.y, "pulse-coin") as import("phaser").Physics.Arcade.Image;
        coin.refreshBody();
        this.tweens.add({ targets: coin, angle: 360, duration: 1400, repeat: -1 });
      }

      this.createPortal(beatX(SHIP_START_BEAT), 0xff6b7a, "SHIP");
      this.createPortal(beatX(SHIP_END_BEAT), 0x62d8ff, "CUBE");
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

    private createPlayer() {
      this.player = this.physics.add.sprite(LEVEL_START_X, FLOOR_Y - 26, "pulse-cube") as ArcadeSprite;
      this.player.setDepth(10).setCollideWorldBounds(false);
      this.player.body.setSize(42, 42).setOffset(3, 3);
      this.player.body.setVelocityX(RUN_SPEED);
    }

    private bindInput() {
      const down = () => {
        if (!this.started || this.ended || this.orientationPaused || this.pressed) return;
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
        this.ground.setVisible(false);
        (this.ground.body as import("phaser").Physics.Arcade.StaticBody).enable = false;
        this.player.setTexture("pulse-ship").setPosition(this.player.x, 300).setAngle(0);
        body.setSize(52, 28).setOffset(5, 4).setVelocityY(-80);
        this.modeLabel.setText("ROCKET MODE").setColor("#ff8b98");
      } else {
        this.ground.setVisible(true);
        (this.ground.body as import("phaser").Physics.Arcade.StaticBody).enable = true;
        this.player.setTexture("pulse-cube").setPosition(this.player.x, FLOOR_Y - 28).setAngle(0);
        body.setSize(42, 42).setOffset(3, 3).setVelocityY(0);
        this.modeLabel.setText("CUBE MODE").setColor("#8ce6ff");
      }
      callbacks.onModeChange(next);
      this.cameras.main.flash(180, next === "ship" ? 255 : 98, next === "ship" ? 107 : 216, next === "ship" ? 122 : 255, false);
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
      callbacks.onFinish({
        progressPercent: completed ? 100 : clampProgress(this.player.x),
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
