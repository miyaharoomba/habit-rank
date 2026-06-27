"use client";

import { useId, useMemo, useState } from "react";

export type ReportChartItem = {
  label: string;
  caption: string;
  totalMs: number;
  xp: number;
  count: number;
};

const WIDTH = 720;
const HEIGHT = 260;
const LEFT = 58;
const RIGHT = 18;
const TOP = 18;
const BOTTOM = 38;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

function formatAxisDuration(ms: number) {
  const hours = ms / 3_600_000;
  if (hours >= 24) return `${Math.round(hours / 24)}日`;
  if (hours >= 1) return `${Math.round(hours)}時間`;
  return `${Math.round(ms / 60_000)}分`;
}

function selectedIndexes(length: number) {
  if (length <= 8) return new Set(Array.from({ length }, (_, index) => index));
  return new Set([0, 7, 14, 21, length - 1]);
}

export default function ReportLineChart({
  items,
}: {
  items: ReportChartItem[];
}) {
  const gradientId = useId().replace(/:/g, "");
  const initialIndex = Math.max(
    0,
    items.reduce((latest, item, index) => (item.totalMs > 0 ? index : latest), 0)
  );
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const safeActiveIndex = Math.min(activeIndex, Math.max(0, items.length - 1));
  const active = items[safeActiveIndex] ?? items[0];
  const maxValue = Math.max(1, ...items.map((item) => item.totalMs));
  const xLabels = useMemo(() => selectedIndexes(items.length), [items.length]);
  const points = items.map((item, index) => {
    const x =
      items.length === 1
        ? LEFT + PLOT_WIDTH / 2
        : LEFT + (index / (items.length - 1)) * PLOT_WIDTH;
    const y = TOP + PLOT_HEIGHT - (item.totalMs / maxValue) * PLOT_HEIGHT;
    return { x, y };
  });
  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const areaPath = points.length
    ? `${linePath} L${points[points.length - 1].x},${TOP + PLOT_HEIGHT} L${
        points[0].x
      },${TOP + PLOT_HEIGHT} Z`
    : "";

  if (!active || points.length === 0) return null;

  const activePoint = points[safeActiveIndex];

  return (
    <div>
      <div className="mb-3 flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-background/60 px-4 py-3">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">
            {active.caption}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums">
            {formatDuration(active.totalMs)}
          </div>
        </div>
        <div className="text-right text-xs leading-5 text-muted-foreground">
          <div>{active.count}回終了</div>
          <div>{active.xp.toLocaleString("ja-JP", { maximumFractionDigits: 1 })} XP</div>
        </div>
      </div>

      <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <svg
          aria-label="日ごとの継続時間の推移"
          className="h-full w-full overflow-visible"
          role="img"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.24" />
              <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((step) => {
            const ratio = step / 3;
            const y = TOP + PLOT_HEIGHT - ratio * PLOT_HEIGHT;
            return (
              <g key={step}>
                <line
                  stroke="hsl(var(--border))"
                  strokeDasharray="4 5"
                  x1={LEFT}
                  x2={WIDTH - RIGHT}
                  y1={y}
                  y2={y}
                />
                <text
                  fill="hsl(var(--muted-foreground))"
                  fontSize="10"
                  textAnchor="end"
                  x={LEFT - 9}
                  y={y + 4}
                >
                  {formatAxisDuration(maxValue * ratio)}
                </text>
              </g>
            );
          })}

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke="hsl(var(--primary))"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <line
            stroke="hsl(var(--primary))"
            strokeDasharray="3 4"
            strokeOpacity="0.55"
            x1={activePoint.x}
            x2={activePoint.x}
            y1={TOP}
            y2={TOP + PLOT_HEIGHT}
          />

          {points.map((point, index) => (
            <circle
              key={items[index].caption}
              cx={point.x}
              cy={point.y}
              fill={index === safeActiveIndex ? "hsl(var(--primary))" : "hsl(var(--card))"}
              r={index === safeActiveIndex ? 5 : 3.5}
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
          ))}

          {items.map((item, index) =>
            xLabels.has(index) ? (
              <text
                key={item.caption}
                fill="hsl(var(--muted-foreground))"
                fontSize="10"
                textAnchor={index === 0 ? "start" : index === items.length - 1 ? "end" : "middle"}
                x={points[index].x}
                y={HEIGHT - 10}
              >
                {item.label}
              </text>
            ) : null
          )}
        </svg>

        {points.map((point, index) => (
          <button
            key={items[index].caption}
            aria-label={`${items[index].caption}: ${formatDuration(items[index].totalMs)}`}
            className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setActiveIndex(index)}
            onFocus={() => setActiveIndex(index)}
            onMouseEnter={() => setActiveIndex(index)}
            style={{
              left: `${(point.x / WIDTH) * 100}%`,
              top: `${(point.y / HEIGHT) * 100}%`,
            }}
            type="button"
          />
        ))}
      </div>
    </div>
  );
}
