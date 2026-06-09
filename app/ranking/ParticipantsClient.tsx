"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import TitleBadge from "@/app/components/TitleBadge";

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
  avatar_path?: string | null;
  title_label?: string | null;
  title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
};

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function profileHref(userId: string, myUserId: string) {
  return userId === myUserId ? "/profile" : `/users/${encodeURIComponent(userId)}`;
}

function MessageButton({ targetUserId }: { targetUserId: string }) {
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

      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.threadId) {
        throw new Error(json?.error ?? "DMスレッドを開けませんでした");
      }

      router.push(`/dm/${json.threadId}`);
    } catch (e: any) {
      alert(e?.message ?? "DMを開けませんでした");
    } finally {
      setOpening(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openDm}
      disabled={opening}
      className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40 disabled:opacity-50"
    >
      {opening ? "開いています…" : "メッセージ"}
    </button>
  );
}

export default function ParticipantsClient({
  participants,
  myUserId,
}: {
  participants: Participant[];
  myUserId: string;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return participants;
    return participants.filter((p) =>
      (p.display_name ?? "NoName").toLowerCase().includes(key)
    );
  }, [q, participants]);

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium">検索（名前）</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例：haruto"
          className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background sm:w-64"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
          条件に一致する参加者はいません。
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((p) => {
            const avatar = avatarUrl(p.avatar_path);
            const href = profileHref(p.user_id, myUserId);

            return (
              <li
                key={p.user_id}
                className="rounded-xl border border-border bg-background/60 p-4"
              >
                <div className="flex items-start gap-3">
                  <Link
                    href={href}
                    className="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
                  >
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={p.display_name || "avatar"}
                        className="h-12 w-12 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-secondary/40 text-base font-bold text-muted-foreground">
                        {(p.display_name ?? "?").trim().slice(0, 1) || "?"}
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-semibold break-words">
                        {p.display_name || "NoName"}
                      </div>

                      {p.title_label?.trim() ? (
                        <TitleBadge
                          label={p.title_label}
                          rank={p.title_rank ?? "bronze"}
                        />
                      ) : null}

                      {p.is_active ? (
                        <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                          継続中
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                      <div>参加: {new Date(p.created_at).toLocaleDateString()}</div>
                      {p.is_active ? (
                        <div>継続中（{formatTime(p.current_seconds)}）</div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={href}
                        className="inline-flex items-center rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40"
                      >
                        プロフィールを見る
                      </Link>

                      {p.user_id !== myUserId ? (
                        <MessageButton targetUserId={p.user_id} />
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
``