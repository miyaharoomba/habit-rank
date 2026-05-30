// app/admin/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_thread_id: string | null;
  details: any;
  created_at: string;
};

type ProfileRow = { id: string; display_name: string | null };

function maskId(id: string | null) {
  if (!id) return "-";
  return `${id.slice(0, 8)}…`;
}

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // 管理者チェック
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  const [usersRes, bannedRes, reportsRes, auditRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true } as any),
    supabase
      .from("user_flags")
      .select("user_id", { count: "exact", head: true } as any)
      .eq("is_banned", true),
    supabase
      .from("dm_reports")
      .select("id", { count: "exact", head: true } as any)
      .eq("status", "open"),
    supabase
      .from("admin_audit_logs")
      .select("id, actor_id, action, target_user_id, target_thread_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const userCount = usersRes.count ?? 0;
  const bannedCount = bannedRes.count ?? 0;
  const openReportsCount = reportsRes.count ?? 0;

  const auditRows = ((auditRes.data ?? []) as AuditRow[]) || [];

  const ids = Array.from(new Set(auditRows.map((a) => a.actor_id).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    (profs ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">管理者コンソール</h1>
          <p className="text-sm text-muted-foreground">ユーザー管理 / 通報対応 / 監査ログ / お知らせ配信</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
        </div>
      </header>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">登録ユーザー数</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{userCount}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">BAN中</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{bannedCount}</div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs text-muted-foreground">未対応通報</div>
            <div className="mt-1 text-2xl font-bold tabular-nums">{openReportsCount}</div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">メニュー</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <Link
                href="/admin/users"
                className="rounded-xl border border-border bg-secondary/30 px-4 py-3 hover:bg-secondary/40 transition"
              >
                <div className="font-semibold">ユーザー管理</div>
                <div className="text-xs text-muted-foreground">一覧 / BAN / 解除 / リセット発行</div>
              </Link>

              <Link
                href="/admin/reports"
                className="rounded-xl border border-border bg-secondary/30 px-4 py-3 hover:bg-secondary/40 transition"
              >
                <div className="font-semibold">通報</div>
                <div className="text-xs text-muted-foreground">通報一覧 / 審査 / 対応</div>
              </Link>

              <Link
                href="/admin/audit"
                className="rounded-xl border border-border bg-secondary/30 px-4 py-3 hover:bg-secondary/40 transition"
              >
                <div className="font-semibold">監査ログ</div>
                <div className="text-xs text-muted-foreground">管理操作の履歴</div>
              </Link>

              <Link
                href="/admin/announcements"
                className="rounded-xl border border-border bg-secondary/30 px-4 py-3 hover:bg-secondary/40 transition"
              >
                <div className="font-semibold">お知らせ配信</div>
                <div className="text-xs text-muted-foreground">全員への通知 / 端末通知 / 詳細画面</div>
              </Link>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">最近の監査ログ（5件）</h2>
              <Link className="text-xs text-primary hover:underline" href="/admin/audit">
                すべて見る →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ監査ログがありません。</p>
            ) : (
              <ul className="space-y-2">
                {auditRows.map((a) => (
                  <li key={a.id} className="rounded-lg border border-border bg-secondary/30 px-4 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">
                          {a.action}
                          <span className="ml-2 text-xs text-muted-foreground">#{a.id}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          actor: {(a.actor_id && (nameMap.get(a.actor_id) ?? "NoName")) || "-"}（{maskId(a.actor_id)}）
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          target_user: {maskId(a.target_user_id)} / target_thread:{" "}
                          <span className="font-mono">{maskId(a.target_thread_id)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatJst(a.created_at)}
                      </div>
                    </div>
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
