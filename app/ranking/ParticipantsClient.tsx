"use client";

import { useMemo, useState } from "react";

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
};

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

export default function ParticipantsClient({ participants }: { participants: Participant[] }) {
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
          className="w-full sm:w-64 rounded-lg bg-background border border-input px-3 py-2 text-foreground placeholder:text-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
        />
      </div>

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {filtered.map((p) => (
          <li key={p.user_id} className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="font-semibold truncate">{p.display_name || "NoName"}</div>
              {p.is_active && (
                <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary whitespace-nowrap">
                  継続中（{formatTime(p.current_seconds)}）
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              参加: {new Date(p.created_at).toLocaleDateString()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}