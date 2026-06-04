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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function monthParamToDate(raw?: string) {
  if (!raw) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
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
  const daysInMonth = new Date(
    baseMonth.getFullYear(),
    baseMonth.getMonth() + 1,
    0
  ).getDate();

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

  // 自分のIDなら自分用カレンダーへ寄せる
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

  const prevHref = `/users/${encodeURIComponent(userId)}/calendar?month=${ym(
    prevMonth(monthDate)
  )}`;
  const nextHref = `/users/${encodeURIComponent(userId)}/calendar?month=${ym(
    nextMonth(monthDate)
  )}`;

  const displayName = (profile as ProfileRow).display_name?.trim() || "NoName";

  return (
    <Container>
      <div className="space-y-4 sm:space-y-5">
        {/* ヘッダー */}
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-tight">カレンダー</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {displayName} の継続終了日を確認できます。
          </p>

          <div className="flex flex-wrap gap-2 pt-1">
            <Link
              href={`/users/${encodeURIComponent(userId)}`}
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary/40"
            >
              ← プロフィールへ
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-secondary/40"
            >
              /app
            </Link>
          </div>
        </header>

        {/* カレンダー本体 */}
        <Card>
          <CardHeader>
            <div className="px-3 py-3 sm:px-5 sm:py-4">
              <div className="grid grid-cols-[64px_1fr_64px] items-center gap-2 sm:grid-cols-[96px_1fr_96px]">
                <Link
                  href={prevHref}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2 text-sm font-semibold hover:bg-secondary/40"
                >
                  ← 前
                </Link>

                <div className="text-center text-lg sm:text-2xl font-bold tabular-nums">
                  {monthDate.getFullYear()}年 {monthDate.getMonth() + 1}月
                </div>

                <Link
                  href={nextHref}
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-2 py-2 text-sm font-semibold hover:bg-secondary/40"
                >
                  次 →
                </Link>
              </div>
            </div>
          </CardHeader>

          <CardBody>
            <div className="px-3 pb-3 sm:px-5 sm:pb-5">
              <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-[11px] sm:text-xs font-semibold text-muted-foreground">
                <div>日</div>
                <div>月</div>
                <div>火</div>
                <div>水</div>
                <div>木</div>
                <div>金</div>
                <div>土</div>
              </div>

              <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                {cells.map((cell, idx) => {
                  if (!cell.date) {
                    return (
                      <div
                        key={`blank-${idx}`}
                        className="aspect-square rounded-2xl bg-transparent"
                      />
                    );
                  }

                  const key = ymd(cell.date);
                  const items = grouped.get(key) ?? [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDay;

                  const href = `/users/${encodeURIComponent(
                    userId
                  )}/calendar?month=${ym(monthDate)}&day=${key}`;

                  return (
                    <Link
                      key={key}
                      href={href}
                      className={[
                        "relative aspect-square rounded-2xl border p-1.5 sm:p-2 transition",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : isToday
                          ? "border-primary/60 bg-background"
                          : "border-border bg-background hover:bg-secondary/30",
                      ].join(" ")}
                    >
                      {/* 日付 */}
                      <div className="text-sm sm:text-lg font-bold tabular-nums leading-none">
                        {cell.date.getDate()}
                      </div>

                      {/* 件数バッジ */}
                      {items.length > 0 ? (
                        <div className="absolute right-1.5 top-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold text-primary leading-none">
                          {items.length}
                        </div>
                      ) : null}

                      {/* 下部ドット */}
                      <div className="absolute left-1.5 right-1.5 bottom-1.5 flex items-center justify-center gap-1">
                        {items.length > 0 ? (
                          <>
                            {items.slice(0, 3).map((_, dotIdx) => (
                              <span
                                key={`${key}-dot-${dotIdx}`}
                                className="h-1.5 w-1.5 sm:h-2 sm:w-2 rounded-full bg-primary"
                              />
                            ))}
                            {items.length > 3 ? (
                              <span className="text-[9px] sm:text-[10px] text-primary font-semibold">
                                +{items.length - 3}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-[10px] sm:text-[11px] text-muted-foreground/50">
                            -
                          </span>
                        )}
                      </div>
                    </Link>
                  );
                })}
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
                        className="block rounded-xl border border-border bg-secondary/20 px-4 py-3 hover:bg-secondary/30 transition"
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
                          結果画面を見る →
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