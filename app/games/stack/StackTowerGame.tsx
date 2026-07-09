"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import {
  axisForStage,
  BLOCK_HEIGHT,
  initialStack,
  movingBlock,
  PERFECT_SIZE_UP_INTERVAL,
  placeBlock,
  type StackBlock,
  type StackCut,
} from "./gameEngine";

type GameMode = "idle" | "starting" | "playing" | "saving" | "finished";

type FinishResult = {
  score: number;
  blocks: number;
  perfects: number;
  maxCombo: number;
  bestScore: number;
  rewardXp: number;
  rewardEligible: boolean;
  rewardedRunsToday: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: Array<{
    title: string;
    titleLabel: string | null;
    rank: string;
  }>;
};

type FallingPiece = {
  mesh: THREE.Mesh;
  velocity: number;
  spinX: number;
  spinZ: number;
};

type SizeUpEffect = {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
};

const BLOCK_COLORS = [
  0x55c2ff,
  0xff6b6b,
  0xffd166,
  0x6bd89e,
  0xb69cff,
  0xff9f68,
];

const STACK_BGM_STEP_MS = 145;
const STACK_BGM_ARP = [0, 7, 10, 14, 12, 10, 7, 5, 0, 5, 8, 12, 15, 12, 10, 7];
const STACK_BGM_BASS = [-12, -12, -17, -17, -19, -19, -15, -15];

type AudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

class StackAudioController {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private bgmTimer: number | null = null;
  private bgmStep = 0;

  private createContext() {
    if (this.context) return this.context;
    const AudioCtor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!AudioCtor) return null;

    const context = new AudioCtor();
    const masterGain = context.createGain();
    masterGain.gain.value = 0.42;
    masterGain.connect(context.destination);

    const bgmGain = context.createGain();
    bgmGain.gain.value = 0;
    bgmGain.connect(masterGain);

    this.context = context;
    this.masterGain = masterGain;
    this.bgmGain = bgmGain;
    return context;
  }

  private async unlock() {
    const context = this.createContext();
    if (!context) return null;
    if (context.state === "suspended") {
      await context.resume().catch(() => undefined);
    }
    return context;
  }

  private playTone({
    frequency,
    duration,
    gain,
    type,
    delay = 0,
    destination,
  }: {
    frequency: number;
    duration: number;
    gain: number;
    type: OscillatorType;
    delay?: number;
    destination?: AudioNode | null;
  }) {
    const context = this.context;
    const output = destination ?? this.masterGain;
    if (!context || !output) return;

    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain, start + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.04);
  }

  private playBgmStep() {
    const context = this.context;
    if (!context || !this.bgmGain) return;

    const step = this.bgmStep % STACK_BGM_ARP.length;
    const baseFrequency = 196;
    const semitone = STACK_BGM_ARP[step];
    const frequency = baseFrequency * 2 ** (semitone / 12);

    this.playTone({
      frequency,
      duration: 0.13,
      gain: 0.028,
      type: "triangle",
      destination: this.bgmGain,
    });

    if (step % 4 === 0) {
      const bassSemitone = STACK_BGM_BASS[Math.floor(step / 2) % STACK_BGM_BASS.length];
      this.playTone({
        frequency: baseFrequency * 2 ** (bassSemitone / 12),
        duration: 0.22,
        gain: 0.036,
        type: "sawtooth",
        destination: this.bgmGain,
      });
    }

    this.bgmStep += 1;
  }

  prime() {
    void this.unlock();
  }

  startBgm() {
    void this.unlock().then((context) => {
      if (!context || !this.bgmGain || this.bgmTimer !== null) return;
      this.bgmStep = 0;
      this.bgmGain.gain.cancelScheduledValues(context.currentTime);
      this.bgmGain.gain.setTargetAtTime(1, context.currentTime, 0.08);
      this.playBgmStep();
      this.bgmTimer = window.setInterval(() => this.playBgmStep(), STACK_BGM_STEP_MS);
    });
  }

  stopBgm() {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    if (this.context && this.bgmGain) {
      this.bgmGain.gain.cancelScheduledValues(this.context.currentTime);
      this.bgmGain.gain.setTargetAtTime(0, this.context.currentTime, 0.08);
    }
  }

  playPerfect(combo: number) {
    void this.unlock().then(() => {
      const semitone = Math.min(22, Math.max(0, combo - 1));
      const frequency = 523.25 * 2 ** (semitone / 12);
      this.playTone({ frequency, duration: 0.12, gain: 0.13, type: "triangle" });
      this.playTone({
        frequency: frequency * 2,
        duration: 0.08,
        gain: 0.045,
        type: "sine",
        delay: 0.018,
      });
    });
  }

  playSizeUp(combo: number) {
    void this.unlock().then(() => {
      const start = 392 * 2 ** (Math.min(12, combo) / 24);
      [0, 4, 7, 12].forEach((semitone, index) => {
        this.playTone({
          frequency: start * 2 ** (semitone / 12),
          duration: 0.22,
          gain: 0.07,
          type: "triangle",
          delay: index * 0.035,
        });
      });
    });
  }

  playPlace(overlapRatio: number) {
    void this.unlock().then(() => {
      const frequency = 130 + Math.max(0, overlapRatio) * 70;
      this.playTone({ frequency, duration: 0.07, gain: 0.07, type: "square" });
    });
  }

  playGameOver() {
    void this.unlock().then(() => {
      [220, 174.61, 130.81].forEach((frequency, index) => {
        this.playTone({
          frequency,
          duration: 0.16,
          gain: 0.075,
          type: "sawtooth",
          delay: index * 0.075,
        });
      });
    });
  }

  dispose() {
    this.stopBgm();
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.masterGain = null;
    this.bgmGain = null;
  }
}

