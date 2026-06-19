"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function OpenProfileDmButton({
  targetUserId,
}: {
  targetUserId: string;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);

  const openDm = async () => {
    if (opening) return;
    setOpening(true);

    try {
      const res = await fetch("/api/dm/open", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ targetUserId }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        threadId?: unknown;
        error?: unknown;
      };
      const threadId = typeof json.threadId === "string" ? json.threadId : "";

      if (!res.ok || !threadId) {
        const message =
          typeof json.error === "string"
            ? json.error
            : "DMスレッドを開けませんでした。";
        throw new Error(message);
      }

      router.push(`/dm/${threadId}`);
    } catch (error: unknown) {
      alert(errorMessage(error, "DMスレッドを開けませんでした。"));
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openDm}
      disabled={opening}
      className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {opening ? "開いています…" : "DMを送る"}
    </button>
  );
}
