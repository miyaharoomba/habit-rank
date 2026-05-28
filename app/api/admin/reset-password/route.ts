// app/api/admin/reset-password/route.ts
import { NextResponse } from "next/server";
import { createClient as createSbJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  // 1) セッション（通常のSSR client）
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 2) 管理者チェック（public.is_admin()）
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  // 3) 入力
  const body = await req.json().catch(() => null);
  const targetUserId = String(body?.user_id ?? "").trim();
  if (!targetUserId) {
    return NextResponse.json({ ok: false, error: "user_id is required" }, { status: 400 });
  }

  // 4) service_role で Admin API クライアントを作成（サーバー専用）[4](https://deepwiki.com/supabase/auth-js/7.2-gotrueadminapi-api)[3](https://deepwiki.com/supabase/auth-js/2.2-admin-api)
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!serviceKey) {
    return NextResponse.json(
      { ok: false, error: "SUPABASE_SERVICE_ROLE_KEY is missing" },
      { status: 500 }
    );
  }

  const adminClient = createSbJsClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 5) 対象ユーザーの email を取得（Admin API）
  const { data: udata, error: getErr } = await adminClient.auth.admin.getUserById(targetUserId);
  if (getErr || !udata?.user?.email) {
    return NextResponse.json(
      { ok: false, error: getErr?.message ?? "user not found or no email" },
      { status: 400 }
    );
  }
  const email = udata.user.email;

  // 6) リセットメール送信（Supabase公式：resetPasswordForEmail）[1](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail)[2](https://unwiredlearning.com/blog/extend-tailwind-css)
  const origin = new URL(req.url).origin;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
  const redirectTo = `${siteUrl}/auth/reset-password`;

  const { error: resetErr } = await adminClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (resetErr) {
    return NextResponse.json({ ok: false, error: resetErr.message }, { status: 400 });
  }

  // 7) 監査ログ（管理者が何をしたか記録）
  await supabase.from("admin_audit_logs").insert({
    actor_id: user.id,
    action: "RESET_PASSWORD",
    target_user_id: targetUserId,
    details: { email, redirectTo },
  });

  return NextResponse.json({ ok: true });
}