import { normalizeLevel } from "@/app/lib/leveling";

export default function LevelBadge({
  level,
  compact = false,
  className = "",
}: {
  level: number | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  const lv = normalizeLevel(level);

  return (
    <span
      className={[
        "inline-flex shrink-0 items-center rounded-full border border-cyan-300/60 bg-cyan-50 px-2.5 py-1 font-semibold leading-none text-cyan-950 shadow-[0_0_0_1px_rgba(103,232,249,0.18),0_4px_14px_rgba(6,182,212,0.10)]",
        compact ? "text-[10px]" : "text-[11px]",
        className,
      ].join(" ")}
      title={`Level ${lv}`}
    >
      Lv {lv}
    </span>
  );
}
