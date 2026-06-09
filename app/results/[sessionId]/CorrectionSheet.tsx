"use client";

import { useMemo, useState } from "react";
import {
  adjustSessionAction,
  mergeSessionAction,
  splitSessionAction,
} from "./actions";

type SessionLite = {
  id: number;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

function toLocalInputValue(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

function helperText(mode: "adjust" | "merge" | "split") {
  if (mode === "adjust") {
    return "終了時刻や終了理由だけを直したいときに使います。数分の止め忘れ補正に向いています。";
  }
  if (mode === "merge") {
    return "誤って終了 → すぐ再開してしまった場合に、次の継続と1本につなぎ直します。継続回数も1回分戻ります。";
  }
  return "本当は途中で終わっていた / 再開していた場合に、1本の記録を2本へ分割します。継続回数も正しい形に補正されます。";
}

export default function CorrectionSheet({
  session,
  initialOpen = false,
}: {
  session: SessionLite;
  initialOpen?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen);
  const [mode, setMode] = useState<"adjust" | "merge" | "split">("adjust");

  const defaultEndedAt = useMemo(
    () => toLocalInputValue(session.ended_at),
    [session.ended_at]
  );
  const defaultStartedAt = useMemo(
    () => toLocalInputValue(session.started_at),
    [session.started_at]
  );

  return (
    <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">継続記録を補正</div>
          <div className="mt-1 text-xs text-muted-foreground">
            誤って終了した / 終了し忘れた / 理由だけ直したい場合に使います。
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
        >
          {open ? "閉じる" : "記録を補正"}
        </button>
      </div>

      {open ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMode("adjust")}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                mode === "adjust"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-secondary/40",
              ].join(" ")}
            >
              軽微修正
            </button>
            <button
              type="button"
              onClick={() => setMode("merge")}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                mode === "merge"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-secondary/40",
              ].join(" ")}
            >
              誤終了を結合
            </button>
            <button
              type="button"
              onClick={() => setMode("split")}
              className={[
                "rounded-lg border px-3 py-2 text-sm font-semibold",
                mode === "split"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background hover:bg-secondary/40",
              ].join(" ")}
            >
              終了し忘れで分割
            </button>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 px-4 py-3 text-xs text-muted-foreground">
            {helperText(mode)}
          </div>

          {mode === "adjust" ? (
            <form action={adjustSessionAction} className="grid gap-3">
              <input type="hidden" name="session_id" value={String(session.id)} />

              <div>
                <label className="block text-sm font-medium mb-1">終了時刻</label>
                <input
                  type="datetime-local"
                  name="new_ended_at"
                  defaultValue={defaultEndedAt}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">終了理由</label>
                <textarea
                  name="new_end_reason"
                  defaultValue={session.end_reason ?? ""}
                  rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">補正理由（内部ログ用）</label>
                <input
                  type="text"
                  name="edit_reason"
                  defaultValue="止め忘れ / 理由修正"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  保存する
                </button>
              </div>
            </form>
          ) : null}

          {mode === "merge" ? (
            <form action={mergeSessionAction} className="grid gap-3">
              <input type="hidden" name="session_id" value={String(session.id)} />

              <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 px-4 py-3 text-sm text-amber-900">
                この結果をなかったことにして、次の継続履歴へつなげます。
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">補正理由（内部ログ用）</label>
                <input
                  type="text"
                  name="edit_reason"
                  defaultValue="誤って終了したため次の継続と結合"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  結合して補正する
                </button>
              </div>
            </form>
          ) : null}

          {mode === "split" ? (
            <form action={splitSessionAction} className="grid gap-3">
              <input type="hidden" name="session_id" value={String(session.id)} />

              <div>
                <label className="block text-sm font-medium mb-1">本来の終了時刻</label>
                <input
                  type="datetime-local"
                  name="actual_ended_at"
                  defaultValue={defaultEndedAt || defaultStartedAt}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">再開時刻</label>
                <input
                  type="datetime-local"
                  name="resumed_at"
                  defaultValue={defaultEndedAt || defaultStartedAt}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">前半の終了理由</label>
                <input
                  type="text"
                  name="first_end_reason"
                  defaultValue={session.end_reason ?? "finished"}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">後半の終了理由</label>
                <input
                  type="text"
                  name="second_end_reason"
                  defaultValue={session.end_reason ?? "finished"}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">補正理由（内部ログ用）</label>
                <input
                  type="text"
                  name="edit_reason"
                  defaultValue="終了し忘れのためセッションを分割"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  分割して補正する
                </button>
              </div>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
