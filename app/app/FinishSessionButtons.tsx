"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export default function FinishSessionButtons() {
  const { pending } = useFormStatus();
  const [locked, setLocked] = useState(false);
  const lastModeRef = useRef<"restart" | "stop" | null>(null);

  const busy = pending || locked;

  useEffect(() => {
    if (!pending) {
      const id = window.setTimeout(() => {
        setLocked(false);
        lastModeRef.current = null;
      }, 300);
      return () => window.clearTimeout(id);
    }
  }, [pending]);

  const lockWithMode = (mode: "restart" | "stop") => {
    if (busy) return;
    lastModeRef.current = mode;
    setLocked(true);
  };

  const restartLabel =
    busy && lastModeRef.current === "restart"
      ? "終了して再開中…"
      : "終了して次を開始";

  const stopLabel =
    busy && lastModeRef.current === "stop"
      ? "終了処理中…"
      : "完全に終了";

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="mode"
        value="restart"
        onClick={() => lockWithMode("restart")}
        disabled={busy}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {restartLabel}
      </button>

      <button
        type="submit"
        name="mode"
        value="stop"
        onClick={() => lockWithMode("stop")}
        disabled={busy}
        className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {stopLabel}
      </button>
    </div>
  );
}
