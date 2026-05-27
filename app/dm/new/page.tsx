import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";

export default async function DmNewPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { u } = await searchParams;

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/auth/sign-in"); // サーバー側redirectOK [1](https://stackoverflow.com/questions/76509197/unable-to-delete-cookie-using-next-js-server-side-action)
  if (!u) redirect("/dm");

  // RPCで「スレッド作成 or 既存取得」
  const { data: threadId, error } = await supabase.rpc("create_or_get_dm", {
    other_user: u,
  }); // SupabaseはDB関数をRPCで呼べる [2](https://github.com/orgs/supabase/discussions/28380)[3](https://github.com/supabase/server/blob/main/docs/ssr-frameworks.md)

  if (error || !threadId) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">DM開始</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">
              DMスレッド作成に失敗: {error?.message ?? "unknown"}
            </p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/ranking">
                ← ランキングへ戻る
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/dm">
                DM一覧へ
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              ※ Supabase側の関数(create_or_get_dm)や権限が原因のことが多い
            </p>
          </CardBody>
        </Card>
      </Container>
    );
  }

  redirect(`/dm/${threadId}`); // 成功したらスレッドへ [1](https://stackoverflow.com/questions/76509197/unable-to-delete-cookie-using-next-js-server-side-action)
}
