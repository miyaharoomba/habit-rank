import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/auth/sign-in");

  // 表示名（任意）
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "NoName";

  // ✅ 管理者判定：public.is_admin() をRPCで呼ぶ [2](https://tiger9810.github.io/2025/next_error/)
  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  const admin = !adminErr && Boolean(isAdmin);

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <p className="text-sm text-muted-foreground">アカウント / ナビゲーション</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/app" className="text-sm text-primary hover:underline whitespace-nowrap">
            /app
          </Link>
          <Link href="/dm" className="text-sm text-primary hover:underline whitespace-nowrap">
            /dm
          </Link>
          <Link href="/ranking" className="text-sm text-primary hover:underline whitespace-nowrap">
            /ranking
          </Link>
          <Link
            href="/participants"
            className="text-sm text-primary hover:underline whitespace-nowrap"
          >
            /participants
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        {/* アカウント */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">アカウント</h2>
          </CardHeader>
          <CardBody>
            <div className="text-sm">
              <span className="text-muted-foreground">表示名：</span>
              <span className="font-semibold">{displayName}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              user_id: <span className="font-mono">{user.id}</span>
            </div>
          </CardBody>
        </Card>

        {/* ✅ 追加：管理者コンソール（管理者だけ表示） */}
        {admin && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold">管理者</h2>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-muted-foreground">
                管理者コンソールへ移動できます。
              </p>
              <div className="mt-3">
                <Link
                  href="/admin"
                  className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-semibold hover:bg-secondary/60"
                >
                  管理者コンソールを開く
                </Link>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                ※ 管理者のみ表示（is_admin() 判定）
              </div>
            </CardBody>
          </Card>
        )}

        {/* ログアウト（リンクだけ置く。既存のサインアウト実装に合わせて変えてOK） */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold">セッション</h2>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">
              ログアウトは認証ページ側の導線を使ってください。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/auth/sign-in"
                className="text-sm text-primary hover:underline whitespace-nowrap"
              >
                サインイン画面へ
              </Link>
              <Link
                href="/app"
                className="text-sm text-primary hover:underline whitespace-nowrap"
              >
                /appへ戻る
              </Link>
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}