"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  LoaderCircle,
  RefreshCw,
  SwitchCamera,
  Trash2,
  X,
} from "lucide-react";

type FacingMode = "environment" | "user";

function messageForCameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "カメラの使用が許可されていません。ブラウザ設定から許可してください。";
    if (error.name === "NotFoundError") return "利用できるカメラが見つかりません。";
    if (error.name === "NotReadableError") return "カメラがほかのアプリで使用中です。";
  }
  return error instanceof Error ? error.message : "カメラを起動できませんでした。";
}

export default function SessionCameraCapture({
  sessionId,
  onBusyChange,
}: {
  sessionId: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [facingMode, setFacingMode] = useState<FacingMode>("environment");
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [savedMediaUrl, setSavedMediaUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  }, []);

  const clearLocalCapture = useCallback(() => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
    setCapturedBlob(null);
  }, []);

  const startCamera = useCallback(
    async (facing: FacingMode) => {
      stopCamera();
      clearLocalCapture();
      setError("");

      if (!navigator.mediaDevices?.getUserMedia) {
        setError("このブラウザはカメラ撮影に対応していません。");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facing },
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
        }
      } catch (cameraError) {
        setError(messageForCameraError(cameraError));
      }
    },
    [clearLocalCapture, stopCamera]
  );

  useEffect(() => {
    if (!open) return;
    void startCamera(facingMode);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
      stopCamera();
    };
  }, [facingMode, open, startCamera, stopCamera]);

  useEffect(
    () => () => {
      stopCamera();
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    },
    [stopCamera]
  );

  function closeCamera() {
    if (busy) return;
    setOpen(false);
    clearLocalCapture();
    setError("");
  }

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;

    const maxWidth = 1280;
    const scale = Math.min(1, maxWidth / video.videoWidth);
    const width = Math.max(1, Math.round(video.videoWidth * scale));
    const height = Math.max(1, Math.round(video.videoHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      setError("写真を作成できませんでした。");
      return;
    }

    if (facingMode === "user") {
      context.translate(width, 0);
      context.scale(-1, 1);
    }
    context.drawImage(video, 0, 0, width, height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError("写真を作成できませんでした。");
          return;
        }
        const url = URL.createObjectURL(blob);
        previewUrlRef.current = url;
        setPreviewUrl(url);
        setCapturedBlob(blob);
        stopCamera();
      },
      "image/jpeg",
      0.86
    );
  }

  async function saveCapture() {
    if (!capturedBlob || busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("sessionId", sessionId);
      form.set("capturedAt", new Date().toISOString());
      form.set("photo", new File([capturedBlob], "camera-capture.jpg", { type: "image/jpeg" }));
      const response = await fetch("/api/streaks/capture-photo", {
        method: "POST",
        body: form,
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; mediaUrl?: string; capturedAt?: string }
        | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || "写真を保存できませんでした。");
      setSaved(true);
      setSavedMediaUrl(
        body.mediaUrl
          ? `${body.mediaUrl}&v=${encodeURIComponent(body.capturedAt ?? new Date().toISOString())}`
          : null
      );
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "写真を保存できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  async function removeCapture() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/streaks/capture-photo", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!response.ok || !body?.ok) throw new Error(body?.error || "写真を削除できませんでした。");
      setSaved(false);
      setSavedMediaUrl(null);
      clearLocalCapture();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "写真を削除できませんでした。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-secondary/20 p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {saved && (previewUrl || savedMediaUrl) ? (
              <Image
                src={previewUrl || savedMediaUrl || ""}
                alt="撮影した終了写真"
                width={96}
                height={72}
                unoptimized
                className="h-16 w-20 shrink-0 rounded-lg object-cover"
              />
            ) : (
              <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-background">
                <Camera className="size-5 text-muted-foreground" aria-hidden={true} />
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold">終了時の写真</div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {saved ? "撮影した写真をリザルトに表示します。" : "任意。その場でカメラ撮影した写真だけ使えます。"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setOpen(true)}
              className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary/40 disabled:opacity-50 sm:flex-none"
            >
              <Camera className="size-4" aria-hidden={true} />
              {saved ? "撮り直す" : "写真を撮る"}
            </button>
            {saved ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void removeCapture()}
                aria-label="終了写真を削除"
                title="終了写真を削除"
                className="inline-flex size-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-secondary/40 disabled:opacity-50"
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </button>
            ) : null}
          </div>
        </div>
        {!open && error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-3" role="dialog" aria-modal="true" aria-label="終了写真を撮影">
          <div className="w-full max-w-xl overflow-hidden rounded-lg border border-white/15 bg-background shadow-2xl">
            <div className="flex h-14 items-center justify-between border-b border-border px-4">
              <div className="font-semibold">終了写真を撮影</div>
              <button type="button" onClick={closeCamera} disabled={busy} className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-secondary/50" aria-label="カメラを閉じる">
                <X className="size-5" aria-hidden={true} />
              </button>
            </div>

            <div className="relative aspect-[4/3] bg-black">
              {previewUrl ? (
                <Image src={previewUrl} alt="撮影プレビュー" fill unoptimized className="object-contain" />
              ) : (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className={`h-full w-full object-contain ${facingMode === "user" ? "-scale-x-100" : ""}`}
                />
              )}
              {!previewUrl && !cameraReady && !error ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
                  <LoaderCircle className="mr-2 size-5 animate-spin" aria-hidden={true} />
                  カメラを起動中
                </div>
              ) : null}
              {error ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 p-4">
              {error ? (
                <button type="button" onClick={() => void startCamera(facingMode)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-border font-semibold hover:bg-secondary/40">
                  <RefreshCw className="size-4" aria-hidden={true} />
                  もう一度試す
                </button>
              ) : previewUrl ? (
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy} onClick={() => void startCamera(facingMode)} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border font-semibold hover:bg-secondary/40 disabled:opacity-50">
                    <RefreshCw className="size-4" aria-hidden={true} />
                    撮り直す
                  </button>
                  <button type="button" disabled={busy} onClick={() => void saveCapture()} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />}
                    {busy ? "保存中" : "この写真を使う"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-3">
                  <span />
                  <button type="button" disabled={!cameraReady} onClick={capture} aria-label="撮影する" className="mx-auto flex size-16 items-center justify-center rounded-full border-4 border-white bg-white/20 text-white disabled:opacity-40">
                    <Camera className="size-7" aria-hidden={true} />
                  </button>
                  <button
                    type="button"
                    disabled={!cameraReady}
                    onClick={() => setFacingMode((current) => (current === "environment" ? "user" : "environment"))}
                    aria-label="前面と背面のカメラを切り替える"
                    title="カメラ切替"
                    className="inline-flex size-11 items-center justify-center rounded-lg border border-border hover:bg-secondary/40 disabled:opacity-40"
                  >
                    <SwitchCamera className="size-5" aria-hidden={true} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
