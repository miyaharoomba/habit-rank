'use client';

import { useEffect, useMemo, useState } from 'react';

type Props = {
  startedAt: string | null;
};

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds };
}

export default function LiveTimer({ startedAt }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startedMs = useMemo(
    () => (startedAt ? Date.parse(startedAt) : null),
    [startedAt]
  );

  const diff = startedMs ? now - startedMs : 0;
  const { days, hours, minutes, seconds } = formatDuration(diff);
  const units = [
    { label: "日", value: String(days) },
    { label: "時間", value: String(hours).padStart(2, "0") },
    { label: "分", value: String(minutes).padStart(2, "0") },
    { label: "秒", value: String(seconds).padStart(2, "0") },
  ];

  return (
    <div
      className="w-full"
      aria-label={`${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`}
    >
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {units.map((unit) => (
          <div
            key={unit.label}
            className="min-w-0 rounded-lg border border-border bg-background px-2 py-3 text-center"
          >
            <div className="h-8 overflow-hidden font-mono text-2xl font-bold leading-8 tabular-nums sm:h-10 sm:text-4xl sm:leading-10">
              {unit.value}
            </div>
            <div className="mt-1 text-[11px] font-medium text-muted-foreground sm:text-xs">
              {unit.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
