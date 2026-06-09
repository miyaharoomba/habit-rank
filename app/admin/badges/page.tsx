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

export default async function AdminBadgesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const query = typeof sp.q === "string" ? sp.q.trim() : "";
  const targetUserId = typeof sp.userId === "string" ? sp.userId.trim() : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

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
    const reason = String(formData.get("reason") ?? "").trim() || "不正 / 誤取得のため剥奪";
    const note = String(formData.get("note") ?? "").trim() || null;
    const ignoreBeforeRaw = String(formData.get("ignore_before") ?? "").trim();
    const ignoreBefore = ignoreBeforeRaw ? new Date(ignoreBeforeRaw).toISOString() : new Date().toISOString();

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
    const reason = String(formData.get("reason") ?? "").trim() || "運営により判定起点リセットを解除";

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

  let searchResults: ProfileRow[] = [];
  if (query) {
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name, current_title_badge_id")
      .ilike("display_name", `%${query}%`)
      .limit(20);
    searchResults = (data ?? []) as ProfileRow[];
  }

  let targetProfile: ProfileRow | null = null;
  let ownedBadges: Array<BadgeLite & { unlocked_at: string }> = [];
  let activeControls: Array<ControlRow & { badge_title: string; badge_rank: BadgeLite["badge_rank"] }> = [];
  let badgeAuditLogs: Array<AuditRow & { badge_title: string }> = [];

  if (targetUserId) {
    const admin = getAdminClient();

    const [{ data: profile }, { data: userBadges }, { data: badgeMaster }, { data: controls }, { data: audits }] =
      await Promise.all([
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
          .from("badges")
          .select("id, title, title_label, badge_rank")
          .order("created_at", { ascending: true }),
        admin
          .from("user_badge_admin_controls")
          .select("id, badge_id, ignore_before, reason, note, created_by, created_at, released_at")
          .eq("user_id", targetUserId)
          .is("released_at", null)
          .order("created_at", { ascending: false }),
        admin
          .from("admin_badge_audit_logs")
          .select("id, actor_id, target_user_id, badge_id, action, reason, details, created_at")
          .eq("target_user_id", targetUserId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

    targetProfile = (profile as ProfileRow | null) ?? null;

    const badgeMap = new Map<string, BadgeLite>();
    ((badgeMaster ?? []) as BadgeLite[]).forEach((b) => badgeMap.set(b.id, b));

    ownedBadges = ((userBadges ?? []) as OwnedBadgeRow[])
      .map((row) => {
        const badge = badgeMap.get(row.badge_id);
        if (!badge) return null;
        return { ...badge, unlocked_at: row.unlocked_at };
      })
      .filter(Boolean) as Array<BadgeLite & { unlocked_at: string }>;

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
            誤取得・不正取得したトロフィーの剥奪と、判定起点リセットを管理します。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="text-sm text-primary hover:underline">/admin</Link>
          <Link href="/app" className="text-sm text-primary hover:underline">/app</Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">ユーザー検索</h2>
          </CardHeader>
          <CardBody>
            <form className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                name="q"
                defaultValue={query}
                placeholder="表示名で検索"
                className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm"
              />
              <button
                type="submit"
                className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                検索
              </button>
            </form>

            {searchResults.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {searchResults.map((row) => (
                  <li key={row.id} className="rounded-lg border border-border bg-background/60 px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold break-words">{(row.display_name ?? "").trim() || "NoName"}</div>
                        <div className="mt-1 text-xs text-muted-foreground break-all">{row.id}</div>
                      </div>
                      <Link
                        href={`/admin/badges?userId=${encodeURIComponent(row.id)}`}
                        className="text-sm text-primary hover:underline"
                      >
                        このユーザーを開く →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            ) : query ? (
              <p className="mt-4 text-sm text-muted-foreground">該当ユーザーが見つかりません。</p>
            ) : null}
          </CardBody>
        </Card>

        {targetProfile ? (
          <>
            <Card>
              <CardHeader>
                <h2 className="font-semibold">対象ユーザー</h2>
              </CardHeader>
              <CardBody>
                <div className="text-lg font-bold break-words">{(targetProfile.display_name ?? "").trim() || "NoName"}</div>
                <div className="mt-1 text-xs text-muted-foreground break-all">{targetProfile.id}</div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold">獲得済みトロフィー</h2>
              </CardHeader>
              <CardBody>
                {ownedBadges.length === 0 ? (
                  <p className="text-sm text-muted-foreground">まだ獲得済みトロフィーがありません。</p>
                ) : (
                  <ul className="space-y-3">
                    {ownedBadges.map((badge) => (
                      <li key={`${badge.id}-${badge.unlocked_at}`} className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="font-semibold break-words">{badge.title}</div>
                              <div className="mt-1 text-xs text-muted-foreground break-words">
                                称号: {badge.title_label?.trim() || "なし"} / {badgeRankLabel(badge.badge_rank)}
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
                          </div>

                          <form action={revokeBadgeAction} className="grid gap-2 rounded-xl border border-border bg-background p-3">
                            <input type="hidden" name="target_user_id" value={targetProfile.id} />
                            <input type="hidden" name="badge_id" value={badge.id} />

                            <div>
                              <label className="mb-1 block text-sm font-medium">剥奪理由</label>
                              <input
                                type="text"
                                name="reason"
                                required
                                defaultValue="不正 / 誤取得のため剥奪"
                                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                              />
                            </div>

                            <div>
                              <label className="mb-1 block text-sm font-medium">判定起点（この日時より前は無視）</label>
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
                              <label className="mb-1 block text-sm font-medium">運営メモ（任意）</label>
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
                <h2 className="font-semibold">有効な判定起点リセット</h2>
              </CardHeader>
              <CardBody>
                {activeControls.length === 0 ? (
                  <p className="text-sm text-muted-foreground">現在有効な管理者制御はありません。</p>
                ) : (
                  <ul className="space-y-3">
                    {activeControls.map((row) => (
                      <li key={row.id} className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="font-semibold break-words">{row.badge_title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          ランク: {badgeRankLabel(row.badge_rank)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          ignore_before: {formatJst(row.ignore_before)}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground break-words">理由: {row.reason}</div>
                        {row.note ? (
                          <div className="mt-1 text-xs text-muted-foreground break-words">メモ: {row.note}</div>
                        ) : null}
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                          設定日時: {formatJst(row.created_at)}
                        </div>

                        <form action={restoreBadgeControlAction} className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                          <input type="hidden" name="target_user_id" value={targetProfile.id} />
                          <input type="hidden" name="badge_id" value={row.badge_id} />
                          <div className="flex-1">
                            <label className="mb-1 block text-sm font-medium">復元理由</label>
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
                  <p className="text-sm text-muted-foreground">まだトロフィー監査ログがありません。</p>
                ) : (
                  <ul className="space-y-3">
                    {badgeAuditLogs.map((row) => (
                      <li key={row.id} className="rounded-xl border border-border bg-background/60 p-4">
                        <div className="font-semibold break-words">{row.action} / {row.badge_title}</div>
                        <div className="mt-1 text-xs text-muted-foreground break-words">理由: {row.reason}</div>
                        <div className="mt-1 text-xs text-muted-foreground tabular-nums">{formatJst(row.created_at)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </>
        ) : null}
      </div>
    </Container>
  );
}
