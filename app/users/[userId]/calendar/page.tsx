import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StreakCalendarView, {
  type CalendarSession,
} from "@/app/components/StreakCalendarView";
import { MainLink, ParticipantsLink } from "@/app/components/AppPageHeader";

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

function ymd(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function jstDayKey(value: string) {
  const d = new Date(value);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return `${jst.getUTCFullYear()}-${pad2(jst.getUTCMonth() + 1)}-${pad2(
    jst.getUTCDate()
  )}`;
}

function buildCalendarCells(baseMonth: Date) {
  const first = startOfMonth(baseMonth);
  const startWeekday = first.getDay();
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
              <ParticipantsLink />
              <MainLink />
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

  const rows = (sessions ?? []) as CalendarSession[];

  const grouped: Record<string, CalendarSession[]> = {};
  for (const row of rows) {
    if (!row.ended_at) continue;
    const key = jstDayKey(row.ended_at);
    grouped[key] = grouped[key] ? [...grouped[key], row] : [row];
  }

  const cells = buildCalendarCells(monthDate);

  const selectedDay =
    sp.day && grouped[sp.day]
      ? sp.day
      : cells.find((c) => c.date && grouped[ymd(c.date)])?.date
      ? ymd(cells.find((c) => c.date && grouped[ymd(c.date)])!.date as Date)
      : null;

  const selectedSessions = selectedDay ? grouped[selectedDay] ?? [] : [];

  const displayName = ((profile as ProfileRow).display_name ?? "").trim() || "NoName";

  return (
    <Container>
      <StreakCalendarView
        title="カレンダー"
        description={`${displayName} の継続終了日を確認できます。`}
        topLinks={[
          {
            href: `/users/${encodeURIComponent(userId)}`,
            label: "プロフィール",
          },
          { href: "/app", label: "メイン" },
        ]}
        basePath={`/users/${encodeURIComponent(userId)}/calendar`}
        year={monthDate.getFullYear()}
        month={monthDate.getMonth() + 1}
        grouped={grouped}
        selectedDay={selectedDay}
        selectedSessions={selectedSessions}
      />
    </Container>
  );
}
