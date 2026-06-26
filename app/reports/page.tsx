import Link from "next/link";
import { redirect } from "next/navigation";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import {
  CalendarLink,
  HistoryLink,
  MainLink,
  PageHeader,
  RankingLink,
} from "@/app/components/AppPageHeader";
import { formatXp, streakSessionXp } from "@/app/lib/leveling";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type SearchParams = {
  week?: string | string[];
  month?: string | string[];
};

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string;
  end_reason: string | null;
};

type ReportSession = SessionRow & {
  durationMs: number;
  xp: number;
};

type ReportSummary = {
  sessions: ReportSession[];
  totalMs: number;
  totalXp: number;
  longest: ReportSession | null;
};

type BreakdownItem = {
  label: string;
  caption: string;
  totalMs: number;
  xp: number;
  count: number;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function jstMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day) - JST_OFFSET_MS);
}

function jstParts(value: Date) {
  const shifted = new Date(value.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    weekday: shifted.getUTCDay(),
  };
}

function parseJstDay(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = jstMidnight(year, month, day);
  const parts = jstParts(date);

  if (parts.year !== year || parts.month !== month || parts.day !== day) {
    return null;
  }

  return date;
}

function parseJstMonth(value: string | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;

  return jstMidnight(year, month, 1);
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function startOfJstWeek(value: Date) {
  const parts = jstParts(value);
  const daysFromMonday = (parts.weekday + 6) % 7;
  return jstMidnight(parts.year, parts.month, parts.day - daysFromMonday);
}

function startOfJstMonth(value: Date) {
  const parts = jstParts(value);
  return jstMidnight(parts.year, parts.month, 1);
}

function endOfJstMonth(value: Date) {
  const parts = jstParts(value);
  return jstMidnight(parts.year, parts.month + 1, 1);
}

function ymd(value: Date) {
  const parts = jstParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(
    parts.day
  ).padStart(2, "0")}`;
}

function ym(value: Date) {
  const parts = jstParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

function formatJstDate(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(value);
}

function formatJstMonth(value: Date) {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
  }).format(value);
}

function formatPeriod(start: Date, endExclusive: Date) {
  return `${formatJstDate(start)} - ${formatJstDate(
    new Date(endExclusive.getTime() - 1)
  )}`;
}

function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

function durationMs(row: SessionRow) {
  const started = new Date(row.started_at).getTime();
  const ended = new Date(row.ended_at).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(ended)) return 0;
  return Math.max(0, ended - started);
}

function enrich(row: SessionRow): ReportSession {
  return {
    ...row,
    durationMs: durationMs(row),
    xp: streakSessionXp(row.started_at, row.ended_at),
  };
}

function summarize(
  sessions: ReportSession[],
  start: Date,
  endExclusive: Date
): ReportSummary {
  const rows = sessions.filter((row) => {
    const ended = new Date(row.ended_at).getTime();
    return ended >= start.getTime() && ended < endExclusive.getTime();
  });

  const totalMs = rows.reduce((sum, row) => sum + row.durationMs, 0);
  const totalXp = rows.reduce((sum, row) => sum + row.xp, 0);
  const longest = rows.reduce<ReportSession | null>((best, row) => {
    if (!best || row.durationMs > best.durationMs) return row;
    return best;
  }, null);

  return { sessions: rows, totalMs, totalXp, longest };
}

function buildDayBreakdown(
  sessions: ReportSession[],
  start: Date,
  days: number
): BreakdownItem[] {
  return Array.from({ length: days }, (_, index) => {
    const dayStart = addDays(start, index);
    const dayEnd = addDays(dayStart, 1);
    const rows = sessions.filter((row) => {
      const ended = new Date(row.ended_at).getTime();
      return ended >= dayStart.getTime() && ended < dayEnd.getTime();
    });

    return {
      label: new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        weekday: "short",
      }).format(dayStart),
      caption: formatJstDate(dayStart),
      totalMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
      xp: rows.reduce((sum, row) => sum + row.xp, 0),
      count: rows.length,
    };
  });
}

function buildMonthBreakdown(
  sessions: ReportSession[],
  monthStart: Date,
  monthEnd: Date
): BreakdownItem[] {
  const blocks: BreakdownItem[] = [];
  let cursor = monthStart;

  while (cursor.getTime() < monthEnd.getTime()) {
    const next = new Date(Math.min(addDays(cursor, 7).getTime(), monthEnd.getTime()));
    const rows = sessions.filter((row) => {
      const ended = new Date(row.ended_at).getTime();
      return ended >= cursor.getTime() && ended < next.getTime();
    });
    const startParts = jstParts(cursor);
    const endParts = jstParts(new Date(next.getTime() - 1));

    blocks.push({
      label:
        startParts.day === endParts.day
          ? `${startParts.day}日`
          : `${startParts.day}-${endParts.day}日`,
      caption: `${formatJstDate(cursor)} - ${formatJstDate(
        new Date(next.getTime() - 1)
      )}`,
      totalMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
      xp: rows.reduce((sum, row) => sum + row.xp, 0),
      count: rows.length,
    });

    cursor = next;
  }

  return blocks;
}

function rangeHref({
  weekStart,
  monthStart,
}: {
  weekStart: Date;
  monthStart: Date;
}) {
  return `/reports?week=${ymd(weekStart)}&month=${ym(monthStart)}`;
}

function Metric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-4 py-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-bold tabular-nums tracking-tight">
        {value}
      </div>
      {helper ? (
        <div className="mt-1 text-xs text-muted-foreground">{helper}</div>
      ) : null}
    </div>
  );
}

function PeriodNav({
  title,
  subtitle,
  previousHref,
  nextHref,
}: {
  title: string;
  subtitle: string;
  previousHref: string;
  nextHref: string;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Link
          href={previousHref}
          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary/40"
        >
          前へ
        </Link>
        <Link
          href={nextHref}
          className="inline-flex h-9 items-center rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary/40"
        >
          次へ
        </Link>
      </div>
    </div>
  );
}

function Breakdown({ items }: { items: BreakdownItem[] }) {
  const maxMs = Math.max(1, ...items.map((item) => item.totalMs));

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const ratio = item.totalMs / maxMs;
        const width =
          item.totalMs > 0 ? Math.max(4, Math.round(ratio * 100)) : 0;

        return (
          <div key={item.caption} className="grid gap-2 sm:grid-cols-[6.5rem_1fr_9rem] sm:items-center">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{item.label}</div>
              <div className="text-[11px] text-muted-foreground">{item.caption}</div>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-secondary/50">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${width}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground sm:text-right">
              <span className="font-semibold text-foreground">
                {formatDuration(item.totalMs)}
              </span>{" "}
              / {item.count}回 / {formatXp(item.xp)} XP
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecentSessions({ sessions }: { sessions: ReportSession[] }) {
  const rows = [...sessions]
    .sort(
      (a, b) =>
        new Date(b.ended_at).getTime() - new Date(a.ended_at).getTime()
    )
    .slice(0, 5);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
        この期間に終了した継続はまだありません。
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex flex-col gap-2 rounded-lg border border-border bg-background/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <div className="font-semibold tabular-nums">
              {formatDuration(row.durationMs)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              終了: {formatJst(row.ended_at)} / {formatXp(row.xp)} XP
            </div>
          </div>
          <Link
            href={`/results/${row.id}`}
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background px-3 text-sm font-semibold hover:bg-secondary/40"
          >
            結果を見る
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ReportCard({
  title,
  subtitle,
  previousHref,
  nextHref,
  summary,
  breakdown,
}: {
  title: string;
  subtitle: string;
  previousHref: string;
  nextHref: string;
  summary: ReportSummary;
  breakdown: BreakdownItem[];
}) {
  const average =
    summary.sessions.length > 0
      ? summary.totalMs / summary.sessions.length
      : 0;
  const longest = summary.longest;

  return (
    <Card>
      <CardHeader>
        <PeriodNav
          title={title}
          subtitle={subtitle}
          previousHref={previousHref}
          nextHref={nextHref}
        />
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="総継続時間" value={formatDuration(summary.totalMs)} />
          <Metric label="終了回数" value={`${summary.sessions.length}回`} />
          <Metric
            label="最長記録"
            value={longest ? formatDuration(longest.durationMs) : "0分"}
            helper={longest ? formatJst(longest.ended_at) : "記録なし"}
          />
          <Metric
            label="獲得XP"
            value={`${formatXp(summary.totalXp)} XP`}
            helper={`平均 ${formatDuration(average)} / 回`}
          />
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">内訳</h3>
              <span className="text-xs text-muted-foreground">
                終了日時ベース
              </span>
            </div>
            <Breakdown items={breakdown} />
          </section>

          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">最近の終了</h3>
              <span className="text-xs text-muted-foreground">最大5件</span>
            </div>
            <RecentSessions sessions={summary.sessions} />
          </section>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const selectedWeekDay = parseJstDay(firstParam(sp.week)) ?? now;
  const selectedMonth = parseJstMonth(firstParam(sp.month)) ?? now;
  const weekStart = startOfJstWeek(selectedWeekDay);
  const weekEnd = addDays(weekStart, 7);
  const monthStart = startOfJstMonth(selectedMonth);
  const monthEnd = endOfJstMonth(selectedMonth);
  const queryStart = new Date(
    Math.min(weekStart.getTime(), monthStart.getTime())
  );
  const queryEnd = new Date(Math.max(weekEnd.getTime(), monthEnd.getTime()));

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "NoName";

  const { data, error } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .gte("ended_at", queryStart.toISOString())
    .lt("ended_at", queryEnd.toISOString())
    .order("ended_at", { ascending: false });

  if (error) throw new Error(error.message);

  const sessions = ((data ?? []) as SessionRow[]).map(enrich);
  const weekSummary = summarize(sessions, weekStart, weekEnd);
  const monthSummary = summarize(sessions, monthStart, monthEnd);
  const weekBreakdown = buildDayBreakdown(sessions, weekStart, 7);
  const monthBreakdown = buildMonthBreakdown(sessions, monthStart, monthEnd);

  return (
    <Container>
      <PageHeader
        title="レポート"
        description={`${displayName} の週間・月間の継続状況をまとめます。`}
        actions={
          <>
            <MainLink />
            <HistoryLink />
            <CalendarLink />
            <RankingLink />
          </>
        }
      />

      <div className="mt-6 grid gap-5">
        <ReportCard
          title="週間レポート"
          subtitle={formatPeriod(weekStart, weekEnd)}
          previousHref={rangeHref({
            weekStart: addDays(weekStart, -7),
            monthStart,
          })}
          nextHref={rangeHref({
            weekStart: addDays(weekStart, 7),
            monthStart,
          })}
          summary={weekSummary}
          breakdown={weekBreakdown}
        />

        <ReportCard
          title="月間レポート"
          subtitle={formatJstMonth(monthStart)}
          previousHref={rangeHref({
            weekStart,
            monthStart: jstMidnight(
              jstParts(monthStart).year,
              jstParts(monthStart).month - 1,
              1
            ),
          })}
          nextHref={rangeHref({
            weekStart,
            monthStart: jstMidnight(
              jstParts(monthStart).year,
              jstParts(monthStart).month + 1,
              1
            ),
          })}
          summary={monthSummary}
          breakdown={monthBreakdown}
        />
      </div>
    </Container>
  );
}
