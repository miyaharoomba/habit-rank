import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type SessionRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

type DayMapValue = {
  key: string;
  rows: SessionRow[];
};

function formatMonthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function parseMonthParam(raw: string | null | undefined) {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const fallbackYear = jstNow.getUTCFullYear();
  const fallbackMonth = jstNow.getUTCMonth() + 1;

  if (!raw) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  const year = Number(m[1]);
  const month = Number(m[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return { year: fallbackYear, month: fallbackMonth };
  }

  return { year, month };
}

function monthRangeJst(year: number, month: number) {
  // JST month start -> UTC に直す（JST-9h）
  const startUtc = new Date(Date.UTC(year, month - 1, 1, -9, 0, 0));
  const nextUtc = new Date(Date.UTC(year, month, 1, -9, 0, 0));
  return {
    startIso: startUtc.toISOString(),
    nextIso: nextUtc.toISOString(),
  };
}

function jstDateKey(iso: string) {
  const d = new Date(iso);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const day = jst.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return `${year}年 ${month}月`;
}

function getTodayJstKey() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getMonthMeta(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const firstWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  return { firstWeekday, daysInMonth };
}

function shiftMonth(year: number, month: number, delta: number) {
  const d = new Date(year, month - 1 + delta, 1);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
}

function formatDurationFromIso(startedAt: string, endedAt: string | null) {
  if (!endedAt) return "記録なし";
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  const sec = Math.max(0, Math.floor((end - start) / 1000));

  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;

  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分 ${seconds}秒`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const sp = await searchParams;
  const { year, month } = parseMonthParam(sp.month);
  const monthKey = formatMonthKey(year, month);

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  const { startIso, nextIso } = monthRangeJst(year, month);

  const { data: rows, error } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", user.id)
    .not("ended_at", "is", null)
    .gte("ended_at", startIso)
    .lt("ended_at", nextIso)
    .order("ended_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const sessions = (rows ?? []) as SessionRow[];

  const grouped = new Map<string, DayMapValue>();
  for (const row of sessions) {
    const key = jstDateKey(String(row.ended_at));
    const hit = grouped.get(key);
    if (hit) {
      hit.rows.push(row);
    } else {
      grouped.set(key, { key, rows: [row] });
    }
  }

  const { firstWeekday, daysInMonth } = getMonthMeta(year, month);
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const todayKey = getTodayJstKey();

  const requestedDay = sp.day && sp.day.startsWith(monthKey) ? sp.day : null;
  const selectedDay =
    requestedDay ||
    (todayKey.startsWith(monthKey) ? todayKey : null) ||
    Array.from(grouped.keys())[0] ||
    null;

  const selectedRows = selectedDay ? grouped.get(selectedDay)?.rows ?? [] : [];

  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <Container>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">カレンダー</h1>
          <p className="text-sm text-muted-foreground">
            継続が終了した日付を確認できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/app" className="text-primary hover:underline">
            /app
          </Link>
          <Link href="/history" className="text-primary hover:underline">
            /history
          </Link>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2 px-4 py-4">
              <Link
                href={`/calendar?month=${formatMonthKey(prev.year, prev.month)}`}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary/40 transition"
              >
                ← 前月
              </Link>

              <div className="text-lg font-bold tabular-nums">
                {monthLabel(year, month)}
              </div>

              <Link
                href={`/calendar?month=${formatMonthKey(next.year, next.month)}`}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-secondary/40 transition"
              >
                翌月 →
              </Link>
            </div>
          </CardHeader>

          <CardBody>
            <div className="px-4 pb-4">
              <div className="grid grid-cols-7 gap-2">
                {weekdays.map((w) => (
                  <div
                    key={w}
                    className="text-center text-xs font-semibold text-muted-foreground py-1"
                  >
                    {w}
                  </div>
                ))}

                {Array.from({ length: firstWeekday }).map((_, i) => (
                  <div key={`blank-${i}`} className="aspect-square" />
                ))}

                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const dayKey = `${monthKey}-${String(day).padStart(2, "0")}`;
                  const count = grouped.get(dayKey)?.rows.length ?? 0;
                  const isToday = dayKey === todayKey;
                  const isSelected = selectedDay === dayKey;

                  return (
                    <Link
                      key={dayKey}
                      href={`/calendar?month=${monthKey}&day=${dayKey}`}
                      className={[
                        "aspect-square rounded-xl border px-2 py-2 transition flex flex-col",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background/50 hover:bg-secondary/40",
                        isToday ? "ring-2 ring-primary/70" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-sm font-bold tabular-nums">{day}</div>
                        {count > 0 ? (
                          <div className="text-[10px] text-primary font-semibold">
                            {count}件
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-auto flex items-center gap-1">
                        {count > 0 ? (
                          <>
                            {Array.from({ length: Math.min(count, 3) }).map((__, dotIdx) => (
                              <span
                                key={`${dayKey}-dot-${dotIdx}`}
                                className="h-1.5 w-1.5 rounded-full bg-primary"
                              />
                            ))}
                            {count > 3 ? (
                              <span className="text-[10px] text-primary font-semibold">
                                +{count - 3}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60">-</span>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="px-4 py-4">
              <h2 className="text-lg font-bold tracking-tight">
                {selectedDay
                  ? `${selectedDay.replaceAll("-", "/")} の終了履歴`
                  : "終了履歴"}
              </h2>
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-3 px-4 pb-4">
              {!selectedDay ? (
                <p className="text-sm text-muted-foreground">
                  日付を選ぶと、その日の終了履歴を表示します。
                </p>
              ) : selectedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  この日は終了済み履歴がありません。
                </p>
              ) : (
                <ul className="space-y-3">
                  {selectedRows.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/results/${row.id}`}
                        className="block rounded-xl border border-border bg-secondary/30 px-4 py-4 hover:bg-secondary/40 transition"
                      >
                        <div className="text-sm font-semibold">
                          {formatDurationFromIso(row.started_at, row.ended_at)}
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
    </Container>
  );
}
