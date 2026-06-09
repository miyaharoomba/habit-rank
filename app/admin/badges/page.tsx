import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { formatJst } from "@/lib/time";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type ProfileRow = {
  id: string;
  display_name: string | null;
  current_title_badge_id: string | null;
  avatar_path?: string | null;
};

type BadgeLite = {
  id: string;
  title: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

type OwnedBadgeRow = {
  badge_id: string;
  unlocked_at: string;
};

type ControlRow = {
  id: string;
  badge_id: string;
  ignore_before: string;
  reason: string;
  note: string | null;
  created_by: string;
  created_at: string;
  released_at: string | null;
};

type AuditRow = {
  id: number;
  actor_id: string;
  target_user_id: string;
  badge_id: string;
  action: string;
  reason: string;
  details: any;
  created_at: string;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function badgeRankLabel(rank: BadgeLite["badge_rank"]) {
  switch (rank) {
    case "platinum":
      return "プラチナ";
    case "gold":
      return "ゴールド";
    case "silver":
      return "シルバー";
    default:
      return "ブロンズ";
  }
}

function maskId(id: string) {
  return `${id.slice(0, 8)}…`;
}

export default async function AdminBadgesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const targetUserId = typeof sp.userId === "string" ? sp.userId.trim() : "";

  const supabase = await createClient();
  const admin = getAdminClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  async function grantBadgeAction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) redirect("/settings");

    const targetUserId = String(formData.get("target_user_id") ?? "").trim();
    const badgeId = String(formData.get("badge_id") ?? "").trim();
    const reason =
      String(formData.get("reason") ?? "").trim() || "運営による手動付与";

    if (!targetUserId || !badgeId) {
      throw new Error("target user / badge is required");
    }

    const { data: existing, error: checkErr } = await admin
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", targetUserId)
      .eq("badge_id", badgeId)
      .maybeSingle();

    if (checkErr) throw new Error(checkErr.message);

    if (!existing) {
      const { error: insertErr } = await admin.from("user_badges").insert({
        user_id: targetUserId,
        badge_id: badgeId,
      });

      if (insertErr && (insertErr as any).code !== "23505") {
        throw new Error(insertErr.message);
      }
    }

    await admin.from("admin_badge_audit_logs").insert({
      actor_id: user.id,
      target_user_id: targetUserId,
      badge_id: badgeId,
      action: "grant",
      reason,
      details: { silent: true },
    });

    revalidatePath("/admin/badges");
    revalidatePath("/badges");
    revalidatePath("/profile");
    revalidatePath(`/users/${targetUserId}`);
    revalidatePath(`/users/${targetUserId}/badges`);
    redirect(`/admin/badges?userId=${encodeURIComponent(targetUserId)}`);
  }

  async function revokeBadgeAction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) redirect("/settings");

    const targetUserId = String(formData.get("target_user_id") ?? "").trim();
    const badgeId = String(formData.get("badge_id") ?? "").trim();
    const reason =
      String(formData.get("reason") ?? "").trim() || "不正 / 誤取得のため剥奪";
    const note = String(formData.get("note") ?? "").trim() || null;
    const ignoreBeforeRaw = String(formData.get("ignore_before") ?? "").trim();
    const ignoreBefore = ignoreBeforeRaw
      ? new Date(ignoreBeforeRaw).toISOString()
      : new Date().toISOString();

    if (!targetUserId || !badgeId) {
      throw new Error("target user / badge is required");
    }

    const { error: deleteErr } = await admin
      .from("user_badges")
      .delete()
      .eq("user_id", targetUserId)
      .eq("badge_id", badgeId);

    if (deleteErr) throw new Error(deleteErr.message);

    const { data: profile } = await admin
      .from("profiles")
      .select("current_title_badge_id")
      .eq("id", targetUserId)
      .maybeSingle();

    if (profile?.current_title_badge_id === badgeId) {
      const { error: clearTitleErr } = await admin
        .from("profiles")
        .update({ current_title_badge_id: null })
        .eq("id", targetUserId);

      if (clearTitleErr) throw new Error(clearTitleErr.message);
    }

    const { data: existingControl, error: existingErr } = await admin
      .from("user_badge_admin_controls")
      .select("id")
      .eq("user_id", targetUserId)
      .eq("badge_id", badgeId)
      .is("released_at", null)
      .maybeSingle();

    if (existingErr) throw new Error(existingErr.message);

    if (existingControl?.id) {
      const { error: updateErr } = await admin
        .from("user_badge_admin_controls")
        .update({
          ignore_before: ignoreBefore,
          reason,
          note,
          created_by: user.id,
          created_at: new Date().toISOString(),
          released_at: null,
        })
        .eq("id", existingControl.id);

      if (updateErr) throw new Error(updateErr.message);
    } else {
      const { error: insertControlErr } = await admin
        .from("user_badge_admin_controls")
        .insert({
          user_id: targetUserId,
          badge_id: badgeId,
          ignore_before: ignoreBefore,
          reason,
          note,
          created_by: user.id,
        });

      if (insertControlErr) throw new Error(insertControlErr.message);
    }

    await admin.from("admin_badge_audit_logs").insert({
      actor_id: user.id,
      target_user_id: targetUserId,
      badge_id: badgeId,
      action: "revoke",
      reason,
      details: {
        note,
        ignore_before: ignoreBefore,
      },
    });

    revalidatePath("/admin/badges");
    revalidatePath("/admin");
    revalidatePath("/badges");
    revalidatePath("/profile");
    revalidatePath(`/users/${targetUserId}`);
    revalidatePath(`/users/${targetUserId}/badges`);
    redirect(`/admin/badges?userId=${encodeURIComponent(targetUserId)}`);
  }

  async function restoreBadgeControlAction(formData: FormData) {
    "use server";

    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin } = await supabase.rpc("is_admin");
    if (!isAdmin) redirect("/settings");

    const targetUserId = String(formData.get("target_user_id") ?? "").trim();
    const badgeId = String(formData.get("badge_id") ?? "").trim();
    const reason =
      String(formData.get("reason") ?? "").trim() ||
      "運営により判定起点リセットを解除";

    const { error } = await admin
      .from("user_badge_admin_controls")
      .update({ released_at: new Date().toISOString() })
      .eq("user_id", targetUserId)
      .eq("badge_id", badgeId)
      .is("released_at", null);

    if (error) throw new Error(error.message);

    await admin.from("admin_badge_audit_logs").insert({
      actor_id: user.id,
      target_user_id: targetUserId,
      badge_id: badgeId,
      action: "restore",
      reason,
      details: null,
    });

    revalidatePath("/admin/badges");
    revalidatePath("/badges");
    revalidatePath("/profile");
    revalidatePath(`/users/${targetUserId}`);
    revalidatePath(`/users/${targetUserId}/badges`);
    redirect(`/admin/badges?userId=${encodeURIComponent(targetUserId)}`);
  }

  // ----------------------------------------------------------
  // まず最初からユーザー一覧を出す
  // ----------------------------------------------------------
  const { data: allBadgesData, error: badgeMasterErr } = await admin
    .from("badges")
    .select("id, title, title_label, badge_rank")
    .order("created_at", { ascending: true });

  if (badgeMasterErr) throw new Error(badgeMasterErr.message);

  const allBadges = (allBadgesData ?? []) as BadgeLite[];
  const badgeMap = new Map<string, BadgeLite>();
  allBadges.forEach((b) => badgeMap.set(b.id, b));

  let userList: ProfileRow[] = [];
  {
    let queryBuilder = admin
      .from("profiles")
      .select("id, display_name, current_title_badge_id")
      .order("display_name", { ascending: true })
      .limit(50);

    if (query) {
      queryBuilder = queryBuilder.ilike("display_name", `%${query}%`);
    }

    const { data, error } = await queryBuilder;
    if (error) throw new Error(error.message);
    userList = (data ?? []) as ProfileRow[];
  }

  const userIds = userList.map((u) => u.id);
  const badgeCountMap = new Map<string, number>();

  if (userIds.length > 0) {
    const { data: badgeRows, error: badgeCountErr } = await admin
      .from("user_badges")
      .select("user_id")
      .in("user_id", userIds);

    if (badgeCountErr) throw new Error(badgeCountErr.message);

    (badgeRows ?? []).forEach((row: any) => {
      const uid = row.user_id as string;
      badgeCountMap.set(uid, (badgeCountMap.get(uid) ?? 0) + 1);
    });
  }

  // ----------------------------------------------------------
  // 対象ユーザー詳細
  // ----------------------------------------------------------
  let targetProfile: ProfileRow | null = null;
  let ownedBadges: Array<BadgeLite & { unlocked_at: string }> = [];
  let unownedBadges: BadgeLite[] = [];
  let activeControls: Array<
    ControlRow & {
      badge_title: string;
      badge_rank: BadgeLite["badge_rank"];
    }
  > = [];
  let badgeAuditLogs: Array<AuditRow & { badge_title: string }> = [];

  if (targetUserId) {
    const [
      { data: profile },
      { data: userBadges },
      { data: controls },
      { data: audits },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, display_name, current_title_badge_id")
        .eq("id", targetUserId)
        .maybeSingle(),
      admin
        .from("user_badges")
        .select("badge_id, unlocked_at")
        .eq("user_id", targetUserId)
        .order("unlocked_at", { ascending: false }),
      admin
        .from("user_badge_admin_controls")
        .select(
          "id, badge_id, ignore_before, reason, note, created_by, created_at, released_at"
        )
        .eq("user_id", targetUserId)
        .is("released_at", null)
        .order("created_at", { ascending: false }),
      admin
        .from("admin_badge_audit_logs")
        .select(
          "id, actor_id, target_user_id, badge_id, action, reason, details, created_at"
        )
        .eq("target_user_id", targetUserId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    targetProfile = (profile as ProfileRow | null) ?? null;

    const ownedBadgeIds = new Set<string>();
    ownedBadges = ((userBadges ?? []) as OwnedBadgeRow[])
      .map((row) => {
        ownedBadgeIds.add(row.badge_id);
        const badge = badgeMap.get(row.badge_id);
        if (!badge) return null;
        return {
          ...badge,
          unlocked_at: row.unlocked_at,
        };
      })
      .filter(Boolean) as Array<BadgeLite & { unlocked_at: string }>;

    unownedBadges = allBadges.filter((b) => !ownedBadgeIds.has(b.id));

    activeControls = ((controls ?? []) as ControlRow[]).map((row) => {
      const badge = badgeMap.get(row.badge_id);
      return {
        ...row,
        badge_title: badge?.title ?? row.badge_id,
        badge_rank: (badge?.badge_rank ?? "bronze") as BadgeLite["badge_rank"],
      };
    });

    badgeAuditLogs = ((audits ?? []) as AuditRow[]).map((row) => ({
      ...row,
      badge_title: badgeMap.get(row.badge_id)?.title ?? row.badge_id,
    }));
  }

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">トロフィー管理</h1>
          <p className="text-sm text-muted-foreground">
            ユーザー一覧から選択し、手動付与・剥奪・判定起点リセットを管理します。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="text-sm text-primary hover:underline">
            /admin
          </Link>
          <Link href="/app" className="text-sm text-primary hover:underline">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* 左: ユーザー一覧 */}
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">ユーザー一覧</h2>
            </CardHeader>
            <CardBody>
              <form className="flex flex-col gap-2">
                <input
                  type="text"
                  name="q"
                  defaultValue={query}
                  placeholder="表示名で検索"
                  className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"
                />
                <button
                  type="submit"
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  検索
                </button>
              </form>

              <div className="mt-4 space-y-2">
                {userList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    該当ユーザーが見つかりません。
                  </p>
                ) : (
                  userList.map((row) => {
                    const currentTitle =
                      row.current_title_badge_id &&
                      badgeMap.get(row.current_title_badge_id)?.title_label;

                    const badgeCount = badgeCountMap.get(row.id) ?? 0;
                    const selected = targetUserId === row.id;

                    return (
                      <Link
                        key={row.id}
                        href={`/admin/badges?userId=${encodeURIComponent(row.id)}${
                          query ? `&q=${encodeURIComponent(query)}` : ""
                        }`}
                        className={[
                          "block rounded-xl border p-3 transition",
                          selected
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background/60 hover:bg-secondary/30",
                        ].join(" ")}
                      >
                        <div className="font-semibold break-words">
                          {(row.display_name ?? "").trim() || "NoName"}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground break-all">
                          {maskId(row.id)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>称号: {currentTitle?.trim() || "なし"}</span>
                          <span>トロフィー数: {badgeCount}</span>
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 右: 対象ユーザー詳細 */}
        <div className="grid gap-4">
          {targetProfile ? (
            <>
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">対象ユーザー</h2>
                </CardHeader>
                <CardBody>
                  <div className="text-lg font-bold break-words">
                    {(targetProfile.display_name ?? "").trim() || "NoName"}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground break-all">
                    {targetProfile.id}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    現在の称号:{" "}
                    {targetProfile.current_title_badge_id
                      ? badgeMap.get(targetProfile.current_title_badge_id)?.title_label ||
                        "なし"
                      : "なし"}
                  </div>
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">獲得済みトロフィー</h2>
                </CardHeader>
                <CardBody>
                  {ownedBadges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      まだ獲得済みトロフィーがありません。
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {ownedBadges.map((badge) => (
                        <li
                          key={`${badge.id}-${badge.unlocked_at}`}
                          className="rounded-xl border border-border bg-background/60 p-4"
                        >
                          <div className="flex flex-col gap-3">
                            <div className="min-w-0">
                              <div className="font-semibold break-words">
                                {badge.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground break-words">
                                称号: {badge.title_label?.trim() || "なし"} /{" "}
                                {badgeRankLabel(badge.badge_rank)}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                                獲得日時: {formatJst(badge.unlocked_at)}
                              </div>

                              {targetProfile.current_title_badge_id === badge.id ? (
                                <div className="mt-2 inline-flex rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                                  現在の称号として設定中
                                </div>
                              ) : null}
                            </div>

                            <form
                              action={revokeBadgeAction}
                              className="grid gap-2 rounded-xl border border-border bg-background p-3"
                            >
                              <input
                                type="hidden"
                                name="target_user_id"
                                value={targetProfile.id}
                              />
                              <input type="hidden" name="badge_id" value={badge.id} />

                              <div>
                                <label className="mb-1 block text-sm font-medium">
                                  剥奪理由
                                </label>
                                <input
                                  type="text"
                                  name="reason"
                                  required
                                  defaultValue="不正 / 誤取得のため剥奪"
                                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                />
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium">
                                  判定起点（この日時より前は無視）
                                </label>
                                <input
                                  type="datetime-local"
                                  name="ignore_before"
                                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                                />
                                <div className="mt-1 text-xs text-muted-foreground">
                                  空欄なら「今」を起点にします。
                                </div>
                              </div>

                              <div>
                                <label className="mb-1 block text-sm font-medium">
                                  運営メモ（任意）
                                </label>
                                <textarea
                                  name="note"
                                  rows={2}
                                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-y"
                                />
                              </div>

                              <div className="flex gap-2">
                                <button
                                  type="submit"
                                  className="inline-flex items-center rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90"
                                >
                                  このトロフィーを剥奪する
                                </button>
                              </div>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">未獲得トロフィー（手動付与）</h2>
                </CardHeader>
                <CardBody>
                  {unownedBadges.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      すべてのトロフィーを獲得済みです。
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {unownedBadges.map((badge) => (
                        <li
                          key={badge.id}
                          className="rounded-xl border border-border bg-background/60 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold break-words">
                                {badge.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground break-words">
                                称号: {badge.title_label?.trim() || "なし"} /{" "}
                                {badgeRankLabel(badge.badge_rank)}
                              </div>
                            </div>

                            <form action={grantBadgeAction} className="grid gap-2 sm:w-[320px]">
                              <input
                                type="hidden"
                                name="target_user_id"
                                value={targetProfile.id}
                              />
                              <input type="hidden" name="badge_id" value={badge.id} />

                              <input
                                type="text"
                                name="reason"
                                defaultValue="運営による手動付与"
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                              />

                              <button
                                type="submit"
                                className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                              >
                                このトロフィーを手動付与
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">有効な判定起点リセット</h2>
                </CardHeader>
                <CardBody>
                  {activeControls.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      現在有効な管理者制御はありません。
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {activeControls.map((row) => (
                        <li
                          key={row.id}
                          className="rounded-xl border border-border bg-background/60 p-4"
                        >
                          <div className="font-semibold break-words">
                            {row.badge_title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            ランク: {badgeRankLabel(row.badge_rank)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            ignore_before: {formatJst(row.ignore_before)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            理由: {row.reason}
                          </div>
                          {row.note ? (
                            <div className="mt-1 text-xs text-muted-foreground break-words">
                              メモ: {row.note}
                            </div>
                          ) : null}
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            設定日時: {formatJst(row.created_at)}
                          </div>

                          <form
                            action={restoreBadgeControlAction}
                            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
                          >
                            <input
                              type="hidden"
                              name="target_user_id"
                              value={targetProfile.id}
                            />
                            <input
                              type="hidden"
                              name="badge_id"
                              value={row.badge_id}
                            />
                            <div className="flex-1">
                              <label className="mb-1 block text-sm font-medium">
                                復元理由
                              </label>
                              <input
                                type="text"
                                name="reason"
                                defaultValue="運営により判定起点リセットを解除"
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                              />
                            </div>
                            <button
                              type="submit"
                              className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                            >
                              制御を解除する
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">最近のトロフィー監査ログ</h2>
                </CardHeader>
                <CardBody>
                  {badgeAuditLogs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      まだトロフィー監査ログがありません。
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {badgeAuditLogs.map((row) => (
                        <li
                          key={row.id}
                          className="rounded-xl border border-border bg-background/60 p-4"
                        >
                          <div className="font-semibold break-words">
                            {row.action} / {row.badge_title}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground break-words">
                            理由: {row.reason}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {formatJst(row.created_at)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </>
          ) : (
            <Card>
              <CardBody>
                <p className="text-sm text-muted-foreground">
                  左のユーザー一覧から対象ユーザーを選んでください。
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </Container>
  );
}