import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// ✅ JST固定フォーマッタ（lib/time.ts）
import { formatJst } from "@/lib/time";

type ThreadRow = {
  thread_id: string;
  other_user_id: string;
  other_display_name: string;
  last_message: string | null;
  last_message_at: string | null;
};

export default async function DmListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

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

  const threads = (data ?? []) as ThreadRow[];

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
                {threads.map((t) => (
                  <li
                    key={t.thread_id}
                    className="rounded-lg border border-border bg-secondary/40 px-4 py-3"
                  >
                    <Link href={`/dm/${t.thread_id}`} className="block">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{t.other_display_name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {t.last_message ?? "（まだメッセージがありません）"}
                          </div>
                        </div>

                        {/* ✅ ここをJST固定で表示 */}
                        <div className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                          {t.last_message_at ? formatJst(t.last_message_at) : ""}
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