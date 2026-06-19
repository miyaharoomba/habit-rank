import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import { MainLink, PageHeader, SettingsLink } from "@/app/components/AppPageHeader";

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_thread_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

type ProfileRow = { id: string; display_name: string | null };
type DebugProfileRow = { suppress_global_streak_end_notification: boolean | null };

function maskId(id: string | null) {
  if (!id) return "-";
  return `${id.slice(0, 8)}…`;
}

function AdminNavCard({
  href,
  title,
  desc,
}: {
  href: string;
  title: string;
  desc: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <div className="h-full transition hover:-translate-y-0.5 hover:bg-secondary/20">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">{title}</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">{desc}</p>
            <div className="mt-3 text-sm text-primary">開く →</div>
          </CardBody>
        </Card>
      </div>
    </Link>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) {
    redirect("/settings");
  }

  async function setSuppressGlobalStreakEndNotification(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) redirect("/auth/sign-in");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !isAdmin) redirect("/settings");

    const enabled = String(formData.get("enabled") ?? "false") === "true";

    const { error } = await supabase
      .from("profiles")
      .update({ suppress_global_streak_end_notification: enabled })
      .eq("id", user.id);

    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "UPDATE_ADMIN_DEBUG_SETTINGS",
      target_user_id: user.id,
      details: { suppress_global_streak_end_notification: enabled },
    });

    revalidatePath("/admin");
    revalidatePath("/settings");
    redirect("/admin");
  }

  const [usersRes, bannedRes, reportsRes, auditRes, debugProfileRes] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase
      .from("user_flags")
      .select("user_id", { count: "exact", head: true })
      .eq("is_banned", true),
    supabase
      .from("dm_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("admin_audit_logs")
      .select("id, actor_id, action, target_user_id, target_thread_id, details, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("profiles")
      .select("suppress_global_streak_end_notification")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const userCount = usersRes.count ?? 0;
  const bannedCount = bannedRes.count ?? 0;
  const openReportsCount = reportsRes.count ?? 0;
  const auditRows = ((auditRes.data ?? []) as AuditRow[]) || [];
  const debugProfile = debugProfileRes.data as DebugProfileRow | null;
  const suppressGlobalStreakEndNotification =
    debugProfile?.suppress_global_streak_end_notification ?? false;

  const ids = Array.from(new Set(auditRows.map((a) => a.actor_id).filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();

  if (ids.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", ids);

    (profs ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <PageHeader
        title="管理者コンソール"
        description="ユーザー管理、通報対応、監査ログ、お知らせ配信、問い合わせ管理を行います。"
        actions={
          <>
            <MainLink />
            <SettingsLink />
          </>
        }
      />

      <div className="mt-6 grid gap-4 md:grid-cols-3">
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

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">管理者デバッグ設定</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">
              この管理者アカウントで継続終了をテストする時だけ、全体通知を抑制します。
              他ユーザーの通知欄や端末通知へ送らないための安全スイッチです。
            </p>

            <form action={setSuppressGlobalStreakEndNotification} className="mt-4">
              <input
                type="hidden"
                name="enabled"
                value={suppressGlobalStreakEndNotification ? "false" : "true"}
              />

              <div className="rounded-lg border border-border bg-background/60 p-4">
                <div className="text-sm font-semibold">継続終了の全体通知</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  現在: {suppressGlobalStreakEndNotification ? "通知しない" : "通知する"}
                </div>

                <button
                  type="submit"
                  className="mt-3 inline-flex items-center justify-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                >
                  {suppressGlobalStreakEndNotification
                    ? "通知する に切り替える"
                    : "通知しない に切り替える"}
                </button>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AdminNavCard
          href="/admin/users"
          title="ユーザー管理"
          desc="一覧 / BAN / 解除 / リセット発行"
        />

        <AdminNavCard
          href="/admin/reports"
          title="通報"
          desc="通報一覧 / 審査 / 対応"
        />

        <AdminNavCard
          href="/admin/audit"
          title="監査ログ"
          desc="管理操作の履歴"
        />

        <AdminNavCard
          href="/admin/announcements"
          title="お知らせ配信"
          desc="全員への通知 / 端末通知 / 詳細画面"
        />

        <AdminNavCard
          href="/admin/badges"
          title="トロフィー管理"
          desc="不正・誤取得したトロフィーの剥奪、判定起点のリセット、復元。"
        />

        <AdminNavCard
          href="/admin/support"
          title="問い合わせ管理"
          desc="問い合わせ一覧 / 返信 / 完了管理"
        />
      </div>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">最近の監査ログ（5件）</h2>
              <Link href="/admin/audit" className="text-sm text-primary hover:underline">
                すべて見る →
              </Link>
            </div>
          </CardHeader>
          <CardBody>
            {auditRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだ監査ログがありません。</p>
            ) : (
              <ul className="space-y-3">
                {auditRows.map((a) => (
                  <li key={a.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                    <div className="text-sm font-semibold break-words">
                      {a.action} #{a.id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground break-words">
                      actor: {(a.actor_id && (nameMap.get(a.actor_id) ?? "NoName")) || "-"}（{maskId(a.actor_id)}）
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground break-words">
                      target_user: {maskId(a.target_user_id)} / target_thread: {maskId(a.target_thread_id)}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground tabular-nums">{formatJst(a.created_at)}</div>
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
