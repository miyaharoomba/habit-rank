import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type ReportRow = {
  id: number;
  reporter_id: string;
  thread_id: string;
  reason: string;
  created_at: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function maskId(id: string) {
  return id ? `${id.slice(0, 8)}…` : "";
}

function jst(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

export default async function AdminReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  async function updateReportAction(formData: FormData): Promise<void> {
    "use server";

    const reportId = Number(formData.get("report_id") ?? 0);
    const status = String(formData.get("status") ?? "").trim();
    const adminNote = String(formData.get("admin_note") ?? "").trim();

    const supabase = await createClient();

    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    if (!reportId || !["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      redirect("/admin/reports");
    }

    const { data: updated, error } = await supabase
      .from("dm_reports")
      .update({
        status,
        admin_note: adminNote || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reportId)
      .select("id, thread_id, reporter_id, status")
      .maybeSingle();

    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "REVIEW_REPORT",
      target_user_id: updated?.reporter_id ?? null,
      target_thread_id: updated?.thread_id ?? null,
      details: { report_id: reportId, status, admin_note: adminNote || null },
    });

    redirect("/admin/reports");
  }

  const { data: reports, error: rErr } = await supabase
    .from("dm_reports")
    .select(
      "id, reporter_id, thread_id, reason, created_at, status, reviewed_by, reviewed_at, admin_note"
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (rErr) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">通報</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {rErr.message}</p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/admin">
                /admin
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/settings">
                /settings
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (reports ?? []) as ReportRow[];
  const openCount = rows.filter((r) => r.status === "open").length;

  // 通報者名
  const reporterIds = Array.from(new Set(rows.map((x) => x.reporter_id)));
  const nameMap = new Map<string, string>();
  if (reporterIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", reporterIds);

    (profs ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">通報</h1>
          <p className="text-sm text-muted-foreground">最新200件（未対応: {openCount}）</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/admin">
            /admin
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/admin/users">
            /admin/users
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/admin/audit">
            /admin/audit
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">通報一覧</h2>
              <span className="text-xs text-muted-foreground">詳細で対象スレッドを確認</span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-3">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">通報はまだありません。</p>
              ) : (
                rows.map((r) => {
                  const reporterName = nameMap.get(r.reporter_id) ?? "NoName";
                  const badge =
                    r.status === "open"
                      ? "bg-destructive/15 text-destructive"
                      : r.status === "reviewing"
                      ? "bg-primary/15 text-primary"
                      : "bg-secondary/50 text-foreground";

                  return (
                    <div key={r.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${badge}`}>
                              {r.status}
                            </span>
                            <div className="text-sm font-semibold">通報 #{r.id}</div>

                            {/* ✅ 追加：詳細へ */}
                            <Link
                              className="ml-2 text-xs text-primary hover:underline whitespace-nowrap"
                              href={`/admin/reports/${r.id}`}
                            >
                              詳細 →
                            </Link>
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            通報者: {reporterName}（{maskId(r.reporter_id)}）
                          </div>

                          <div className="mt-1 text-xs text-muted-foreground">
                            thread: <span className="font-mono">{maskId(r.thread_id)}</span> / 日時:{" "}
                            <span className="tabular-nums">{jst(r.created_at)}</span>
                          </div>

                          <div className="mt-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm whitespace-pre-wrap break-words">
                            {r.reason}
                          </div>

                          {r.reviewed_at && (
                            <div className="mt-2 text-xs text-muted-foreground">
                              最終対応: <span className="tabular-nums">{jst(r.reviewed_at)}</span> / by{" "}
                              {r.reviewed_by ? maskId(r.reviewed_by) : "-"}
                            </div>
                          )}
                        </div>

                        <div className="sm:w-[360px] flex flex-col gap-2">
                          <form action={updateReportAction}>
                            <input type="hidden" name="report_id" value={String(r.id)} />

                            <select
                              name="status"
                              defaultValue={r.status}
                              className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                            >
                              <option value="open">open</option>
                              <option value="reviewing">reviewing</option>
                              <option value="resolved">resolved</option>
                              <option value="dismissed">dismissed</option>
                            </select>

                            <textarea
                              name="admin_note"
                              defaultValue={r.admin_note ?? ""}
                              placeholder="管理者メモ（任意）"
                              rows={3}
                              className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                            />

                            <button
                              type="submit"
                              className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
                            >
                              更新
                            </button>
                          </form>

                          <div className="text-[11px] text-muted-foreground">
                            ※ 更新は監査ログに記録されます。
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``