import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type SessionRow = {
  id: string | number;
  started_at: string;
  ended_at: string | null;
  end_reason: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
};

function monthParamToDate(raw?: string) {
  if (!raw) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    return new Date(y, m, 1);
  }

  const m = raw.match(/^(\d{4})-(\d{2})$/);
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const year = Number(m[1]);
  const monthIndex = Number(m[2]) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  return new Date(year, monthIndex, 1);
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ym(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function prevMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
}

function nextMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function jstDayKey(value: string) {
  const d = new Date(value);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(jst.getUTCDate())}`;
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

function buildCalendarCells(baseMonth: Date) {
  const first = startOfMonth(baseMonth);
  const startWeekday = first.getDay(); // 0=Sun
  const daysInMonth = new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 0).getDate();

  const cells: Array<{ date: Date | null }> = [];

  for (let i = 0; i < startWeekday; i++) {
    cells.push({ date: null });
  }

  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({
      date: new Date(baseMonth.getFullYear(), baseMonth.getMonth(), day),
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ date: null });
  }

  return cells;
}

export default async function UserCalendarPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ month?: string; day?: string }>;
}) {
  const { userId } = await params;
  const sp = await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  // 自分のIDなら自分のカレンダーへ寄せる
  if (userId === user.id) {
    const query = new URLSearchParams();
    if (sp.month) query.set("month", sp.month);
    if (sp.day) query.set("day", sp.day);
    const suffix = query.toString() ? `?${query.toString()}` : "";
    redirect(`/calendar${suffix}`);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    throw new Error(profileErr.message);
  }

  if (!profile) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">カレンダー</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">
              ユーザーが見つかりません。
            </p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/participants">
                /participants
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/app">
                /app
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const monthDate = monthParamToDate(sp.month);
  const monthStart = startOfMonth(monthDate);
  const monthEnd = endOfMonth(monthDate);

  const { data: sessions, error: sessErr } = await supabase
    .from("streak_sessions")
    .select("id, started_at, ended_at, end_reason")
    .eq("user_id", userId)
    .not("ended_at", "is", null)
    .gte("ended_at", monthStart.toISOString())
    .lt("ended_at", monthEnd.toISOString())
    .order("ended_at", { ascending: false });

  if (sessErr) {
    throw new Error(sessErr.message);
  }

  const rows = (sessions ?? []) as SessionRow[];

  const grouped = new Map<string, SessionRow[]>();
  for (const row of rows) {
    if (!row.ended_at) continue;
    const key = jstDayKey(row.ended_at);
    const list = grouped.get(key) ?? [];
    list.push(row);
    grouped.set(key, list);
  }

  const cells = buildCalendarCells(monthDate);
  const todayKey = jstDayKey(new Date().toISOString());

  const selectedDay =
    sp.day && grouped.has(sp.day)
      ? sp.day
      : cells.find((c) => c.date && grouped.has(ymd(c.date)))?.date
      ? ymd(cells.find((c) => c.date && grouped.has(ymd(c.date)))!.date as Date)
      : null;

  const selectedSessions = selectedDay ? grouped.get(selectedDay) ?? [] : [];

  const prevHref = `/users/${encodeURIComponent(userId)}/calendar?month=${ym(prevMonth(monthDate))}`;
  const nextHref = `/users/${encodeURIComponent(userId)}/calendar?month=${ym(nextMonth(monthDate))}`;

  const profileRow = profile as ProfileRow;
  const displayName = (profileRow.display_name ?? "").trim() || "NoName";

  return (
    <Container>
      <div className="space-y-4">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">カレンダー</h1>
            <p className="text-sm text-muted-foreground">
              {displayName} の継続終了日を確認できます。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/users/${encodeURIComponent(userId)}`}
              className="text-sm text-primary hover:underline"
            >
              ← プロフィールへ
            </Link>
            <Link className="text-sm text-primary hover:underline" href="/app">
              /app
            </Link>
          </div>
        </header>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Link
                href={prevHref}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40"
              >
                ← 前月
              </Link>

              <div className="text-lg font-bold tabular-nums">
                {monthDate.getFullYear()}年 {monthDate.getMonth() + 1}月
              </div>

              <Link
                href={nextHref}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40"
              >
                翌月 →
              </Link>
            </div>
          </CardHeader>

          <CardBody>
            <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold text-muted-foreground">
              <div>日</div>
              <div>月</div>
              <div>火</div>
              <div>水</div>
              <div>木</div>
              <div>金</div>
              <div>土</div>
            </div>

            <div className="mt-2 grid grid-cols-7 gap-2">
              {cells.map((cell, idx) => {
                if (!cell.date) {
                  return <div key={`blank-${idx}`} className="h-20 rounded-xl bg-transparent" />;
                }

                const key = ymd(cell.date);
                const items = grouped.get(key) ?? [];
                const isToday = key === todayKey;
                const isSelected = key === selectedDay;

                const href = `/users/${encodeURIComponent(userId)}/calendar?month=${ym(monthDate)}&day=${key}`;

                return (
                  <Link
                    key={key}
                    href={href}
                    className={[
                      "h-20 rounded-xl border px-2 py-2 transition",
                      isSelected
                        ? "border-primary bg-primary/10"
                        : isToday
                        ? "border-primary/60 bg-background"
                        : "border-border bg-background hover:bg-secondary/30",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-bold tabular-nums">
                        {cell.date.getDate()}
                      </span>
                      {items.length > 0 ? (
                        <span className="text-[10px] text-primary font-semibold tabular-nums">
                          {items.length}件
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {items.slice(0, 3).map((_, dotIdx) => (
                        <span
                          key={`${key}-dot-${dotIdx}`}
                          className="h-2 w-2 rounded-full bg-primary"
                        />
                      ))}
                      {items.length > 3 ? (
                        <span className="text-[10px] text-muted-foreground">
                          +{items.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">
              {selectedDay
                ? `${selectedDay} の終了リザルト`
                : "終了リザルト"}
            </h2>
          </CardHeader>

          <CardBody>
            {!selectedDay || selectedSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                カレンダーの終了日を押すと、その日の結果一覧を表示できます。
              </p>
            ) : (
              <ul className="space-y-3">
                {selectedSessions.map((s) => (
                  <li key={String(s.id)}>
                    <Link href={`/results/${s.id}`} className="block">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold tabular-nums">
                          継続時間: {formatDuration(s.started_at, s.ended_at)}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          開始: {formatJst(s.started_at)}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground tabular-nums break-words">
                          終了: {s.ended_at ? formatJst(s.ended_at) : "-"}
                        </div>

                        <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                          理由: {(s.end_reason ?? "").trim() || "記録なし"}
                        </div>

                        <div className="mt-2 text-[11px] text-primary font-semibold">
                          結果画面を見る →
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``