function blockMaterial(stage: number) {
  return new THREE.MeshStandardMaterial({
    color: BLOCK_COLORS[stage % BLOCK_COLORS.length],
    roughness: 0.45,
    metalness: 0.08,
  });
}

function createBlockMesh(block: StackBlock, stage: number, y: number) {
  const geometry = new THREE.BoxGeometry(block.width, BLOCK_HEIGHT, block.depth);
  const mesh = new THREE.Mesh(geometry, blockMaterial(stage));
  mesh.position.set(block.x, y, block.z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else {
      child.material.dispose();
    }
  });
}

export default function StackTowerGame({
  initialBestScore,
  rewardedRunsToday,
}: {
  initialBestScore: number;
  rewardedRunsToday: number;
}) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const towerGroupRef = useRef<THREE.Group | null>(null);
  const effectsGroupRef = useRef<THREE.Group | null>(null);
  const movingMeshRef = useRef<THREE.Mesh | null>(null);
  const fallingRef = useRef<FallingPiece[]>([]);
  const sizeUpEffectsRef = useRef<SizeUpEffect[]>([]);
  const audioRef = useRef<StackAudioController | null>(null);
  const frameRef = useRef<number | null>(null);
  const stageStartedAtRef = useRef(0);
  const gameModeRef = useRef<GameMode>("idle");
  const stackRef = useRef<StackBlock[]>(initialStack());
  const tapsRef = useRef<number[]>([]);
  const scoreRef = useRef(0);
  const comboRef = useRef(0);
  const perfectsRef = useRef(0);
  const runIdRef = useRef<string | null>(null);
  const seedRef = useRef(0);
  const placementLockedRef = useRef(false);
  const placementUnlockTimerRef = useRef<number | null>(null);
  const interruptedRunRef = useRef(false);
  const recoveryReloadingRef = useRef(false);
  const cameraTargetYRef = useRef(1.7);

  const [mode, setMode] = useState<GameMode>("idle");
  const [score, setScore] = useState(0);
  const [blocks, setBlocks] = useState(0);
  const [combo, setCombo] = useState(0);
  const [bestScore, setBestScore] = useState(initialBestScore);
  const [rewardedToday, setRewardedToday] = useState(rewardedRunsToday);
  const [feedback, setFeedback] = useState<{ id: number; text: string } | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setGameMode = useCallback((next: GameMode) => {
    gameModeRef.current = next;
    setMode(next);
  }, []);

  const getAudio = useCallback(() => {
    audioRef.current ??= new StackAudioController();
    return audioRef.current;
  }, []);

  const reloadGamePage = useCallback(() => {
    if (recoveryReloadingRef.current) return;
    recoveryReloadingRef.current = true;
    window.location.reload();
  }, []);

  const clearGameObjects = useCallback(() => {
    const tower = towerGroupRef.current;
    const effects = effectsGroupRef.current;
    if (tower) {
      for (const child of [...tower.children]) {
        tower.remove(child);
        disposeObject(child);
      }
    }
    if (effects) {
      for (const child of [...effects.children]) {
        effects.remove(child);
        disposeObject(child);
      }
    }
    movingMeshRef.current = null;
    fallingRef.current = [];
    sizeUpEffectsRef.current = [];
  }, []);

  const addFoundation = useCallback(() => {
    const tower = towerGroupRef.current;
    if (!tower) return;
    const foundation = createBlockMesh(initialStack()[0], 0, 0);
    tower.add(foundation);
  }, []);

  const addMovingMesh = useCallback((stage: number) => {
    const tower = towerGroupRef.current;
    const previous = stackRef.current[stackRef.current.length - 1];
    if (!tower || !previous) return;

    const block = movingBlock(previous, stage, 0, seedRef.current);
    const mesh = createBlockMesh(block, stage, stage * BLOCK_HEIGHT);
    tower.add(mesh);
    movingMeshRef.current = mesh;
    stageStartedAtRef.current = performance.now();
  }, []);

  const clearPlacementUnlockTimer = useCallback(() => {
    if (placementUnlockTimerRef.current === null) return;
    window.clearTimeout(placementUnlockTimerRef.current);
    placementUnlockTimerRef.current = null;
  }, []);

  const resetInterruptedGame = useCallback(() => {
    audioRef.current?.stopBgm();
    clearPlacementUnlockTimer();
    clearGameObjects();
    stackRef.current = initialStack();
    tapsRef.current = [];
    scoreRef.current = 0;
    comboRef.current = 0;
    perfectsRef.current = 0;
    runIdRef.current = null;
    seedRef.current = 0;
    placementLockedRef.current = false;
    interruptedRunRef.current = false;
    cameraTargetYRef.current = 1.7;
    setScore(0);
    setBlocks(0);
    setCombo(0);
    setFeedback(null);
    setResult(null);
    setError(null);
    addFoundation();
    setGameMode("idle");
  }, [addFoundation, clearGameObjects, clearPlacementUnlockTimer, setGameMode]);

  const addFallingPiece = useCallback(
    (cut: StackCut, stage: number, existingMesh?: THREE.Mesh | null) => {
      const effects = effectsGroupRef.current;
      const tower = towerGroupRef.current;
      if (!effects) return;

      const mesh = existingMesh ?? createBlockMesh(cut, stage, stage * BLOCK_HEIGHT);
      if (existingMesh && tower) tower.remove(existingMesh);
      if (!existingMesh) mesh.position.set(cut.x, stage * BLOCK_HEIGHT, cut.z);
      effects.add(mesh);
      fallingRef.current.push({
        mesh,
        velocity: 0.018,
        spinX: cut.axis === "z" ? 0.018 : 0.008,
        spinZ: cut.axis === "x" ? 0.018 : 0.008,
      });
    },
    []
  );

  const addSizeUpEffect = useCallback((block: StackBlock, stage: number) => {
    const effects = effectsGroupRef.current;
    if (!effects) return;

    const geometry = new THREE.BoxGeometry(
      block.width + 0.1,
      BLOCK_HEIGHT + 0.1,
      block.depth + 0.1
    );
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd166,
      transparent: true,
      opacity: 0.62,
      wireframe: true,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(block.x, stage * BLOCK_HEIGHT, block.z);
    effects.add(mesh);
    sizeUpEffectsRef.current.push({ mesh, life: 0, maxLife: 34 });
  }, []);

  const finishRun = useCallback(async () => {
    const runId = runIdRef.current;
    if (!runId) return;
    setGameMode("saving");

    try {
      const response = await fetch("/api/games/stack/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId, tapsMs: tapsRef.current }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (FinishResult & { error?: string })
        | null;

      if (!response.ok || !payload) {
        throw new Error(payload?.error || "スコアを確定できませんでした。");
      }

      setResult(payload);
      setBestScore(payload.bestScore);
      setRewardedToday(payload.rewardedRunsToday);
      setGameMode("finished");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "スコアを確定できませんでした。");
      setGameMode("finished");
    }
  }, [router, setGameMode]);

  const placeCurrentBlock = useCallback(() => {
    if (gameModeRef.current !== "playing") return;
    const renderer = rendererRef.current;
    if (!renderer || !renderer.domElement.isConnected || !movingMeshRef.current) {
      reloadGamePage();
      return;
    }
    if (placementLockedRef.current) return;

    const tower = towerGroupRef.current;
    const movingMesh = movingMeshRef.current;
    const stage = stackRef.current.length;
    const previous = stackRef.current[stackRef.current.length - 1];
    if (!tower || !movingMesh || !previous) return;

    placementLockedRef.current = true;
    const elapsedMs = Math.max(50, Math.round(performance.now() - stageStartedAtRef.current));
    tapsRef.current.push(elapsedMs);
    const moving = movingBlock(previous, stage, elapsedMs, seedRef.current);
    const placement = placeBlock({
      previous,
      moving,
      stage,
      combo: comboRef.current,
    });

    if (placement.gameOver || !placement.block) {
      addFallingPiece({ ...moving, axis: axisForStage(stage) }, stage, movingMesh);
      movingMeshRef.current = null;
      comboRef.current = 0;
      setCombo(0);
      const audio = getAudio();
      audio.stopBgm();
      audio.playGameOver();
      if (navigator.vibrate) navigator.vibrate([40, 30, 70]);
      void finishRun();
      return;
    }

    movingMesh.geometry.dispose();
    movingMesh.geometry = new THREE.BoxGeometry(
      placement.block.width,
      BLOCK_HEIGHT,
      placement.block.depth
    );
    movingMesh.position.set(
      placement.block.x,
      stage * BLOCK_HEIGHT,
      placement.block.z
    );
    stackRef.current.push(placement.block);
    movingMeshRef.current = null;

    if (placement.cut) addFallingPiece(placement.cut, stage);
    if (placement.sizeUp) addSizeUpEffect(placement.block, stage);

    const audio = getAudio();
    if (placement.perfect) {
      audio.playPerfect(placement.combo);
      if (placement.sizeUp) audio.playSizeUp(placement.combo);
    } else {
      audio.playPlace(placement.overlapRatio);
    }

    scoreRef.current += placement.points;
    comboRef.current = placement.combo;
    if (placement.perfect) perfectsRef.current += 1;
    setScore(scoreRef.current);
    setBlocks(stage);
    setCombo(comboRef.current);
    cameraTargetYRef.current = Math.max(1.7, stage * BLOCK_HEIGHT + 1.2);
    setFeedback({
      id: Date.now(),
      text: placement.sizeUp
        ? `SIZE UP! PERFECT x${placement.combo}`
        : placement.perfect
          ? `PERFECT${placement.combo > 1 ? ` x${placement.combo}` : ""}`
          : `+${placement.points}`,
    });
    if (placement.perfect && navigator.vibrate) navigator.vibrate(18);

    addMovingMesh(stage + 1);
    placementUnlockTimerRef.current = window.setTimeout(() => {
      placementUnlockTimerRef.current = null;
      if (gameModeRef.current !== "playing") return;
      placementLockedRef.current = false;
    }, 110);
  }, [addFallingPiece, addMovingMesh, addSizeUpEffect, finishRun, getAudio, reloadGamePage]);

  const startGame = useCallback(async () => {
    const renderer = rendererRef.current;
    if (!renderer || !renderer.domElement.isConnected) {
      reloadGamePage();
      return;
    }
    if (gameModeRef.current === "starting" || gameModeRef.current === "playing") return;
    getAudio().prime();
    setError(null);
    setResult(null);
    setGameMode("starting");
    interruptedRunRef.current = false;
    clearPlacementUnlockTimer();

    try {
      const response = await fetch("/api/games/stack/start", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { runId?: string; seed?: number; error?: string }
        | null;
      if (!response.ok || !payload?.runId || !Number.isFinite(payload.seed)) {
        throw new Error(payload?.error || "ゲームを開始できませんでした。");
      }

      clearGameObjects();
      stackRef.current = initialStack();
      tapsRef.current = [];
      scoreRef.current = 0;
      comboRef.current = 0;
      perfectsRef.current = 0;
      runIdRef.current = payload.runId;
      seedRef.current = Number(payload.seed);
      placementLockedRef.current = false;
      cameraTargetYRef.current = 1.7;
      setScore(0);
      setBlocks(0);
      setCombo(0);
      addFoundation();
      addMovingMesh(1);
      getAudio().startBgm();
      setGameMode("playing");
    } catch (caught) {
      audioRef.current?.stopBgm();
      setError(caught instanceof Error ? caught.message : "ゲームを開始できませんでした。");
      setGameMode("idle");
    }
  }, [addFoundation, addMovingMesh, clearGameObjects, clearPlacementUnlockTimer, getAudio, reloadGamePage, setGameMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x090d18);
    scene.fog = new THREE.Fog(0x090d18, 12, 28);
    sceneRef.current = scene;

    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 80);
    camera.position.set(7.2, 7, 9.4);
    camera.lookAt(0, 1.2, 0);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const tower = new THREE.Group();
    const effects = new THREE.Group();
    scene.add(tower, effects);
    towerGroupRef.current = tower;
    effectsGroupRef.current = effects;

    scene.add(new THREE.HemisphereLight(0xcfe7ff, 0x151827, 1.7));
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
    keyLight.position.set(6, 11, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xff9f68, 1.1);
    rimLight.position.set(-7, 5, -6);
    scene.add(rimLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.92 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -BLOCK_HEIGHT / 2 - 0.03;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(24, 24, 0x24304a, 0x182033);
    grid.position.y = -BLOCK_HEIGHT / 2;
    scene.add(grid);

    if (gameModeRef.current === "idle") {
      addFoundation();
    } else {
      resetInterruptedGame();
    }

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      const aspect = width / height;
      const viewHeight = 8.8;
      camera.left = (-viewHeight * aspect) / 2;
      camera.right = (viewHeight * aspect) / 2;
      camera.top = viewHeight / 2;
      camera.bottom = -viewHeight / 2;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let previousTime = performance.now();
    let pixelCheckFrame = 0;
    let pixelCheckComplete = false;
    const animate = (time: number) => {
      const delta = Math.min(2.5, (time - previousTime) / 16.67);
      previousTime = time;

      if (gameModeRef.current === "playing" && movingMeshRef.current) {
        const stage = stackRef.current.length;
        const previous = stackRef.current[stackRef.current.length - 1];
        const elapsed = time - stageStartedAtRef.current;
        const block = movingBlock(previous, stage, elapsed, seedRef.current);
        movingMeshRef.current.position.x = block.x;
        movingMeshRef.current.position.z = block.z;
      }

      fallingRef.current = fallingRef.current.filter((piece) => {
        piece.velocity += 0.0014 * delta;
        piece.mesh.position.y -= piece.velocity * delta;
        piece.mesh.rotation.x += piece.spinX * delta;
        piece.mesh.rotation.z += piece.spinZ * delta;
        if (piece.mesh.position.y > -8) return true;
        effects.remove(piece.mesh);
        disposeObject(piece.mesh);
        return false;
      });

      sizeUpEffectsRef.current = sizeUpEffectsRef.current.filter((effect) => {
        effect.life += delta;
        const progress = Math.min(1, effect.life / effect.maxLife);
        effect.mesh.scale.setScalar(1 + progress * 0.34);
        effect.mesh.rotation.y += 0.045 * delta;
        const material = effect.mesh.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = Math.max(0, 0.62 * (1 - progress));
        }
        if (progress < 1) return true;
        effects.remove(effect.mesh);
        disposeObject(effect.mesh);
        return false;
      });

      const targetY = cameraTargetYRef.current;
      const lookY = camera.position.y - 5.5;
      const nextLookY = THREE.MathUtils.lerp(lookY, targetY, 0.055 * delta);
      camera.position.y = nextLookY + 5.5;
      camera.lookAt(0, nextLookY, 0);
      renderer.render(scene, camera);

      pixelCheckFrame += 1;
      if (!pixelCheckComplete && pixelCheckFrame >= 90) {
        const gl = renderer.getContext();
        const samples = [
          [0.35, 0.35],
          [0.5, 0.5],
          [0.65, 0.55],
          [0.5, 0.7],
        ];
        const colors = new Set<string>();
        const pixel = new Uint8Array(4);
        for (const [x, y] of samples) {
          gl.readPixels(
            Math.floor(gl.drawingBufferWidth * x),
            Math.floor(gl.drawingBufferHeight * y),
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            pixel
          );
          colors.add(`${pixel[0]},${pixel[1]},${pixel[2]},${pixel[3]}`);
        }
        renderer.domElement.dataset.renderReady = colors.size > 1 ? "true" : "false";
        renderer.domElement.dataset.pixelColorCount = String(colors.size);
        pixelCheckComplete = true;
      }
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    return () => {
      observer.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearPlacementUnlockTimer();
      clearGameObjects();
      disposeObject(floor);
      renderer.dispose();
      renderer.domElement.remove();
      scene.clear();
    };
  }, [addFoundation, clearGameObjects, clearPlacementUnlockTimer, resetInterruptedGame]);

  useEffect(() => {
    const markInterrupted = () => {
      audioRef.current?.stopBgm();
      if (gameModeRef.current === "playing") interruptedRunRef.current = true;
    };

    const recoverIfInterrupted = () => {
      if (gameModeRef.current !== "playing") return;
      if (!interruptedRunRef.current && movingMeshRef.current) return;
      resetInterruptedGame();
    };

    const recoverVisiblePage = () => {
      const renderer = rendererRef.current;
      if (!renderer || !renderer.domElement.isConnected) {
        reloadGamePage();
        return;
      }
      recoverIfInterrupted();
      if (gameModeRef.current === "playing") getAudio().startBgm();
    };

    const onPageShow = () => recoverVisiblePage();
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        audioRef.current?.stopBgm();
        return;
      }
      recoverVisiblePage();
    };

    window.addEventListener("pagehide", markInterrupted);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", recoverVisiblePage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", markInterrupted);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", recoverVisiblePage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [getAudio, reloadGamePage, resetInterruptedGame]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.code !== "Space" && event.code !== "Enter") return;
      event.preventDefault();
      if (gameModeRef.current === "playing") placeCurrentBlock();
      else if (gameModeRef.current === "idle" || gameModeRef.current === "finished") {
        void startGame();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [placeCurrentBlock, startGame]);

  useEffect(() => {
    return () => {
      audioRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 650);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const handleScenePointer = () => {
    if (gameModeRef.current === "playing") placeCurrentBlock();
  };

  return (
    <section className="relative h-[100svh] min-h-[36rem] overflow-hidden bg-[#090d18] text-white">
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none"
        onPointerDown={handleScenePointer}
        role="application"
        aria-label="Stack Tower game area"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-3 p-4 sm:p-6">
        <Link
          href="/games"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          aria-label="ゲーム一覧に戻る"
          title="ゲーム一覧に戻る"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>

        <div className="flex min-w-0 flex-col items-center">
          <div className="text-[11px] font-bold uppercase text-white/55">Stack Tower</div>
          <div className="mt-0.5 text-3xl font-black tabular-nums sm:text-4xl">{score}</div>
          {combo > 1 && mode === "playing" ? (
            <div className="mt-1 text-xs font-bold text-[#ffd166]">PERFECT x{combo}</div>
          ) : null}
        </div>

        <a
          href="#stack-ranking"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/45 text-white backdrop-blur transition hover:bg-black/65"
          aria-label="ランキングを見る"
          title="ランキング"
        >
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </a>
      </div>

      <div className="pointer-events-none absolute left-4 top-24 z-10 text-sm sm:left-6">
        <div className="text-white/50">積み上げ</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums">{blocks}</div>
      </div>

      <div className="pointer-events-none absolute right-4 top-24 z-10 text-right text-sm sm:right-6">
        <div className="text-white/50">自己ベスト</div>
        <div className="mt-0.5 text-xl font-bold tabular-nums">{bestScore}</div>
      </div>

      {feedback ? (
        <div
          key={feedback.id}
          className="pointer-events-none absolute inset-x-0 top-[38%] z-10 text-center text-2xl font-black text-[#ffd166] animate-pulse"
        >
          {feedback.text}
        </div>
      ) : null}

      {mode === "idle" ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/20 px-5 pb-12 pt-28 sm:items-center sm:pb-0">
          <div className="w-full max-w-md text-center">
            <div className="text-4xl font-black sm:text-5xl">STACK TOWER</div>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/70">
              流れてくるブロックをタップで積み上げよう。ずれた部分は切り落とされます。
            </p>
            <button
              type="button"
              onClick={() => void startGame()}
              className="mt-7 inline-flex h-14 w-full items-center justify-center rounded-lg bg-white px-6 text-base font-black text-[#090d18] transition hover:bg-white/90"
            >
              プレイする
            </button>
            <div className="mt-4 text-xs text-white/50">
              本日のXP対象 {Math.min(rewardedToday, 3)} / 3回
            </div>
          </div>
        </div>
      ) : null}

      {mode === "starting" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35">
          <div className="text-sm font-bold text-white/80">ステージを準備中...</div>
        </div>
      ) : null}

      {mode === "playing" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-7 z-10 text-center text-sm font-semibold text-white/65">
          タップ・クリック・Spaceで積む
          <span className="mt-1 block text-xs text-[#ffd166]/80">
            PERFECT {PERFECT_SIZE_UP_INTERVAL}連続でSIZE UP
          </span>
        </div>
      ) : null}

      {mode === "saving" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-2xl font-black">GAME OVER</div>
            <div className="mt-3 text-sm text-white/65">スコアを確定中...</div>
          </div>
        </div>
      ) : null}

      {mode === "finished" ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-y-auto bg-black/65 px-5 py-24 backdrop-blur-sm">
          <div className="w-full max-w-lg text-center">
            <div className="text-sm font-bold text-white/55">FINAL SCORE</div>
            <div className="mt-1 text-6xl font-black tabular-nums">
              {result?.score ?? score}
            </div>

            {result ? (
              <div className="mt-6 grid grid-cols-3 border-y border-white/15 py-4">
                <div>
                  <div className="text-xs text-white/45">ブロック</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{result.blocks}</div>
                </div>
                <div className="border-x border-white/15">
                  <div className="text-xs text-white/45">PERFECT</div>
                  <div className="mt-1 text-xl font-bold tabular-nums">{result.perfects}</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">獲得XP</div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-[#6bd89e]">
                    +{result.rewardXp}
                  </div>
                </div>
              </div>
            ) : null}

            {result && result.levelAfter > result.levelBefore ? (
              <div className="mt-4 border border-[#55c2ff]/35 bg-[#55c2ff]/10 px-4 py-3 text-sm font-bold text-[#8bd5ff]">
                LEVEL UP! Lv {result.levelBefore} → Lv {result.levelAfter}
              </div>
            ) : null}

            {result?.unlocked.map((badge) => (
              <div
                key={badge.title}
                className="mt-3 border border-[#ffd166]/35 bg-[#ffd166]/10 px-4 py-3 text-sm font-bold text-[#ffe29a]"
              >
                新しい称号「{badge.titleLabel ?? badge.title}」を獲得
              </div>
            ))}

            {result && !result.rewardEligible ? (
              <p className="mt-4 text-xs leading-5 text-white/55">
                本日のXP対象3回を達成済みです。スコアとランキングは記録されます。
              </p>
            ) : null}
            {error ? <p className="mt-4 text-sm text-[#ff8c8c]">{error}</p> : null}

            <button
              type="button"
              onClick={() => void startGame()}
              className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-base font-black text-[#090d18] transition hover:bg-white/90"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              もう一度
            </button>
            <a
              href="#stack-ranking"
              className="mt-3 inline-flex h-12 w-full items-center justify-center rounded-lg border border-white/20 text-sm font-bold text-white transition hover:bg-white/10"
            >
              ランキングを見る
            </a>
          </div>
        </div>
      ) : null}

      {error && mode === "idle" ? (
        <div className="absolute inset-x-4 bottom-4 z-30 border border-red-400/30 bg-red-950/85 px-4 py-3 text-center text-sm text-red-100 sm:inset-x-auto sm:left-1/2 sm:w-[28rem] sm:-translate-x-1/2">
          {error}
        </div>
      ) : null}
    </section>
  );
}
