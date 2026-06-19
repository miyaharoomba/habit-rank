"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle } from "lucide-react";

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
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:bg-secondary/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <MessageCircle className="h-4 w-4" aria-hidden="true" />
      {opening ? "開いています…" : "DMを送る"}
    </button>
  );
}
