import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { formatJst } from "@/lib/time";

export type CalendarSession = {
  id: string | number;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

type TopLink = {
  href: string;
  label: string;
};

type StreakCalendarViewProps = {
  title: string;
  description: string;
  topLinks: TopLink[];
  basePath: string;
  year: number;
  month: number;
  grouped: Record<string, CalendarSession[]>;
  selectedDay: string | null;
  selectedSessions: CalendarSession[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ym(year: number, month: number) {
  return `${year}-${pad2(month)}`;
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate()
  )}`;
}

function prevMonth(year: number, month: number) {
  const d = new Date(year, month - 2, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function nextMonth(year: number, month: number) {
  const d = new Date(year, month, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

function jstDayKey(value: string) {
  const d = new Date(value);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
}

function durationSeconds(startedAt: string, endedAt: string | null) {
  if (!endedAt) return 0;
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

function formatDurationFromSeconds(totalSeconds: number) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function formatDuration(startedAt: string, endedAt: string | null) {
  return formatDurationFromSeconds(durationSeconds(startedAt, endedAt));
}

function buildCalendarCells(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells: Array<{ date: Date | null }> = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(year, month - 1, day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null });
  }

  return cells;
}

function buildHref(basePath: string, monthKey: string, dayKey?: string) {
  const q = new URLSearchParams();
  q.set("month", monthKey);
  if (dayKey) q.set("day", dayKey);
  return `${basePath}?${q.toString()}`;
}

export default function StreakCalendarView({
  title,
  description,
  topLinks,
  basePath,
  year,
  month,
  grouped,
  selectedDay,
  selectedSessions,
}: StreakCalendarViewProps) {
  const cells = buildCalendarCells(year, month);
  const todayKey = jstDayKey(new Date().toISOString());
  const prev = prevMonth(year, month);
  const next = nextMonth(year, month);

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const monthRows = Object.values(grouped).flat();
  const monthTotalCount = monthRows.length;
  const monthTotalSeconds = monthRows.reduce(
    (sum, row) => sum + durationSeconds(row.started_at, row.ended_at),
    0
  );

  return (
    <div className="space-y-7 sm:space-y-9">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <nav className="flex shrink-0 flex-wrap gap-2" aria-label="関連ページ">
          {topLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:bg-secondary/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>

      <section aria-labelledby="calendar-month-title">
        <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 border-y border-border py-4 sm:grid-cols-[48px_1fr_48px] sm:py-5">
          <Link
            href={buildHref(basePath, ym(prev.year, prev.month))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary/40 sm:h-12 sm:w-12"
            aria-label="前の月"
            title="前の月"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="min-w-0 text-center">
            <h2
              id="calendar-month-title"
              className="text-xl font-bold tabular-nums sm:text-2xl"
            >
              {year}年 {month}月
            </h2>
            <div className="mt-1 flex flex-col items-center justify-center text-xs text-muted-foreground sm:flex-row sm:gap-x-2">
              <span>
                <strong className="font-semibold text-foreground tabular-nums">
                  {monthTotalCount}
                </strong>{" "}
                件
              </span>
              <span aria-hidden="true" className="hidden sm:inline">·</span>
              <span className="mt-0.5 max-w-full font-medium text-foreground sm:mt-0">
                {formatDurationFromSeconds(monthTotalSeconds)}
              </span>
            </div>
          </div>

          <Link
            href={buildHref(basePath, ym(next.year, next.month))}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-background transition hover:bg-secondary/40 sm:h-12 sm:w-12"
            aria-label="次の月"
            title="次の月"
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-4 overflow-hidden border-y border-border">
          <div className="grid grid-cols-7 border-b border-border bg-secondary/20">
            {weekdays.map((weekday, index) => (
              <div
                key={weekday}
                className={[
                  "py-2.5 text-center text-[11px] font-semibold text-muted-foreground sm:text-xs",
                  index !== 6 ? "border-r border-border" : "",
                ].join(" ")}
              >
                {weekday}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell, index) => {
              const isLastColumn = index % 7 === 6;
              const isLastRow = index >= cells.length - 7;
              const dividers = [
                !isLastColumn ? "border-r border-border" : "",
                !isLastRow ? "border-b border-border" : "",
              ].join(" ");

              if (!cell.date) {
                return (
                  <div
                    key={`blank-${index}`}
                    className={`aspect-square bg-secondary/10 sm:aspect-auto sm:h-24 ${dividers}`}
                  />
                );
              }

              const key = ymd(cell.date);
              const items = grouped[key] ?? [];
              const isToday = key === todayKey;
              const isSelected = key === selectedDay;

              return (
                <Link
                  key={key}
                  href={buildHref(basePath, ym(year, month), key)}
                  className={[
                    "relative aspect-square p-2 transition sm:aspect-auto sm:h-24 sm:p-3",
                    dividers,
                    isSelected
                      ? "bg-primary/10 ring-2 ring-inset ring-primary"
                      : isToday
                        ? "bg-secondary/30"
                        : "bg-background hover:bg-secondary/20",
                  ].join(" ")}
                  aria-label={`${key}${items.length > 0 ? `、終了${items.length}件` : ""}`}
                >
                  <span
                    className={[
                      "relative z-10 inline-flex h-6 min-w-6 items-center justify-center text-sm font-bold leading-none tabular-nums sm:text-base",
                      isToday ? "rounded-full bg-primary text-primary-foreground" : "",
                    ].join(" ")}
                  >
                    {cell.date.getDate()}
                  </span>

                  {items.length > 0 ? (
                    <>
                      <span className="absolute right-1.5 top-1.5 text-[10px] font-bold text-primary tabular-nums sm:right-2 sm:top-2">
                        {items.length}
                      </span>
                      <span className="absolute bottom-2 left-2 right-2 h-1 rounded-full bg-primary sm:bottom-3 sm:left-3 sm:right-3" />
                    </>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-border pt-6" aria-labelledby="selected-day-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-muted-foreground">選択した日</div>
            <h2 id="selected-day-title" className="mt-1 text-lg font-bold tracking-tight sm:text-xl">
              {selectedDay ? selectedDay.replaceAll("-", "/") : "終了履歴"}
            </h2>
          </div>
          {selectedDay ? (
            <div className="text-sm font-semibold tabular-nums">
              {selectedSessions.length}件
            </div>
          ) : null}
        </div>

        {!selectedDay || selectedSessions.length === 0 ? (
          <p className="mt-4 border-y border-border py-8 text-sm text-muted-foreground">
            終了記録がある日を選ぶと、ここに結果が表示されます。
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border border-y border-border">
            {selectedSessions.map((row) => (
              <li key={String(row.id)}>
                <Link
                  href={`/results/${row.id}`}
                  className="block px-1 py-4 transition hover:bg-secondary/20 sm:px-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-muted-foreground">継続時間</div>
                      <div className="mt-1 text-lg font-bold tabular-nums">
                        {formatDuration(row.started_at, row.ended_at)}
                      </div>
                    </div>
                    <ArrowRight className="mt-2 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  </div>

                  <div className="mt-3 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2 sm:gap-4">
                    <div className="break-words">開始: {formatJst(row.started_at)}</div>
                    <div className="break-words">
                      終了: {row.ended_at ? formatJst(row.ended_at) : "-"}
                    </div>
                  </div>

                  <p className="mt-3 border-l-2 border-primary/50 pl-3 text-sm leading-6 text-muted-foreground whitespace-pre-wrap break-words">
                    {(row.end_reason ?? "").trim() || "終了理由の記録なし"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
