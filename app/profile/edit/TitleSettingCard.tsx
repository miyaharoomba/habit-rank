"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TitleBadge from "@/app/components/TitleBadge";

type TitleOption = {
  badge_id: string;
  title: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  unlocked_at: string;
};

export default function TitleSettingCard({
  currentTitleBadgeId,
  options,
}: {
  currentTitleBadgeId: string | null;
  options: TitleOption[];
}) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(currentTitleBadgeId);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentTitle = useMemo(() => {
    if (!activeId) return null;
    return options.find((x) => x.badge_id === activeId) ?? null;
  }, [activeId, options]);

  const setTitle = async (badgeId: string) => {
    if (savingId) return;

    setSavingId(badgeId);
    setError(null);

    try {
      const res = await fetch("/api/profile/title", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ badgeId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setActiveId(badgeId);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "称号設定に失敗しました。");
    } finally {
      setSavingId(null);
    }
  };

  const clearTitle = async () => {
    if (savingId) return;

    setSavingId("clear");
    setError(null);

    try {
      const res = await fetch("/api/profile/title", {
        method: "DELETE",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `HTTP ${res.status}`);
      }

      setActiveId(null);
      router.refresh();
    } catch (e: any) {
      setError(e?.message ?? "称号解除に失敗しました。");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-background/60 px-4 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold">称号設定</div>
          <div className="mt-1 text-xs text-muted-foreground">
            獲得済みトロフィーに紐づく称号を、プロフィールに表示できます。
          </div>
        </div>

        <button
          type="button"
          onClick={clearTitle}
          disabled={savingId === "clear" || activeId === null}
          className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:opacity-50"
        >
          {savingId === "clear" ? "解除中..." : "称号を外す"}
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-border bg-secondary/20 px-4 py-3">
        <div className="text-xs text-muted-foreground">現在の称号</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {currentTitle ? (
            <>
              <TitleBadge
                label={currentTitle.title_label}
                rank={currentTitle.badge_rank}
              />
              <span className="text-sm text-muted-foreground">
                元トロフィー: {currentTitle.title}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">未設定</span>
          )}
        </div>
      </div>

      {error ? (
        <div className="mt-3 text-sm text-destructive">{error}</div>
      ) : null}

      <div className="mt-4">
        <div className="text-xs text-muted-foreground">設定可能な称号</div>

        {options.length === 0 ? (
          <div className="mt-2 rounded-xl border border-border bg-background px-4 py-4 text-sm text-muted-foreground">
            まだ設定できる称号がありません。継続を重ねてトロフィーを獲得しよう。
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {options.map((item) => {
              const active = activeId === item.badge_id;
              const busy = savingId === item.badge_id;

              return (
                <li
                  key={`${item.badge_id}-${item.unlocked_at}`}
                  className="rounded-xl border border-border bg-background px-4 py-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TitleBadge
                          label={item.title_label}
                          rank={item.badge_rank}
                        />
                        <span className="text-sm font-semibold break-words">
                          {item.title}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        獲得済みの称号です
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTitle(item.badge_id)}
                      disabled={active || !!savingId}
                      className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:opacity-50"
                    >
                      {active
                        ? "現在設定中"
                        : busy
                        ? "設定中..."
                        : "この称号を使う"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
