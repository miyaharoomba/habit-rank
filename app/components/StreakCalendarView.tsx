import Link from "next/link";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
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

function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "未終了";

  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
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

  const monthTotal = Object.values(grouped).reduce(
    (sum, rows) => sum + rows.length,
    0
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ヘッダー */}
      <header className="space-y-2">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">
          {title}
        </h1>

        <p className="text-sm sm:text-base text-muted-foreground">
          {description}
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {topLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary/40"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </header>

      {/* カレンダー */}
      <Card>
        <CardHeader>
          <div className="px-3 py-3 sm:px-5 sm:py-4">
            <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 sm:grid-cols-[96px_1fr_96px]">
              <Link
                href={buildHref(basePath, ym(prev.year, prev.month))}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2 text-sm font-semibold hover:bg-secondary/40"
              >
                ← 前
              </Link>

              <div className="flex flex-col items-center justify-center">
                <div className="text-center text-lg sm:text-2xl font-bold tabular-nums">
                  {year}年 {month}月
                </div>
                <div className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                  今月の終了回数:{" "}
                  <span className="font-semibold text-foreground tabular-nums">
                    {monthTotal}
                  </span>
                </div>
              </div>

              <Link
                href={buildHref(basePath, ym(next.year, next.month))}
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2 text-sm font-semibold hover:bg-secondary/40"
              >
                次 →
              </Link>
            </div>
          </div>
        </CardHeader>

        <CardBody>
          <div className="px-3 pb-3 sm:px-5 sm:pb-5">
            {/* エクセル風グリッド */}
            <div className="overflow-hidden rounded-xl border border-border">
              {/* 曜日行 */}
              <div className="grid grid-cols-7 bg-background/70">
                {weekdays.map((w, idx) => (
                  <div
                    key={w}
                    className={[
                      "py-2 text-center text-[11px] sm:text-xs font-semibold text-muted-foreground",
                      idx !== 6 ? "border-r border-border" : "",
                    ].join(" ")}
                  >
                    {w}
                  </div>
                ))}
              </div>

              {/* 日付グリッド */}
              <div className="grid grid-cols-7 border-t border-border">
                {cells.map((cell, idx) => {
                  const isLastCol = idx % 7 === 6;

                  if (!cell.date) {
                    return (
                      <div
                        key={`blank-${idx}`}
                        className={[
                          "aspect-square bg-background/30",
                          !isLastCol ? "border-r border-border" : "",
                          "border-b border-border",
                        ].join(" ")}
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
                        "relative aspect-square p-1.5 sm:p-2 transition",
                        !isLastCol ? "border-r border-border" : "",
                        "border-b border-border",
                        isSelected
                          ? "bg-primary/10"
                          : isToday
                          ? "bg-secondary/30"
                          : "bg-background hover:bg-secondary/20",
                      ].join(" ")}
                    >
                      {/* 今日の枠 */}
                      {isToday && !isSelected ? (
                        <div className="pointer-events-none absolute inset-1 rounded-sm border border-primary/60" />
                      ) : null}

                      {/* 選択日の枠 */}
                      {isSelected ? (
                        <div className="pointer-events-none absolute inset-0 border-2 border-primary" />
                      ) : null}

                      {/* 日付 */}
                      <div className="relative z-10 text-sm sm:text-lg font-bold tabular-nums leading-none">
                        {cell.date.getDate()}
                      </div>

                      {/* 件数 */}
                      {items.length > 0 ? (
                        <div className="absolute right-1 top-1 z-10 rounded bg-primary/10 px-1 py-[1px] text-[9px] sm:text-[10px] font-semibold text-primary leading-none">
                          {items.length}
                        </div>
                      ) : null}

                      {/* 下部ライン */}
                      <div className="absolute left-1.5 right-1.5 bottom-1.5 z-10">
                        {items.length > 0 ? (
                          <div className="h-[3px] rounded-full bg-primary/80" />
                        ) : (
                          <div className="h-[3px] w-full bg-transparent" />
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* 詳細 */}
      <Card>
        <CardHeader>
          <div className="px-3 py-3 sm:px-5 sm:py-4">
            <h2 className="text-base sm:text-lg font-bold tracking-tight">
              {selectedDay
                ? `${selectedDay.replaceAll("-", "/")} の終了履歴`
                : "終了履歴"}
            </h2>
          </div>
        </CardHeader>

        <CardBody>
          <div className="space-y-3 px-3 pb-3 sm:px-5 sm:pb-5">
            {!selectedDay || selectedSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                カレンダーの終了日を押すと、その日の結果一覧を表示できます。
              </p>
            ) : (
              <ul className="space-y-2.5">
                {selectedSessions.map((row) => (
                  <li key={String(row.id)}>
                    <Link
                      href={`/results/${row.id}`}
                      className="block rounded-xl border border-border bg-background/50 px-3 py-3 hover:bg-secondary/30 transition"
                    >
                      <div className="text-sm font-semibold">
                        継続時間: {formatDuration(row.started_at, row.ended_at)}
                      </div>

                      <div className="mt-2 text-xs text-muted-foreground break-words">
                        開始: {formatJst(row.started_at)}
                      </div>

                      <div className="mt-1 text-xs text-muted-foreground break-words">
                        終了: {row.ended_at ? formatJst(row.ended_at) : "-"}
                      </div>

                      <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                        理由: {(row.end_reason ?? "").trim() || "記録なし"}
                      </div>

                      <div className="mt-2 text-[11px] text-primary font-semibold">
                        結果を見る →
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
``