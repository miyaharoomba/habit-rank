import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  Activity,
  Award,
  BellRing,
  CircleAlert,
  Flag,
  Gauge,
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

type ProfileRow = { id: string; display_name: string | null };
type DebugProfileRow = { suppress_global_streak_end_notification: boolean | null };

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
  return id ? `${id.slice(0, 8)}…` : "-";
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

function SummaryItem({
  label,
  value,
  href,
  alert = false,
}: {
  label: string;
  value: string;
  href?: string;
  alert?: boolean;
}) {
  const content = (
    <div className="min-w-0 px-3 py-3 sm:px-4">
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums ${alert ? "text-red-600 dark:text-red-300" : ""}`}>
        {value}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:bg-secondary/30">
      {content}
    </Link>
  ) : (
    content
  );
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
          一覧へ
        </Link>
      ) : null}
    </div>
  );
}

function QuickLink({ href, label, icon: Icon }: { href: string; label: string; icon: IconType }) {
  return (
    <Link
      href={href}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-semibold transition hover:bg-secondary/40"
    >
      <Icon className="size-4 text-muted-foreground" aria-hidden={true} />
      <span>{label}</span>
    </Link>
  );
}

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>;
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
      .limit(4),
    admin
      .from("support_threads")
      .select("id, user_id, subject, last_message_at", { count: "exact" })
      .eq("status", "open")
      .order("last_message_at", { ascending: false })
      .limit(4),
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
      .select("id, notification_id, recipient_id, attempts, last_error, created_at", { count: "exact" })
      .is("sent_at", null)
      .not("last_error", "is", null)
      .order("created_at", { ascending: false })
      .limit(3),
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

  const queryErrors = [
    usersRes.error,
    bansRes.error,
    reportsRes.error,
    supportRes.error,
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

  const activeBans = ((bansRes.data ?? []) as BanRow[]).filter((row) => isActiveBan(row, now));
  const reportRows = (reportsRes.data ?? []) as ReportRow[];
  const supportRows = (supportRes.data ?? []) as SupportRow[];
  const failedPushRows = (failedPushRes.data ?? []) as FailedPushRow[];
  const debugProfile = debugProfileRes.data as DebugProfileRow | null;
  const suppressGlobalStreakEndNotification =
    debugProfile?.suppress_global_streak_end_notification ?? false;

  const failedTypes = new Map<string, string>();
  if (failedPushRows.length > 0) {
    const { data } = await admin
      .from("notifications")
      .select("id, type")
      .in("id", failedPushRows.map((row) => row.notification_id));
    ((data ?? []) as Array<{ id: string; type: string }>).forEach((row) => {
      failedTypes.set(row.id, row.type);
    });
  }

  const profileIds = Array.from(
    new Set(
      [
        ...activeBans.map((row) => row.user_id),
        ...reportRows.map((row) => row.reporter_id),
        ...supportRows.map((row) => row.user_id),
        ...failedPushRows.map((row) => row.recipient_id),
      ].filter((id): id is string => Boolean(id))
    )
  );
  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data } = await admin.from("profiles").select("id, display_name").in("id", profileIds);
    ((data ?? []) as ProfileRow[]).forEach((row) => {
      nameMap.set(row.id, row.display_name?.trim() || "NoName");
    });
  }

  const failedCount = failedPushRes.count ?? 0;
  const openReportCount = reportsRes.count ?? 0;
  const openSupportCount = supportRes.count ?? 0;
  const sent24Count = sentPush24Res.count ?? 0;
  const created24Count = createdPush24Res.count ?? 0;
  const attentionCount = failedCount + openReportCount + openSupportCount;
  const deliveryRate = created24Count > 0 ? Math.round((sent24Count / created24Count) * 100) : 100;
  const lastSentAt = (sentPush24Res.data?.[0] as { sent_at?: string } | undefined)?.sent_at;
  const statusTone = failedCount > 0 ? "danger" : attentionCount > 0 ? "warning" : "success";

  return (
    <Container size="wide">
      <PageHeader
        eyebrow="Operations"
        title="管理者ダッシュボード"
        description="要対応項目とアプリの稼働状況を確認します。"
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
              <span className="font-semibold">要対応 {number(attentionCount)}件</span>
              <ToneBadge tone={statusTone}>
                {failedCount > 0 ? "通知エラーあり" : attentionCount > 0 ? "対応待ちあり" : "正常稼働"}
              </ToneBadge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">直近24時間の端末通知配信率 {deliveryRate}%</p>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {lastSentAt ? `最終送信: ${formatJst(lastSentAt)}` : "直近24時間の送信なし"}
        </div>
      </div>

      {queryErrors.length > 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden={true} />
          <span>一部の指標を取得できませんでした。0件表示には未取得が含まれる場合があります。</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <QuickLink href="/admin/users" label="ユーザー" icon={Users} />
        <QuickLink href="/admin/sessions" label="継続中" icon={Activity} />
        <QuickLink href="/admin/reports" label="通報" icon={Flag} />
        <QuickLink href="/admin/support" label="問い合わせ" icon={MessageSquareText} />
        <QuickLink href="/admin/announcements" label="お知らせ" icon={Megaphone} />
        <QuickLink href="/admin/badges" label="トロフィー" icon={Award} />
        <QuickLink href="/admin/audit" label="監査ログ" icon={ScrollText} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-card">
        <div className="grid grid-cols-2 divide-x divide-y divide-border sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <SummaryItem label="失敗通知" value={number(failedCount)} href="#push-status" alert={failedCount > 0} />
          <SummaryItem label="通報" value={number(openReportCount)} href="/admin/reports" />
          <SummaryItem label="問い合わせ" value={number(openSupportCount)} href="/admin/support" />
          <SummaryItem label="継続中" value={number(activeSessionsRes.count)} href="/admin/sessions" />
          <SummaryItem label="BAN中" value={number(activeBans.length)} href="/admin/users" />
          <SummaryItem label="ユーザー" value={number(usersRes.count)} href="/admin/users" />
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <div id="push-status" />
          <CardHeader>
            <SectionTitle
              title="端末通知"
              description="送信待ちは再試行対象。8回失敗した通知はエラーとして残ります。"
            />
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 divide-x divide-border border-b border-border pb-4 text-center">
              <div><div className="text-xs text-muted-foreground">24時間送信</div><div className="mt-1 text-lg font-bold">{number(sent24Count)}</div></div>
              <div><div className="text-xs text-muted-foreground">送信待ち</div><div className="mt-1 text-lg font-bold">{number(pendingPushRes.count)}</div></div>
              <div><div className="text-xs text-muted-foreground">配信率</div><div className="mt-1 text-lg font-bold">{deliveryRate}%</div></div>
            </div>
            {failedPushRows.length === 0 ? (
              <EmptyRow>失敗通知はありません。</EmptyRow>
            ) : (
              <div className="divide-y divide-border">
                {failedPushRows.map((row) => {
                  const type = failedTypes.get(row.notification_id);
                  return (
                    <div key={row.id} className="py-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span>{type ? NOTIFICATION_LABELS[type] ?? type : "通知"}</span>
                        <ToneBadge tone="danger">{row.attempts}回失敗</ToneBadge>
                        <time className="ml-auto text-xs font-normal text-muted-foreground">{formatJst(row.created_at)}</time>
                      </div>
                      <p className="mt-1 break-words text-xs text-red-600 dark:text-red-300">{shortText(row.last_error, 110)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        宛先: {row.recipient_id ? nameMap.get(row.recipient_id) ?? "NoName" : "なし"}（{maskId(row.recipient_id)}）
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <SectionTitle title="対応待ち" description="未完了の通報と問い合わせ" />
          </CardHeader>
          <CardBody>
            <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">通報</h3><Link href="/admin/reports" className="text-xs font-semibold text-primary hover:underline">一覧へ</Link></div>
            {reportRows.length === 0 ? <EmptyRow>対応待ちの通報はありません。</EmptyRow> : (
              <div className="mt-1 divide-y divide-border">
                {reportRows.slice(0, 2).map((row) => (
                  <Link key={row.id} href={`/admin/reports/${row.id}`} className="block py-3 hover:bg-secondary/20">
                    <div className="flex items-center gap-2"><span className="text-sm font-semibold">通報 #{row.id}</span><ToneBadge tone={row.status === "open" ? "danger" : "warning"}>{row.status === "open" ? "未対応" : "確認中"}</ToneBadge></div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{nameMap.get(row.reporter_id) ?? "NoName"}: {shortText(row.reason)}</p>
                  </Link>
                ))}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-border pt-4"><h3 className="text-sm font-semibold">問い合わせ</h3><Link href="/admin/support" className="text-xs font-semibold text-primary hover:underline">一覧へ</Link></div>
            {supportRows.length === 0 ? <EmptyRow>対応中の問い合わせはありません。</EmptyRow> : (
              <div className="mt-1 divide-y divide-border">
                {supportRows.slice(0, 2).map((row) => (
                  <Link key={row.id} href={`/admin/support/${row.id}`} className="block py-3 hover:bg-secondary/20">
                    <div className="flex items-center gap-2"><span className="min-w-0 truncate text-sm font-semibold">{row.subject}</span><ToneBadge tone="warning">対応中</ToneBadge></div>
                    <p className="mt-1 text-xs text-muted-foreground">{nameMap.get(row.user_id) ?? "NoName"} / {formatJst(row.last_message_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader><SectionTitle title="BAN中ユーザー" description="現在有効なBAN" href="/admin/users" /></CardHeader>
          <CardBody>
            {activeBans.length === 0 ? <EmptyRow>BAN中のユーザーはいません。</EmptyRow> : (
              <div className="divide-y divide-border">
                {activeBans.slice(0, 4).map((row) => (
                  <div key={row.user_id} className="flex items-start justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><Link href={`/users/${row.user_id}`} className="truncate text-sm font-semibold hover:underline">{nameMap.get(row.user_id) ?? "NoName"}</Link><ToneBadge tone="danger">BAN</ToneBadge></div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{row.ban_reason || "理由未設定"}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{row.banned_until ? formatJst(row.banned_until) : "無期限"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><SectionTitle title="利用状況" description="Supabase内の主要レコード" /></CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-x-5">
              {[
                ["終了セッション", number(endedSessionsRes.count), "全期間"],
                ["終了セッション", number(endedSessions7Res.count), "7日間"],
                ["生成通知", number(notificationsRes.count), "全期間"],
                ["生成通知", number(notifications24Res.count), "24時間"],
                ["端末購読", number(activeSubscriptionsRes.count), "有効"],
                ["登録ユーザー", number(usersRes.count), "現在"],
              ].map(([label, value, period]) => (
                <div key={`${label}-${period}`} className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-[11px] text-muted-foreground">{period}</div></div>
                  <div className="font-bold tabular-nums">{value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Gauge className="mt-0.5 size-4 shrink-0" aria-hidden={true} /><span>Egress・StorageクォータはSupabase Usage画面で確認します。</span></div>
          </CardBody>
        </Card>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-card px-4 py-4 sm:px-5">
        <form action={setSuppressGlobalStreakEndNotification} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <input type="hidden" name="enabled" value={suppressGlobalStreakEndNotification ? "false" : "true"} />
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary"><BellRing className="size-4" aria-hidden={true} /></div>
            <div><div className="text-sm font-semibold">デバッグ時の継続終了通知</div><p className="mt-1 text-xs text-muted-foreground">現在: {suppressGlobalStreakEndNotification ? "通知しない" : "通知する"}</p></div>
          </div>
          <button type="submit" className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-secondary/40">
            {suppressGlobalStreakEndNotification ? "通知を有効にする" : "通知を抑制する"}
          </button>
        </form>
      </div>
    </Container>
  );
}
