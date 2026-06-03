"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
  avatar_path?: string | null;
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

function profileHref(userId: string) {
  return `/users/${encodeURIComponent(userId)}`;
}

export default function ParticipantsClient({
  participants,
}: {
  participants: Participant[];
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
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-muted-foreground">検索（名前）</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例：haruto"
          className="w-full sm:w-64 rounded-lg bg-background border border-input px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        />
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((p) => {
          const avatar = avatarUrl(p.avatar_path);
          const href = profileHref(p.user_id);

          return (
            <li
              key={p.user_id}
              className="rounded-lg border border-border bg-secondary/40 px-4 py-3"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1 flex gap-3">
                  <Link href={href} className="shrink-0">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt="avatar"
                        className="h-12 w-12 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full border border-border bg-background/60 flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {(p.display_name ?? "?").trim().slice(0, 1) || "?"}
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={href}
                      className="block font-semibold text-lg leading-tight break-words sm:truncate hover:underline"
                    >
                      {p.display_name || "NoName"}
                    </Link>

                    {p.is_active && (
                      <div className="mt-2 sm:hidden">
                        <span className="inline-flex rounded-full bg-primary/15 px-2 py-1 text-xs font-semibold text-primary break-words">
                          継続中（{formatTime(p.current_seconds)}）
                        </span>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-muted-foreground">
                      参加: {new Date(p.created_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                {p.is_active && (
                  <div className="hidden sm:block shrink-0">
                    <span className="inline-flex rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary whitespace-nowrap tabular-nums">
                      継続中（{formatTime(p.current_seconds)}）
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <Link
                  href={href}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold border border-border bg-background hover:bg-secondary/40"
                >
                  プロフィールを見る
                </Link>

                <Link
                  href={`/dm/new?u=${encodeURIComponent(p.user_id)}`}
                  className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  メッセージ
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
