import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const sp = await searchParams;

  const code = typeof sp.code === "string" ? sp.code : null;
  const errMsgRaw = typeof sp.error === "string" ? sp.error : "";
  const errMsg = errMsgRaw ? decodeURIComponent(errMsgRaw) : "";

  // PKCEの code があればセッションへ交換（失敗してもUIで案内）
  if (code) {
    try {
      // @ts-ignore
      await supabase.auth.exchangeCodeForSession(code);
    } catch {
      // noop
    }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  async function updatePasswordAction(formData: FormData): Promise<void> {
    "use server";

    const password = String(formData.get("password") ?? "");
    const password2 = String(formData.get("password2") ?? "");

    const backWithError = (msg: string) => {
      redirect(`/auth/reset-password?error=${encodeURIComponent(msg)}`);
    };

    if (password.length < 8) backWithError("パスワードは8文字以上にしてください。");
    if (password !== password2) backWithError("確認用パスワードが一致しません。");

    const supabase = await createClient();

    // セッションが有効な状態でパスワード更新
    // @ts-ignore
    const { error } = await supabase.auth.updateUser({ password });

    if (error) backWithError(error.message);

    redirect("/app");
  }

  if (!user) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">パスワード再設定</h1>
          </CardHeader>
          <CardBody>
            {errMsg && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errMsg}
              </div>
            )}

            <p className="text-sm text-destructive">
              リセットリンクが無効か期限切れの可能性があります。
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="text-sm text-primary hover:underline" href="/auth/sign-in">
                サインインへ
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/settings">
                設定へ
              </Link>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              管理者がリセットを送った場合は、届いたメールのリンクをもう一度開いてください。
            </p>
          </CardBody>
        </Card>
      </Container>
    );
  }

  return (
    <Container>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">パスワード再設定</h1>
          <p className="text-sm text-muted-foreground">新しいパスワードを設定してください</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">新しいパスワード</h2>
          </CardHeader>
          <CardBody>
            {errMsg && (
              <div className="mb-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errMsg}
              </div>
            )}

            <form action={updatePasswordAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">パスワード（8文字以上）</label>
                <input
                  name="password"
                  type="password"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                  placeholder="********"
                  required
                  minLength={8}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">パスワード（確認）</label>
                <input
                  name="password2"
                  type="password"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                  placeholder="********"
                  required
                  minLength={8}
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
              >
                パスワードを更新
              </button>

              <p className="text-xs text-muted-foreground">更新後は /app に移動します。</p>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}