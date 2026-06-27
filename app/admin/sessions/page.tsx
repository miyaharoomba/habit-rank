import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { Activity, Clock3, UserRound } from "lucide-react";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { AdminLink, MainLink, PageHeader } from "@/app/components/AppPageHeader";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type SessionRow = {
  id: number | string;
  user_id: string;
  started_at: string;
};

type ProfileRow = { id: string; display_name: string | null };

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is missing`);
  return value;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function elapsed(startedAt: string, now: number) {
  const ms = Math.max(0, now - new Date(startedAt).getTime());
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}日 ${hours}時間`;
  if (hours > 0) return `${hours}時間 ${minutes}分`;
  return `${minutes}分`;
}

export default async function AdminSessionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("streak_sessions")
    .select("id, user_id, started_at")
    .is("ended_at", null)
    .order("started_at", { ascending: true })
    .limit(300);
  if (error) throw new Error(error.message);

  const sessions = (data ?? []) as SessionRow[];
  const userIds = Array.from(new Set(sessions.map((row) => row.user_id)));
  const nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);
    ((profiles ?? []) as ProfileRow[]).forEach((row) => {
      nameMap.set(row.id, row.display_name?.trim() || "NoName");
    });
  }

  const now = Date.now();
  const over24Hours = sessions.filter(
    (row) => now - new Date(row.started_at).getTime() >= 24 * 60 * 60 * 1000
  ).length;
  const over7Days = sessions.filter(
    (row) => now - new Date(row.started_at).getTime() >= 7 * 24 * 60 * 60 * 1000
  ).length;

  return (
    <Container size="wide">
      <PageHeader
        title="継続中セッション"
        description="現在終了していないセッションと経過時間を確認します。"
        actions={
          <>
            <AdminLink />
            <MainLink />
          </>
        }
      />

      <div className="mt-6 grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card divide-x divide-border">
        <div className="px-4 py-4"><div className="text-xs text-muted-foreground">継続中</div><div className="mt-1 text-2xl font-bold tabular-nums">{sessions.length}</div></div>
        <div className="px-4 py-4"><div className="text-xs text-muted-foreground">24時間以上</div><div className="mt-1 text-2xl font-bold tabular-nums">{over24Hours}</div></div>
        <div className="px-4 py-4"><div className="text-xs text-muted-foreground">7日以上</div><div className="mt-1 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-300">{over7Days}</div></div>
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">開始時刻が古い順</h2>
              <span className="text-xs text-muted-foreground">最大300件</span>
            </div>
          </CardHeader>
          <CardBody>
            {sessions.length === 0 ? (
              <div className="py-12 text-center">
                <Activity className="mx-auto size-6 text-muted-foreground" aria-hidden={true} />
                <p className="mt-3 text-sm text-muted-foreground">継続中のセッションはありません。</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sessions.map((row) => {
                  const elapsedMs = now - new Date(row.started_at).getTime();
                  const isLong = elapsedMs >= 7 * 24 * 60 * 60 * 1000;
                  return (
                    <div key={row.id} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link href={`/users/${row.user_id}`} className="inline-flex items-center gap-2 font-semibold hover:underline">
                            <UserRound className="size-4 text-muted-foreground" aria-hidden={true} />
                            {nameMap.get(row.user_id) ?? "NoName"}
                          </Link>
                          {isLong ? (
                            <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                              長期継続
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">開始: {formatJst(row.started_at)}</p>
                        <p className="mt-1 text-xs text-muted-foreground">セッションID: {row.id}</p>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                        <Clock3 className="size-4 text-muted-foreground" aria-hidden={true} />
                        {elapsed(row.started_at, now)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
