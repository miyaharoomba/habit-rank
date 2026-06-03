import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { formatJst } from "@/lib/time";

type ThreadRow = {
  thread_id: string;
  other_user_id: string;
  other_display_name: string;
  last_message: string | null;
  last_message_at: string | null;
  avatar_path?: string | null;
};

type ProfileRow = {
  id: string;
  avatar_path: string | null;
};

function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default async function DmListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data, error } = await supabase.rpc("get_my_dm_threads", {
    limit_count: 50,
  });

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold">DM</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const baseThreads = (data ?? []) as ThreadRow[];
  const userIds = Array.from(new Set(baseThreads.map((t) => t.other_user_id)));
  const avatarMap = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, avatar_path")
      .in("id", userIds);

    (profiles ?? []).forEach((p: ProfileRow) => {
      avatarMap.set(p.id, p.avatar_path ?? null);
    });
  }

  const threads = baseThreads.map((t) => ({
    ...t,
    avatar_path: avatarMap.get(t.other_user_id) ?? null,
  }));

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">DM</h1>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline whitespace-nowrap" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline whitespace-nowrap" href="/ranking">
            /ranking
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">スレッド一覧</h2>
          </CardHeader>

          <CardBody>
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだDMがありません。参加者一覧から「メッセージ」で開始しよう。
              </p>
            ) : (
              <ul className="space-y-2">
                {threads.map((t) => {
                  const avatar = avatarUrl(t.avatar_path);
                  const initial = (t.other_display_name ?? "?").trim().slice(0, 1) || "?";

                  return (
                    <li
                      key={t.thread_id}
                      className="rounded-lg border border-border bg-secondary/40 px-4 py-3 hover:bg-secondary/50 transition"
                    >
                      <Link href={`/dm/${t.thread_id}`} className="block">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          {/* 左側：アイコン + 名前 + 最終メッセージ */}
                          <div className="min-w-0 flex flex-1 gap-3">
                            <div className="shrink-0">
                              {avatar ? (
                                <img
                                  src={avatar}
                                  alt="avatar"
                                  className="h-12 w-12 rounded-full object-cover border border-border"
                                />
                              ) : (
                                <div className="h-12 w-12 rounded-full border border-border bg-background/60 flex items-center justify-center text-sm font-bold text-muted-foreground">
                                  {initial}
                                </div>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="font-semibold leading-tight break-words sm:truncate">
                                {t.other_display_name}
                              </div>

                              <div className="mt-1 text-xs text-muted-foreground break-words sm:truncate">
                                {t.last_message ?? "（まだメッセージがありません）"}
                              </div>
                            </div>
                          </div>

                          {/* 右側：日時
                              モバイルでは下段へ逃がし、名前を潰さない */}
                          <div className="pl-[60px] sm:pl-0 text-left sm:text-right text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                            {t.last_message_at ? formatJst(t.last_message_at) : ""}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
