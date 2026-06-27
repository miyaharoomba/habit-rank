import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  Activity,
  Award,
  Ban,
  BellRing,
  CircleAlert,
  Clock3,
  Flag,
  Gauge,
  Inbox,
  Megaphone,
  MessageSquareText,
  ScrollText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { MainLink, PageHeader, SettingsLink } from "@/app/components/AppPageHeader";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type AuditRow = {
  id: number;
  actor_id: string | null;
  action: string;
  target_user_id: string | null;
  target_thread_id: string | null;
  created_at: string;
};

type BanRow = {
  user_id: string;
  ban_reason: string | null;
  banned_until: string | null;
  updated_at: string;
};

type ReportRow = {
  id: number;
  reporter_id: string;
  reason: string;
  status: "open" | "reviewing";
  created_at: string;
};

type SupportRow = {
  id: string;
  user_id: string;
  subject: string;
  status: "open";
  last_message_at: string;
};

type FailedPushRow = {
  id: number;
  notification_id: string;
  recipient_id: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

type DebugProfileRow = {
  suppress_global_streak_end_notification: boolean | null;
};

const ACTION_LABELS: Record<string, string> = {
  BAN_USER: "ユーザーをBAN",
  UNBAN_USER: "BANを解除",
  DELETE_USER: "アカウントを削除",
  RESET_PASSWORD: "パスワードリセットを送信",
  REVIEW_REPORT: "通報を更新",
  UPDATE_ADMIN_DEBUG_SETTINGS: "デバッグ設定を変更",
};

const NOTIFICATION_LABELS: Record<string, string> = {
  dm: "DM",
  streak_end: "継続終了",
  admin_broadcast: "管理者お知らせ",
  support_reply: "問い合わせ返信",
  trophy_unlock: "トロフィー獲得",
  result_comment: "リザルトコメント",
  global_chat: "掲示板",
};

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

function maskId(id: string | null) {
  if (!id) return "-";
  return `${id.slice(0, 8)}…`;
}

function shortText(value: string | null, max = 80) {
  const text = (value ?? "").trim();
  if (!text) return "内容なし";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function number(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("ja-JP");
}

function isActiveBan(row: BanRow, now: number) {
  if (!row.banned_until) return true;
  const until = new Date(row.banned_until).getTime();
  return !Number.isFinite(until) || until > now;
}

function ToneBadge({
  children,
  tone,
}: {
  children: ReactNode;
  tone: "danger" | "warning" | "success" | "neutral";
}) {
  const styles = {
    danger: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    neutral: "border-border bg-secondary/40 text-muted-foreground",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

function MetricTile({
  label,
  value,
  helper,
  href,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  helper: string;
  href?: string;
  icon: IconType;
  tone?: "danger" | "warning" | "success" | "neutral";
}) {
  const iconStyles = {
    danger: "bg-red-500/10 text-red-600 dark:text-red-300",
    warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
    success: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    neutral: "bg-secondary text-muted-foreground",
  };
  const content = (
    <div className="flex h-full min-h-28 items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-4 transition hover:border-primary/40 hover:bg-secondary/20">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        <div className="mt-1 text-xs leading-5 text-muted-foreground">{helper}</div>
      </div>
      <div className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${iconStyles[tone]}`}>
        <Icon className="size-4" aria-hidden={true} />
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function SectionTitle({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      {href ? (
        <Link href={href} className="shrink-0 text-sm font-semibold text-primary hover:underline">
          すべて見る
        </Link>
      ) : null}
    </div>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
}

function QuickLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: IconType;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-lg border border-border bg-background/50 px-2 py-3 text-center text-xs font-semibold transition hover:border-primary/40 hover:bg-secondary/40"
    >
      <Icon className="size-5 text-muted-foreground" aria-hidden={true} />
      <span>{label}</span>
    </Link>
  );
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

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

  const admin = getAdminClient();
  const now = Date.now();
  const since24Hours = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7Days = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    usersRes,
    bansRes,
    reportsRes,
    supportRes,
    auditRes,
    debugProfileRes,
    pendingPushRes,
    failedPushRes,
    sentPush24Res,
    createdPush24Res,
    activeSubscriptionsRes,
    activeSessionsRes,
    endedSessionsRes,
    endedSessions7Res,
    notificationsRes,
    notifications24Res,
  ] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin
      .from("user_flags")
      .select("user_id, ban_reason, banned_until, updated_at")
      .eq("is_banned", true)
      .order("updated_at", { ascending: false })
      .limit(300),
    admin
      .from("dm_reports")
      .select("id, reporter_id, reason, status, created_at", { count: "exact" })
      .in("status", ["open", "reviewing"])
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("support_threads")
      .select("id, user_id, subject, status, last_message_at", { count: "exact" })
      .eq("status", "open")
      .order("last_message_at", { ascending: false })
      .limit(5),
    admin
      .from("admin_audit_logs")
      .select("id, actor_id, action, target_user_id, target_thread_id, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("profiles")
      .select("suppress_global_streak_end_notification")
      .eq("id", user.id)
      .maybeSingle(),
    admin
      .from("push_outbox")
      .select("id", { count: "exact", head: true })
      .is("sent_at", null)
      .lt("attempts", 8),
    admin
      .from("push_outbox")
      .select("id, notification_id, recipient_id, attempts, last_error, created_at", {
        count: "exact",
      })
      .is("sent_at", null)
      .not("last_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("push_outbox")
      .select("sent_at", { count: "exact" })
      .gte("created_at", since24Hours)
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1),
    admin
      .from("push_outbox")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24Hours),
    admin
      .from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true })
      .eq("disabled", false),
    admin
      .from("streak_sessions")
      .select("id", { count: "exact", head: true })
      .is("ended_at", null),
    admin
      .from("streak_sessions")
      .select("id", { count: "exact", head: true })
      .not("ended_at", "is", null),
    admin
      .from("streak_sessions")
      .select("id", { count: "exact", head: true })
      .gte("ended_at", since7Days),
    admin.from("notifications").select("id", { count: "exact", head: true }),
    admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since24Hours),
  ]);

  const warnings = [
    usersRes.error,
    bansRes.error,
    reportsRes.error,
    supportRes.error,
    auditRes.error,
    debugProfileRes.error,
    pendingPushRes.error,
    failedPushRes.error,
    sentPush24Res.error,
    createdPush24Res.error,
    activeSubscriptionsRes.error,
    activeSessionsRes.error,
    endedSessionsRes.error,
    endedSessions7Res.error,
    notificationsRes.error,
    notifications24Res.error,
  ].filter(Boolean);

  const activeBans = ((bansRes.data ?? []) as BanRow[]).filter((row) =>
    isActiveBan(row, now)
  );
  const reportRows = (reportsRes.data ?? []) as ReportRow[];
  const supportRows = (supportRes.data ?? []) as SupportRow[];
  const failedPushRows = (failedPushRes.data ?? []) as FailedPushRow[];
  const auditRows = (auditRes.data ?? []) as AuditRow[];
  const debugProfile = debugProfileRes.data as DebugProfileRow | null;
  const suppressGlobalStreakEndNotification =
    debugProfile?.suppress_global_streak_end_notification ?? false;

  const failedNotificationIds = failedPushRows.map((row) => row.notification_id);
  const failedNotificationTypes = new Map<string, string>();
  if (failedNotificationIds.length > 0) {
    const { data } = await admin
      .from("notifications")
      .select("id, type")
      .in("id", failedNotificationIds);
    ((data ?? []) as Array<{ id: string; type: string }>).forEach((row) => {
      failedNotificationTypes.set(row.id, row.type);
    });
  }

  const profileIds = Array.from(
    new Set(
      [
        ...activeBans.map((row) => row.user_id),
        ...reportRows.map((row) => row.reporter_id),
        ...supportRows.map((row) => row.user_id),
        ...failedPushRows.map((row) => row.recipient_id),
        ...auditRows.map((row) => row.actor_id),
      ].filter((id): id is string => Boolean(id))
    )
  );
  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data } = await admin
      .from("profiles")
      .select("id, display_name")
      .in("id", profileIds);
    ((data ?? []) as ProfileRow[]).forEach((row) => {
      nameMap.set(row.id, row.display_name?.trim() || "NoName");
    });
  }

  const failedCount = failedPushRes.count ?? 0;
  const pendingCount = pendingPushRes.count ?? 0;
  const sent24Count = sentPush24Res.count ?? 0;
  const created24Count = createdPush24Res.count ?? 0;
  const openReportCount = reportsRes.count ?? 0;
  const openSupportCount = supportRes.count ?? 0;
  const attentionCount = failedCount + openReportCount + openSupportCount;
  const deliveryRate =
    created24Count > 0 ? Math.round((sent24Count / created24Count) * 100) : 100;
  const lastSentAt = (sentPush24Res.data?.[0] as { sent_at?: string } | undefined)
    ?.sent_at;
  const statusTone = failedCount > 0 ? "danger" : attentionCount > 0 ? "warning" : "success";
  const statusText =
    failedCount > 0
      ? "通知エラーあり"
      : attentionCount > 0
      ? "対応待ちあり"
      : "正常稼働";

  return (
    <Container size="wide">
      <PageHeader
        eyebrow="Operations"
        title="管理者ダッシュボード"
        description="通知、ユーザー対応、問い合わせ、利用状況を一画面で確認します。"
        actions={
          <>
            <MainLink />
            <SettingsLink />
          </>
        }
      />

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
            <ShieldCheck className="size-5" aria-hidden={true} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">運用ステータス</span>
              <ToneBadge tone={statusTone}>{statusText}</ToneBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              要対応 {number(attentionCount)}件 / 直近24時間の通知配信率 {deliveryRate}%
            </p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {lastSentAt ? `最終端末通知: ${formatJst(lastSentAt)}` : "直近24時間の端末通知なし"}
        </div>
      </div>

      {warnings.length > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
          <div>
            一部の指標を取得できませんでした。表示されている0件には未取得が含まれる可能性があります。
          </div>
        </div>
      ) : null}

      <section aria-label="運用サマリー" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricTile
          label="失敗通知"
          value={number(failedCount)}
          helper="未送信でエラーあり"
          href="#push-status"
          icon={CircleAlert}
          tone={failedCount > 0 ? "danger" : "success"}
        />
        <MetricTile
          label="未対応通報"
          value={number(openReportCount)}
          helper="open・reviewing"
          href="/admin/reports"
          icon={Flag}
          tone={openReportCount > 0 ? "warning" : "success"}
        />
        <MetricTile
          label="対応中問い合わせ"
          value={number(openSupportCount)}
          helper="openスレッド"
          href="/admin/support"
          icon={Inbox}
          tone={openSupportCount > 0 ? "warning" : "success"}
        />
        <MetricTile
          label="BAN中"
          value={number(activeBans.length)}
          helper="期限内・無期限"
          href="/admin/users"
          icon={Ban}
          tone={activeBans.length > 0 ? "warning" : "neutral"}
        />
        <MetricTile
          label="登録ユーザー"
          value={number(usersRes.count)}
          helper="プロフィール総数"
          href="/admin/users"
          icon={Users}
        />
        <MetricTile
          label="継続中"
          value={number(activeSessionsRes.count)}
          helper="現在進行中のセッション"
          icon={Activity}
          tone="success"
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.45fr_0.55fr]">
        <Card>
          <div id="push-status" />
          <CardHeader>
            <SectionTitle
              title="端末通知の送信状況"
              description="送信待ちは再試行対象です。8回失敗した通知はエラーとして残ります。"
            />
          </CardHeader>
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="border-l-2 border-emerald-500 pl-3">
                <div className="text-xs text-muted-foreground">24時間の送信済み</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{number(sent24Count)}</div>
              </div>
              <div className="border-l-2 border-primary pl-3">
                <div className="text-xs text-muted-foreground">配信率</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{deliveryRate}%</div>
              </div>
              <div className="border-l-2 border-amber-500 pl-3">
                <div className="text-xs text-muted-foreground">送信待ち</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{number(pendingCount)}</div>
              </div>
              <div className="border-l-2 border-red-500 pl-3">
                <div className="text-xs text-muted-foreground">エラーあり</div>
                <div className="mt-1 text-xl font-bold tabular-nums">{number(failedCount)}</div>
              </div>
            </div>

            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">最近の失敗通知</h3>
                <span className="text-xs text-muted-foreground">最大5件</span>
              </div>
              {failedPushRows.length === 0 ? (
                <EmptyRow>失敗中の通知はありません。</EmptyRow>
              ) : (
                <div className="divide-y divide-border">
                  {failedPushRows.map((row) => {
                    const type = failedNotificationTypes.get(row.notification_id);
                    const recipient = row.recipient_id
                      ? nameMap.get(row.recipient_id) ?? "NoName"
                      : "受信者なし";
                    return (
                      <div key={row.id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                            <span>{type ? NOTIFICATION_LABELS[type] ?? type : "通知"}</span>
                            <ToneBadge tone="danger">{row.attempts}回失敗</ToneBadge>
                          </div>
                          <p className="mt-1 break-words text-xs text-red-600 dark:text-red-300">
                            {shortText(row.last_error, 120)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            宛先: {recipient}（{maskId(row.recipient_id)}）
                          </p>
                        </div>
                        <time className="text-xs tabular-nums text-muted-foreground">
                          {formatJst(row.created_at)}
                        </time>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle title="管理メニュー" description="よく使う管理機能へ移動" />
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-2">
              <QuickLink href="/admin/users" label="ユーザー" icon={Users} />
              <QuickLink href="/admin/reports" label="通報" icon={Flag} />
              <QuickLink href="/admin/support" label="問い合わせ" icon={MessageSquareText} />
              <QuickLink href="/admin/announcements" label="お知らせ" icon={Megaphone} />
              <QuickLink href="/admin/badges" label="トロフィー" icon={Award} />
              <QuickLink href="/admin/audit" label="監査ログ" icon={ScrollText} />
            </div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <SectionTitle
              title="対応キュー"
              description="未完了の通報と問い合わせを更新順で確認"
            />
          </CardHeader>
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">通報</h3>
              <Link href="/admin/reports" className="text-xs font-semibold text-primary hover:underline">
                一覧へ
              </Link>
            </div>
            {reportRows.length === 0 ? (
              <EmptyRow>対応待ちの通報はありません。</EmptyRow>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {reportRows.slice(0, 3).map((row) => (
                  <Link key={row.id} href={`/admin/reports/${row.id}`} className="block py-3 hover:bg-secondary/20">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 text-sm font-semibold">通報 #{row.id}</div>
                      <ToneBadge tone={row.status === "open" ? "danger" : "warning"}>
                        {row.status === "open" ? "未対応" : "確認中"}
                      </ToneBadge>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {nameMap.get(row.reporter_id) ?? "NoName"}: {shortText(row.reason)}
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">{formatJst(row.created_at)}</p>
                  </Link>
                ))}
              </div>
            )}

            <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">問い合わせ</h3>
              <Link href="/admin/support" className="text-xs font-semibold text-primary hover:underline">
                一覧へ
              </Link>
            </div>
            {supportRows.length === 0 ? (
              <EmptyRow>対応中の問い合わせはありません。</EmptyRow>
            ) : (
              <div className="mt-2 divide-y divide-border">
                {supportRows.slice(0, 3).map((row) => (
                  <Link key={row.id} href={`/admin/support/${row.id}`} className="block py-3 hover:bg-secondary/20">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 truncate text-sm font-semibold">{row.subject}</div>
                      <ToneBadge tone="warning">対応中</ToneBadge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {nameMap.get(row.user_id) ?? "NoName"}（{maskId(row.user_id)}）
                    </p>
                    <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                      最終更新: {formatJst(row.last_message_at)}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle
              title="BAN中ユーザー"
              description="期限切れを除いた現在有効なBAN"
              href="/admin/users"
            />
          </CardHeader>
          <CardBody>
            {activeBans.length === 0 ? (
              <EmptyRow>BAN中のユーザーはいません。</EmptyRow>
            ) : (
              <div className="divide-y divide-border">
                {activeBans.slice(0, 5).map((row) => (
                  <div key={row.user_id} className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/users/${row.user_id}`} className="text-sm font-semibold hover:underline">
                          {nameMap.get(row.user_id) ?? "NoName"}
                        </Link>
                        <ToneBadge tone="danger">BAN中</ToneBadge>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        理由: {row.ban_reason || "理由未設定"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        期限: {row.banned_until ? formatJst(row.banned_until) : "無期限"}
                      </p>
                    </div>
                    <time className="text-xs tabular-nums text-muted-foreground">
                      更新 {formatJst(row.updated_at)}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <SectionTitle
              title="アプリ利用量"
              description="Supabase内の主要レコードと直近アクティビティ"
            />
          </CardHeader>
          <CardBody>
            <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ["登録ユーザー", number(usersRes.count), "全期間"],
                ["終了セッション", number(endedSessionsRes.count), "全期間"],
                ["終了セッション", number(endedSessions7Res.count), "直近7日"],
                ["生成通知", number(notificationsRes.count), "全期間"],
                ["生成通知", number(notifications24Res.count), "直近24時間"],
                ["有効な端末購読", number(activeSubscriptionsRes.count), "現在"],
              ].map(([label, value, period]) => (
                <div key={`${label}-${period}`} className="flex items-center justify-between gap-4 border-b border-border py-3">
                  <div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{period}</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <Gauge className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
              <span>契約上のEgress・StorageクォータはSupabase Usage画面で確認してください。</span>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle
              title="最近の管理操作"
              description="直近5件の監査ログ"
              href="/admin/audit"
            />
          </CardHeader>
          <CardBody>
            {auditRows.length === 0 ? (
              <EmptyRow>監査ログはまだありません。</EmptyRow>
            ) : (
              <div className="divide-y divide-border">
                {auditRows.map((row) => (
                  <div key={row.id} className="flex items-start gap-3 py-3">
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Clock3 className="size-4 text-muted-foreground" aria-hidden={true} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">
                        {ACTION_LABELS[row.action] ?? row.action}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.actor_id ? nameMap.get(row.actor_id) ?? "NoName" : "system"} / 対象 {maskId(row.target_user_id ?? row.target_thread_id)}
                      </p>
                      <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                        {formatJst(row.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5">
        <Card>
          <CardHeader>
            <SectionTitle
              title="管理者デバッグ設定"
              description="この管理者アカウントで継続終了をテストする際の通知制御"
            />
          </CardHeader>
          <CardBody>
            <form
              action={setSuppressGlobalStreakEndNotification}
              className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <input
                type="hidden"
                name="enabled"
                value={suppressGlobalStreakEndNotification ? "false" : "true"}
              />
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <BellRing className="size-4" aria-hidden={true} />
                </div>
                <div>
                  <div className="text-sm font-semibold">継続終了の全体通知</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    現在: {suppressGlobalStreakEndNotification ? "通知しない" : "通知する"}
                  </p>
                </div>
              </div>
              <button
                type="submit"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold transition hover:bg-secondary/40"
              >
                {suppressGlobalStreakEndNotification ? "通知を有効にする" : "通知を抑制する"}
              </button>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
