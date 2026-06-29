"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCcw, Smartphone, Trophy, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { mountPulseRunner, type PulseRunSummary } from "./PulseRunnerPhaser";
import type { PulseMode } from "./level";

type Screen = "idle" | "starting" | "ready" | "playing" | "saving" | "result";

type FinishResult = {
  progressPercent: number;
  completed: boolean;
  durationMs: number;
  coins: number;
  bestProgress: number;
  rewardXp: number;
  rewardEligible: boolean;
  rewardedRunsToday: number;
  levelBefore: number;
  levelAfter: number;
  unlocked: Array<{ title: string; titleLabel: string | null; rank: string }>;
};

type LockableScreenOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

function formatTime(ms: number) {
  return `${(Math.max(0, ms) / 1000).toFixed(2)}s`;
}

export default function PulseRunnerGame({
  initialBestProgress,
  rewardedRunsToday,
}: {
  initialBestProgress: number;
  rewardedRunsToday: number;
}) {
  const router = useRouter();
  const mountRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const controllerRef = useRef<{
    begin(): void;
    setPaused(paused: boolean): void;
    destroy(): void;
  } | null>(null);
  const runIdRef = useRef<string | null>(null);
  const startTokenRef = useRef(0);
  const orientationFullscreenRef = useRef(false);

  const [screen, setScreen] = useState<Screen>("idle");
  const [progress, setProgress] = useState(0);
  const [runnerMode, setRunnerMode] = useState<PulseMode>("cube");
  const [muted, setMuted] = useState(false);
  const [needsLandscape, setNeedsLandscape] = useState(false);
  const [orientationError, setOrientationError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [bestProgress, setBestProgress] = useState(initialBestProgress);
  const [rewardedToday, setRewardedToday] = useState(rewardedRunsToday);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopMusic = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
  }, []);

  const saveRun = useCallback(
    async (summary: PulseRunSummary) => {
      stopMusic();
      setScreen("saving");
      const runId = runIdRef.current;
      if (!runId) {
        setError("プレイ記録が見つかりませんでした。");
        setScreen("result");
        return;
      }

      try {
        const response = await fetch("/api/games/pulse-runner/finish", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ runId, ...summary }),
        });
        const payload = (await response.json().catch(() => null)) as
          | (FinishResult & { error?: string })
          | null;
        if (!response.ok || !payload) {
          throw new Error(payload?.error || "記録を保存できませんでした。");
        }

        setResult(payload);
        setBestProgress(payload.bestProgress);
        setRewardedToday(payload.rewardedRunsToday);
        setScreen("result");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "記録を保存できませんでした。");
        setResult({
          progressPercent: summary.progressPercent,
          completed: summary.completed,
          durationMs: summary.durationMs,
          coins: summary.coins,
          bestProgress,
          rewardXp: 0,
          rewardEligible: false,
          rewardedRunsToday: rewardedToday,
          levelBefore: 1,
          levelAfter: 1,
          unlocked: [],
        });
        setScreen("result");
      }
    },
    [bestProgress, rewardedToday, router, stopMusic]
  );

  const startGame = useCallback(async () => {
    if (
      needsLandscape ||
      screen === "starting" ||
      screen === "playing" ||
      screen === "saving"
    ) return;
    const parent = mountRef.current;
    if (!parent) return;

    const token = startTokenRef.current + 1;
    startTokenRef.current = token;
    setScreen("starting");
    setError(null);
    setResult(null);
    setProgress(0);
    setRunnerMode("cube");

    try {
      const response = await fetch("/api/games/pulse-runner/start", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | { runId?: string; error?: string }
        | null;
      if (!response.ok || !payload?.runId) {
        throw new Error(payload?.error || "ゲームを開始できませんでした。");
      }
      runIdRef.current = payload.runId;
      if (startTokenRef.current !== token) return;

      controllerRef.current?.destroy();
      parent.replaceChildren();

      controllerRef.current = await mountPulseRunner({
        parent,
        callbacks: {
          onReady: () => {
            if (startTokenRef.current !== token) return;
            setScreen("ready");
          },
          onProgress: (value) => setProgress(value),
          onModeChange: (value) => setRunnerMode(value),
          onFinish: (summary) => void saveRun(summary),
        },
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ゲームを開始できませんでした。");
      setScreen("idle");
    }
  }, [needsLandscape, saveRun, screen]);

  const beginGame = useCallback(() => {
    if (screen !== "ready" || needsLandscape) return;
    const music = audioRef.current;
    if (music) {
      music.currentTime = 0;
      music.muted = muted;
      void music.play().catch(() => undefined);
    }
    controllerRef.current?.begin();
    setAttempts((value) => value + 1);
    setScreen("playing");
  }, [muted, needsLandscape, screen]);

  const requestLandscape = useCallback(async (allowFullscreen: boolean) => {
    const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
    if (!orientation?.lock) {
      if (allowFullscreen) {
        setOrientationError("端末の画面回転ロックを解除して、スマホを横向きにしてください。");
      }
      return false;
    }

    try {
      await orientation.lock("landscape");
      setOrientationError(null);
      return true;
    } catch {
      // 通常のブラウザでは全画面表示中のみ向きの固定が許可される場合がある。
    }

    if (allowFullscreen && !document.fullscreenElement && document.fullscreenEnabled) {
      try {
        await document.documentElement.requestFullscreen();
        orientationFullscreenRef.current = true;
        await orientation.lock("landscape");
        setOrientationError(null);
        return true;
      } catch {
        // 下の案内を表示する。
      }
    }

    if (allowFullscreen) {
      setOrientationError("端末の画面回転ロックを解除して、スマホを横向きにしてください。");
    }
    return false;
  }, []);

  useEffect(() => {
    const portraitQuery = window.matchMedia("(orientation: portrait)");
    const coarsePointerQuery = window.matchMedia("(pointer: coarse)");
    const updateOrientation = () => {
      setNeedsLandscape(
        portraitQuery.matches && (coarsePointerQuery.matches || navigator.maxTouchPoints > 0)
      );
    };

    updateOrientation();
    portraitQuery.addEventListener("change", updateOrientation);
    coarsePointerQuery.addEventListener("change", updateOrientation);
    window.addEventListener("resize", updateOrientation);
    return () => {
      portraitQuery.removeEventListener("change", updateOrientation);
      coarsePointerQuery.removeEventListener("change", updateOrientation);
      window.removeEventListener("resize", updateOrientation);
    };
  }, []);

  useEffect(() => {
    const isTouchDevice =
      window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0;
    if (isTouchDevice && window.matchMedia("(orientation: portrait)").matches) {
      void requestLandscape(false);
    }

    return () => {
      const orientation = window.screen.orientation as LockableScreenOrientation | undefined;
      orientation?.unlock?.();
      if (orientationFullscreenRef.current && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
      }
    };
  }, [requestLandscape]);

  useEffect(() => {
    controllerRef.current?.setPaused(needsLandscape);
    const audio = audioRef.current;
    if (!audio) return;
    if (needsLandscape) {
      audio.pause();
    } else if (screen === "playing") {
      void audio.play().catch(() => undefined);
    }
  }, [needsLandscape, screen]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.muted = muted;
  }, [muted]);

  useEffect(() => {
    return () => {
      startTokenRef.current += 1;
      stopMusic();
      controllerRef.current?.destroy();
      controllerRef.current = null;
    };
  }, [stopMusic]);

  return (
    <section className="relative h-[100svh] min-h-[36rem] overflow-hidden bg-[#090d18] text-white">
      <audio
        ref={audioRef}
        src="/audio/pulse-runner-theme.wav"
        preload="auto"
        loop
      />
      <div
        ref={mountRef}
        className="absolute inset-0 touch-none select-none overflow-hidden"
        role="application"
        aria-label="Pulse Runner game area"
        data-testid="pulse-game-area"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 sm:p-6">
        <Link
          href="/games"
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/50 backdrop-blur transition hover:bg-black/70"
          aria-label="ゲーム一覧に戻る"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden="true" />
        </Link>

        <div className="min-w-0 flex-1 px-2 text-center">
          <div className="text-[11px] font-black uppercase text-white/50">Pulse Runner</div>
          <div className="mt-1 text-sm font-bold tracking-wide">
            {runnerMode === "cube" ? "CUBE" : "ROCKET"}・{Math.round(progress)}%
          </div>
          <div className="mx-auto mt-2 h-1.5 max-w-md overflow-hidden bg-white/15">
            <div
              className="h-full bg-[#62d8ff] transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setMuted((value) => !value)}
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-lg border border-white/15 bg-black/50 backdrop-blur transition hover:bg-black/70"
          aria-label={muted ? "音楽をオンにする" : "音楽をオフにする"}
        >
          {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {screen === "idle" ? (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/20 px-5 pb-10 sm:items-center sm:pb-0">
          <div className="w-full max-w-lg text-center">
            <div className="text-xs font-black uppercase text-[#62d8ff]">HabitBase Games</div>
            <h1 className="mt-2 text-4xl font-black sm:text-6xl">PULSE RUNNER</h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-white/65">
              拍に乗って跳び、ロケットで駆け抜ける。到達率100%を目指そう。
            </p>
            <button
              type="button"
              onClick={() => void startGame()}
              data-testid="pulse-start"
              className="mt-7 inline-flex h-14 w-full items-center justify-center rounded-lg bg-white px-6 text-base font-black text-[#090d18] transition hover:bg-white/90"
            >
              RUN
            </button>
            <div className="mt-4 flex items-center justify-center gap-5 text-xs text-white/45">
              <span>BEST {Math.round(bestProgress)}%</span>
              <span>XP対象 {Math.min(rewardedToday, 3)} / 3</span>
            </div>
          </div>
        </div>
      ) : null}

      {screen === "starting" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
          <div className="text-sm font-bold text-white/70">LOADING BEAT...</div>
        </div>
      ) : null}

      {screen === "ready" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/45 px-5 backdrop-blur-[2px]">
          <button
            type="button"
            onClick={beginGame}
            className="inline-flex h-16 w-full max-w-md items-center justify-center rounded-lg bg-[#62d8ff] px-6 text-lg font-black text-[#07111d] shadow-[0_0_36px_rgba(98,216,255,0.35)] transition hover:bg-[#8ce5ff]"
          >
            TAP TO START
          </button>
        </div>
      ) : null}

      {screen === "playing" ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 text-center text-xs font-bold text-white/50">
          {runnerMode === "cube" ? "TAP / SPACE" : "HOLD TO FLY"}・ATTEMPT {attempts}
        </div>
      ) : null}

      {screen === "saving" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-3xl font-black">{progress >= 99.5 ? "LEVEL COMPLETE" : "CRASHED"}</div>
            <div className="mt-3 text-sm text-white/55">記録を確定中...</div>
          </div>
        </div>
      ) : null}

      {screen === "result" ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/70 px-5 py-20 backdrop-blur-sm">
          <div className="w-full max-w-lg text-center">
            <div className="text-xs font-black uppercase text-white/50">
              {result?.completed ? "LEVEL COMPLETE" : "RUN RESULT"}
            </div>
            <div className="mt-1 text-6xl font-black tabular-nums">
              {Math.round(result?.progressPercent ?? progress)}%
            </div>
            {result ? (
              <div className="mt-6 grid grid-cols-3 border-y border-white/15 py-4">
                <div>
                  <div className="text-xs text-white/45">TIME</div>
                  <div className="mt-1 text-lg font-bold">{formatTime(result.durationMs)}</div>
                </div>
                <div className="border-x border-white/15">
                  <div className="text-xs text-white/45">SHARDS</div>
                  <div className="mt-1 text-lg font-bold">{result.coins} / 3</div>
                </div>
                <div>
                  <div className="text-xs text-white/45">XP</div>
                  <div className="mt-1 text-lg font-bold text-[#7bf1a8]">+{result.rewardXp}</div>
                </div>
              </div>
            ) : null}

            {result && result.levelAfter > result.levelBefore ? (
              <div className="mt-4 border border-[#62d8ff]/35 bg-[#62d8ff]/10 px-4 py-3 text-sm font-bold text-[#9de9ff]">
                LEVEL UP! Lv {result.levelBefore} → Lv {result.levelAfter}
              </div>
            ) : null}
            {result?.unlocked.map((badge) => (
              <div
                key={badge.title}
                className="mt-3 border border-[#ffd166]/35 bg-[#ffd166]/10 px-4 py-3 text-sm font-bold text-[#ffe19a]"
              >
                新しい称号「{badge.titleLabel ?? badge.title}」を獲得
              </div>
            ))}
            {error ? <p className="mt-4 text-sm text-[#ff8b98]">{error}</p> : null}

            <button
              type="button"
              onClick={() => void startGame()}
              className="mt-7 inline-flex h-14 w-full items-center justify-center gap-2 rounded-lg bg-white px-6 text-base font-black text-[#090d18] transition hover:bg-white/90"
            >
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
              RETRY
            </button>
            <a
              href="#pulse-ranking"
              className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-white/20 text-sm font-bold transition hover:bg-white/10"
            >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              ランキングを見る
            </a>
          </div>
        </div>
      ) : null}

      {needsLandscape ? (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-[#090d18] px-6 text-center">
          <div className="max-w-sm">
            <Smartphone
              className="mx-auto h-16 w-16 rotate-90 text-[#62d8ff]"
              aria-hidden="true"
            />
            <h2 className="mt-6 text-2xl font-black">画面を横向きにしてください</h2>
            <p className="mt-3 text-sm leading-6 text-white/60">
              Pulse Runnerは横画面専用です。スマホを横向きにするとゲームへ戻ります。
            </p>
            <button
              type="button"
              onClick={() => void requestLandscape(true)}
              className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#62d8ff] px-5 text-sm font-black text-[#07111d] transition hover:bg-[#8ce5ff]"
            >
              横画面に切り替える
            </button>
            {orientationError ? (
              <p className="mt-4 text-sm leading-6 text-[#ff9aa5]">{orientationError}</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
