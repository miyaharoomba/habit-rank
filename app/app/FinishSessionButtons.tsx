"use client";

import { useFormStatus } from "react-dom";

export default function FinishSessionButtons({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <div className="grid gap-2 sm:flex sm:flex-wrap">
      <button
        type="submit"
        name="mode"
        value="restart"
        disabled={isDisabled}
        className="inline-flex w-full items-center justify-center rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
      >
        {pending ? "終了して再開中…" : "終了して次を開始"}
      </button>

      <button
        type="submit"
        name="mode"
        value="stop"
        disabled={isDisabled}
        className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-background px-4 py-3 text-sm font-semibold hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:py-2"
      >
        {pending ? "終了処理中…" : "完全に終了"}
      </button>
    </div>
  );
}
