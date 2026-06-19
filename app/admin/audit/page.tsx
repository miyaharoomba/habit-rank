import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import {
  AdminLink,
  HeaderLink,
  PageHeader,
  SettingsLink,
} from "@/app/components/AppPageHeader";
import { Flag, Users } from "lucide-react";

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_thread_id: string | null;
  details: unknown;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function maskId(id: string | null) {
  if (!id) return "-";
  return `${id.slice(0, 8)}…`;
}

export default async function AdminAuditPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  const { data, error } = await supabase
    .from("admin_audit_logs")
    .select("id, actor_id, action, target_user_id, target_thread_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">監査ログ</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
            <div className="mt-3 flex gap-3">
              <AdminLink />
              <SettingsLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (data ?? []) as AuditRow[];

  // actor/target の表示名をまとめて取得
  const ids = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.actor_id, r.target_user_id])
        .filter(Boolean) as string[]
    )
  );

  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    (profs ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <PageHeader
        title="監査ログ"
        description="最新300件の管理操作履歴をJSTで表示します。"
        actions={
          <>
            <AdminLink />
            <HeaderLink href="/admin/users" icon={Users}>
              ユーザー管理
            </HeaderLink>
            <HeaderLink href="/admin/reports" icon={Flag}>
              通報
            </HeaderLink>
            <SettingsLink />
          </>
        }
      />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">ログ</h2>
              <span className="text-xs text-muted-foreground">JST表示</span>
            </div>
          </CardHeader>

          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">ログはまだありません。</p>
            ) : (
              <ul className="space-y-2">
                {rows.map((r) => {
                  const actorName = r.actor_id ? nameMap.get(r.actor_id) ?? "NoName" : "-";
                  const targetName = r.target_user_id ? nameMap.get(r.target_user_id) ?? "NoName" : "-";

                  return (
                    <li key={r.id} className="rounded-xl border border-border bg-secondary/30 px-4 py-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {r.action}
                            <span className="ml-2 text-xs text-muted-foreground">#{r.id}</span>
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            actor: {actorName}（{maskId(r.actor_id)}）
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            target_user: {targetName}（{maskId(r.target_user_id)}） / target_thread:{" "}
                            <span className="font-mono">{maskId(r.target_thread_id)}</span>
                          </div>

                          {r.details != null && (
                            <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs whitespace-pre-wrap break-words">
                              {JSON.stringify(r.details, null, 2)}
                            </div>
                          )}
                        </div>

                        <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                          {formatJst(r.created_at)}
                        </div>
                      </div>
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
