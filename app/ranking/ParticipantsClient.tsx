"use client";

import { useMemo, useState } from "react";

type Participant = {
  id: string;
  display_name: string | null;
  created_at: string;
};

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
          <li key={p.id} className="rounded-lg border border-border bg-secondary/40 px-4 py-3">
            <div className="font-semibold truncate">
              {p.display_name?.trim() ? p.display_name : "NoName"}
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
