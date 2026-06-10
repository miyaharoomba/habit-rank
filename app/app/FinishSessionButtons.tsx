"use client";

import { useFormStatus } from "react-dom";

export default function FinishSessionButtons() {
  const { pending } = useFormStatus();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="submit"
        name="mode"
        value="restart"
        disabled={pending}
        className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "終了して再開中…" : "終了して次を開始"}
      </button>

      <button
        type="submit"
        name="mode"
        value="stop"
        disabled={pending}
        className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "終了処理中…" : "完全に終了"}
      </button>
    </div>
  );
}