type TitleRank = "platinum" | "gold" | "silver" | "bronze" | null | undefined;

function rankClass(rank: TitleRank) {
  switch (rank) {
    case "platinum":
      return "border-sky-300/70 bg-sky-50 text-sky-900";
    case "gold":
      return "border-amber-300/70 bg-amber-50 text-amber-900";
    case "silver":
      return "border-slate-300/70 bg-slate-50 text-slate-800";
    case "bronze":
      return "border-orange-300/70 bg-orange-50 text-orange-900";
    default:
      return "border-border bg-background text-foreground";
  }
}

function rankGlowClass(rank: TitleRank) {
  switch (rank) {
    case "platinum":
      return "shadow-[0_0_0_1px_rgba(125,211,252,0.18),0_4px_14px_rgba(56,189,248,0.14)]";
    case "gold":
      return "shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_4px_14px_rgba(245,158,11,0.14)]";
    case "silver":
      return "shadow-[0_0_0_1px_rgba(148,163,184,0.16),0_4px_14px_rgba(100,116,139,0.10)]";
    case "bronze":
      return "shadow-[0_0_0_1px_rgba(251,146,60,0.16),0_4px_14px_rgba(234,88,12,0.10)]";
    default:
      return "";
  }
}

function rankPrefix(rank: TitleRank) {
  switch (rank) {
    case "platinum":
      return "🏆";
    case "gold":
      return "🥇";
    case "silver":
      return "🥈";
    case "bronze":
      return "🥉";
    default:
      return "◆";
  }
}

export default function TitleBadge({
  label,
  rank,
  compact = false,
}: {
  label: string | null | undefined;
  rank?: TitleRank;
  compact?: boolean;
}) {
  const text = (label ?? "").trim();
  if (!text) return null;

  return (
    <span
      className={[
        "inline-flex max-w-full items-center gap-1 rounded-full border px-2.5 py-1 font-semibold leading-none",
        compact ? "text-[10px]" : "text-[11px]",
        rankClass(rank),
        rankGlowClass(rank),
      ].join(" ")}
      title={text}
    >
      <span className="shrink-0 opacity-90">{rankPrefix(rank)}</span>
      <span className="truncate">{text}</span>
    </span>
  );
}