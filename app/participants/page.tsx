import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

// 既存の参加者コンポーネント（検索/継続中バッジ/DMボタン）を再利用
import ParticipantsClient from "../ranking/ParticipantsClient";

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
};

export default async function ParticipantsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // RPCで参加者一覧（継続中情報付き）を取得（SupabaseはDB関数をrpcで呼べる）[2](https://attendence-system-1910.vercel.app/users/login)[3](https://qiita.com/H-Iida/items/fe4fe5f18b2ca5bbf6d4)
  const { data, error } = await supabase.rpc("get_participants_status", {
    limit_count: 200,
  });

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">参加者一覧</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
            <div className="mt-3 flex gap-3">
              <Link className="text-sm text-primary hover:underline" href="/app">
                ← /app
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/ranking">
                /ranking
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const participants = (data ?? []) as Participant[];

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">参加者一覧</h1>
          <p className="text-sm text-muted-foreground">
            検索 / 継続中バッジ / DM開始
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {/* Linkはアプリ内遷移の基本 [1](https://zenn.dev/exmedia/articles/install-npm-on-windows11-via-winget) */}
          <Link className="text-sm text-primary hover:underline" href="/app">
            ← /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/dm">
            /dm
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/ranking">
            /ranking
          </Link>
        </div>
      </header>

      {/* 本体 */}
      <div className="mt-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">参加者（最大200）</h2>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                継続中も表示
              </span>
            </div>
          </CardHeader>

          <CardBody>
            <ParticipantsClient participants={participants} />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}