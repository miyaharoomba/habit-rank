import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import AdminUserSubmitButton from "./AdminUserSubmitButton";
import {
  AdminLink,
  MainLink,
  PageHeader,
  SettingsLink,
} from "@/app/components/AppPageHeader";

type ProfileRow = {
  id: string;
  display_name: string | null;
  created_at: string;
};

type FlagRow = {
  user_id: string;
  is_banned: boolean;
  ban_reason: string | null;
  banned_until: string | null;
  updated_at: string;
  updated_by: string | null;
};

type UserFlagPayload = {
  user_id: string;
  is_banned: boolean;
  ban_reason: string | null;
  banned_until: string | null;
  updated_by: string;
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
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

function maskId(id: string) {
  return id ? `${id.slice(0, 8)}…` : "";
}

function formatJst(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function revalidateUserAdminViews() {
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath("/participants");
  revalidatePath("/ranking");
}

export default async function AdminUsersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  // -------------------------
  // Server Actions
  // -------------------------
  async function banAction(formData: FormData) {
    "use server";
    const targetId = String(formData.get("user_id") ?? "");
    const reason = String(formData.get("reason") ?? "").trim();
    const until = String(formData.get("until") ?? "").trim();

    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");
    if (!targetId) throw new Error("target user is missing");
    if (targetId === user.id) throw new Error("自分自身はBANできません。");

    const payload: UserFlagPayload = {
      user_id: targetId,
      is_banned: true,
      ban_reason: reason || "admin_ban",
      banned_until: until || null,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from("user_flags")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "BAN_USER",
      target_user_id: targetId,
      details: { reason: payload.ban_reason, banned_until: payload.banned_until },
    });

    revalidateUserAdminViews();
    redirect("/admin/users");
  }

  async function unbanAction(formData: FormData) {
    "use server";
    const targetId = String(formData.get("user_id") ?? "");

    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");
    if (!targetId) throw new Error("target user is missing");
    if (targetId === user.id) throw new Error("自分自身はBAN解除できません。");

    const payload: UserFlagPayload = {
      user_id: targetId,
      is_banned: false,
      ban_reason: null,
      banned_until: null,
      updated_by: user.id,
    };

    const { error } = await supabase
      .from("user_flags")
      .upsert(payload, { onConflict: "user_id" });
    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "UNBAN_USER",
      target_user_id: targetId,
      details: {},
    });

    revalidateUserAdminViews();
    redirect("/admin/users");
  }

  async function resetPasswordAction(formData: FormData) {
    "use server";
    const targetId = String(formData.get("user_id") ?? "");

    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");
    if (!targetId) throw new Error("target user is missing");

    const adminClient = getAdminClient();

    const { data: udata, error: getErr } = await adminClient.auth.admin.getUserById(targetId);
    if (getErr || !udata?.user?.email) throw new Error(getErr?.message ?? "user not found or no email");
    const email = udata.user.email;

    const site =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const redirectTo = `${site}/auth/reset-password`;

    const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (resetErr) throw new Error(resetErr.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "RESET_PASSWORD",
      target_user_id: targetId,
      details: { email, redirectTo },
    });

    redirect("/admin/users");
  }

  async function deleteUserAction(formData: FormData) {
    "use server";
    const targetId = String(formData.get("user_id") ?? "");

    const supabase = await createClient();
    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");
    if (!targetId) throw new Error("target user is missing");
    if (targetId === user.id) throw new Error("自分自身は削除できません。");

    const adminClient = getAdminClient();

    const { data: targetProfile } = await adminClient
      .from("profiles")
      .select("id, display_name")
      .eq("id", targetId)
      .maybeSingle();

    const { error: flagErr } = await adminClient.from("user_flags").upsert(
      {
        user_id: targetId,
        is_banned: true,
        ban_reason: "admin_deleted",
        banned_until: null,
        updated_by: user.id,
      } satisfies UserFlagPayload,
      { onConflict: "user_id" }
    );
    if (flagErr) throw new Error(flagErr.message);

    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(targetId);
    if (deleteErr) throw new Error(deleteErr.message);

    const { error: cleanupErr } = await adminClient
      .from("profiles")
      .delete()
      .eq("id", targetId);
    if (cleanupErr) throw new Error(cleanupErr.message);

    const { error: auditErr } = await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "DELETE_USER",
      target_user_id: null,
      details: {
        target_user_id: targetId,
        display_name: targetProfile?.display_name ?? null,
      },
    });

    if (auditErr) {
      console.error("Failed to write DELETE_USER audit log", auditErr);
    }

    revalidateUserAdminViews();
    redirect("/admin/users");
  }
  // -------------------------
  // /Server Actions
  // -------------------------

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, display_name, created_at")
    .order("created_at", { ascending: false })
    .limit(300);

  if (pErr) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold">ユーザー管理</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {pErr.message}</p>
            <div className="mt-3">
              <AdminLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (profiles ?? []) as ProfileRow[];

  const { data: flags } =
    rows.length > 0
      ? await supabase
          .from("user_flags")
          .select("user_id, is_banned, ban_reason, banned_until, updated_at, updated_by")
          .in("user_id", rows.map((r) => r.id))
      : { data: [] };

  const flagMap = new Map<string, FlagRow>();
  ((flags ?? []) as FlagRow[]).forEach((f) => flagMap.set(f.user_id, f));

  return (
    <Container>
      <PageHeader
        title="ユーザー管理"
        description="一覧、BAN、解除、アカウント削除、パスワードリセットを行います。"
        actions={
          <>
            <AdminLink />
            <SettingsLink />
            <MainLink />
          </>
        }
      />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">ユーザー一覧（最大300）</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                BANはランキング非表示 / 削除はAuthアカウント削除
              </span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-3">
              {rows.map((p) => {
                const f = flagMap.get(p.id);
                const name = (p.display_name ?? "").trim() || "NoName";
                const banned = Boolean(f?.is_banned);
                const isSelf = p.id === user.id;

                return (
                  <div key={p.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold truncate">{name}</div>
                          {banned && (
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive whitespace-nowrap">
                              BAN中
                            </span>
                          )}
                        </div>

                        <div className="mt-1 text-xs text-muted-foreground">
                          id: <span className="font-mono">{maskId(p.id)}</span> / 登録:{" "}
                          <span className="tabular-nums">{formatJst(p.created_at)}</span>
                        </div>

                        {banned && (
                          <div className="mt-1 text-xs text-muted-foreground">
                            理由: {f?.ban_reason ?? "-"} / 期限:{" "}
                            <span className="tabular-nums">
                              {f?.banned_until ? formatJst(f.banned_until) : "なし"}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 sm:w-[380px]">
                        {!banned ? (
                          <form action={banAction} className="space-y-2">
                            <input type="hidden" name="user_id" value={p.id} />
                            <div className="flex gap-2">
                              <input
                                name="reason"
                                placeholder="BAN理由（任意）"
                                className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                              />
                              <input
                                name="until"
                                placeholder="期限ISO（任意）"
                                className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                              />
                            </div>
                            <AdminUserSubmitButton
                              idleLabel={isSelf ? "自分はBAN不可" : "BANする"}
                              pendingLabel="BAN中..."
                              variant="danger"
                              icon="ban"
                              disabled={isSelf}
                              confirmMessage={`${name} をBANします。ランキングから非表示になります。`}
                            />
                          </form>
                        ) : (
                          <form action={unbanAction}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <AdminUserSubmitButton
                              idleLabel={isSelf ? "自分は解除不可" : "BAN解除"}
                              pendingLabel="解除中..."
                              variant="primary"
                              icon="unban"
                              disabled={isSelf}
                            />
                          </form>
                        )}

                        <form action={resetPasswordAction}>
                          <input type="hidden" name="user_id" value={p.id} />
                          <AdminUserSubmitButton
                            idleLabel="パスワードリセットメール送信"
                            pendingLabel="送信中..."
                            icon="reset"
                          />
                        </form>

                        <form action={deleteUserAction}>
                          <input type="hidden" name="user_id" value={p.id} />
                          <AdminUserSubmitButton
                            idleLabel={isSelf ? "自分は削除不可" : "アカウント削除"}
                            pendingLabel="削除中..."
                            variant="outline"
                            icon="delete"
                            disabled={isSelf}
                            confirmMessage={`${name} のアカウントを削除します。この操作は元に戻せません。`}
                          />
                        </form>

                        <div className="text-[11px] text-muted-foreground">
                          ※ 削除はAuthアカウントとプロフィールの削除を試みます。パスワードは表示しません。
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {rows.length === 0 && (
                <p className="text-sm text-muted-foreground">ユーザーがいません。</p>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
