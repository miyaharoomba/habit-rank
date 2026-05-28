import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

function maskId(id: string) {
  return id ? `${id.slice(0, 8)}…` : "";
}

function formatJst(iso: string) {
  return new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
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

    const payload: any = {
      user_id: targetId,
      is_banned: true,
      ban_reason: reason || "admin_ban",
      banned_until: until || null,
      updated_by: user.id,
    };

    const { error } = await supabase.from("user_flags").upsert(payload);
    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "BAN_USER",
      target_user_id: targetId,
      details: { reason: payload.ban_reason, banned_until: payload.banned_until },
    });

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

    const payload: any = {
      user_id: targetId,
      is_banned: false,
      ban_reason: null,
      banned_until: null,
      updated_by: user.id,
    };

    const { error } = await supabase.from("user_flags").upsert(payload);
    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "UNBAN_USER",
      target_user_id: targetId,
      details: {},
    });

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

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

    const adminClient = createAdminClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 対象ユーザーのメール取得（Admin APIはサーバー専用）[3](https://github.com/NozawaDaishi/attend-app)[4](https://attendance-manager-sigma.vercel.app/)
    const { data: udata, error: getErr } = await adminClient.auth.admin.getUserById(targetId);
    if (getErr || !udata?.user?.email) throw new Error(getErr?.message ?? "user not found or no email");
    const email = udata.user.email;

    // リセットメール送信（公式の resetPasswordForEmail）[1](https://github.com/vipulmesh/AttendEase)[2](https://pinggy.io/blog/how_to_share_a_nextjs_app_from_localhost/)
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
              <Link className="text-sm text-primary hover:underline" href="/admin">
                ← /admin
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (profiles ?? []) as ProfileRow[];

  const { data: flags } = await supabase
    .from("user_flags")
    .select("user_id, is_banned, ban_reason, banned_until, updated_at, updated_by")
    .in("user_id", rows.map((r) => r.id));

  const flagMap = new Map<string, FlagRow>();
  (flags ?? []).forEach((f: any) => flagMap.set(f.user_id, f as FlagRow));

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ユーザー管理</h1>
          <p className="text-sm text-muted-foreground">
            一覧 / BAN / 解除 / パスワードリセット（メール送信）
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

      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">ユーザー一覧（最大300）</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                BANは user_flags / リセットはメール送信
              </span>
            </div>
          </CardHeader>

          <CardBody>
            <div className="space-y-3">
              {rows.map((p) => {
                const f = flagMap.get(p.id);
                const name = (p.display_name ?? "").trim() || "NoName";
                const banned = Boolean(f?.is_banned);

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
                            <button
                              type="submit"
                              className="w-full rounded-lg bg-destructive text-destructive-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
                            >
                              BANする
                            </button>
                          </form>
                        ) : (
                          <form action={unbanAction}>
                            <input type="hidden" name="user_id" value={p.id} />
                            <button
                              type="submit"
                              className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
                            >
                              BAN解除
                            </button>
                          </form>
                        )}

                        <form action={resetPasswordAction}>
                          <input type="hidden" name="user_id" value={p.id} />
                          <button
                            type="submit"
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold hover:bg-secondary/40"
                          >
                            パスワードリセットメール送信
                          </button>
                        </form>

                        <div className="text-[11px] text-muted-foreground">
                          ※ パスワードは表示しません。メールで再設定させます。[1](https://github.com/vipulmesh/AttendEase)[2](https://pinggy.io/blog/how_to_share_a_nextjs_app_from_localhost/)
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
``