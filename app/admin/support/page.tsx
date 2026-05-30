// app/admin/support/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type ThreadRow = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function maskId(id: string) {
  return id ? `${id.slice(0, 8)}…` : "";
}

export default async function AdminSupportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  const { data: threads, error } = await supabase
    .from("support_threads")
    .select("id, user_id, subject, status, created_at, updated_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (threads ?? []) as ThreadRow[];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const nameMap = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", userIds);

    (profiles ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  const openCount = rows.filter((r) => r.status === "open").length;
  const closedCount = rows.filter((r) => r.status === "closed").length;

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">問い合わせ管理</h1>
          <p className="text-sm text-muted-foreground">
            ユーザーからの問い合わせ一覧と返信。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/admin">
            /admin
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">全問い合わせ</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{rows.length}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">対応中</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{openCount}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">完了</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{closedCount}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">問い合わせ一覧（最大100件）</h2>
              <span className="text-xs text-muted-foreground">
                最新更新順
              </span>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ問い合わせはありません。
              </p>
            ) : (
              <div className="space-y-3">
                {rows.map((row) => {
                  const userName = nameMap.get(row.user_id) ?? "NoName";

                  return (
                    <div
                      key={row.id}
                      className="rounded-xl border border-border bg-secondary/30 p-4"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/admin/support/${row.id}`}
                              className="font-semibold break-words hover:underline"
                            >
                              {row.subject}
                            </Link>

                            <span
                              className={[
                                "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                                row.status === "open"
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground",
                              ].join(" ")}
                            >
                              {row.status === "open" ? "対応中" : "完了"}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            user: {userName}（{maskId(row.user_id)}）
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            作成: {formatJst(row.created_at)}
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            最終更新: {formatJst(row.last_message_at)}
                          </div>
                        </div>

                        <div className="text-sm">
                          <Link
                            href={`/admin/support/${row.id}`}
                            className="text-primary hover:underline"
                          >
                            開く →
                          </Link>
                        </div>
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