"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
        <label className="text-sm font-medium text-foreground">検索（名前）</label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="例：haruto"
          className="mt-1 w-full sm:w-64 rounded-lg bg-background border border-input px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
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
                className="rounded-xl border border-border bg-background/60 px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <Link href={href} className="shrink-0">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={p.display_name || "avatar"}
                        className="h-12 w-12 rounded-full object-cover border border-border"
                      />
                    ) : (
                      <div className="h-12 w-12 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-base font-bold text-muted-foreground">
                        {(p.display_name ?? "?").trim().slice(0, 1) || "?"}
                      </div>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={href}
                        className="text-sm font-semibold hover:underline break-all"
                      >
                        {p.display_name || "NoName"}
                      </Link>

                      <TitleBadge
                        label={p.title_label}
                        rank={p.title_rank}
                        compact
                      />

                      {p.is_active ? (
                        <span className="inline-flex rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
                          継続中
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 text-xs text-muted-foreground">
                      参加: {new Date(p.created_at).toLocaleDateString()}
                    </div>

                    {p.is_active ? (
                      <div className="mt-1 text-xs text-muted-foreground">
                        継続中（{formatTime(p.current_seconds)}）
                      </div>
                    ) : null}

                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        href={href}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        プロフィールを見る
                      </Link>

                      <Link
                        href={`/dm?userId=${encodeURIComponent(p.user_id)}`}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        メッセージ
                      </Link>
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