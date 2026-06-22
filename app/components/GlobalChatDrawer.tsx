"use client";

import { useEffect, useId, useState } from "react";
import { MessageSquareText, X } from "lucide-react";
import GlobalChatBoard from "@/app/components/GlobalChatBoard";

export default function GlobalChatDrawer({
  myUserId,
}: {
  myUserId: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKey);

    const originalOverflow = document.body.style.overflow;
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = originalOverflow || "";
    }

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = originalOverflow || "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        aria-controls={panelId}
        aria-expanded={open}
        aria-label="掲示板を開く"
        title="掲示板"
      >
        <MessageSquareText className="h-5 w-5" aria-hidden="true" />
      </button>

      {open ? (
        <button
          type="button"
          aria-label="掲示板を閉じる"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[80] bg-black/45"
        />
      ) : null}

      <aside
        id={panelId}
        className={[
          "fixed left-0 top-0 z-[90] h-[100dvh] w-[min(30rem,calc(100vw-1rem))] max-w-[calc(100vw-1rem)]",
          "border-r border-border bg-background shadow-2xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "pointer-events-none -translate-x-full",
        ].join(" ")}
        aria-hidden={!open}
      >
        <div className="flex h-full min-w-0 flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                public chat
              </div>
              <h2 className="truncate text-xl font-bold tracking-tight">
                掲示板
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                全員が読める公開チャット
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/90 shadow-md backdrop-blur transition hover:bg-secondary/50"
              aria-controls={panelId}
              aria-expanded={open}
              aria-label="掲示板を閉じる"
              title="閉じる"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="min-h-0 flex-1 px-3 py-3 sm:px-4">
            {open ? (
              <GlobalChatBoard
                myUserId={myUserId}
                limit={40}
                mode="drawer"
                hideHeader
              />
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
