import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import ParticipantsClient from "../ranking/ParticipantsClient";

type Participant = {
  user_id: string;
  display_name: string;
  created_at: string;
  is_active: boolean;
  current_seconds: number;
  avatar_path?: string | null;
};

type ProfileRow = {
  id: string;
  avatar_path: string | null;
};

export default async function ParticipantsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

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

  const baseParticipants = (data ?? []) as Participant[];
  const userIds = Array.from(new Set(baseParticipants.map((p) => p.user_id)));
  const avatarMap = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, avatar_path")
      .in("id", userIds);

    (profiles ?? []).forEach((p: ProfileRow) => {
      avatarMap.set(p.id, p.avatar_path ?? null);
    });
  }

  const participants = baseParticipants.map((p) => ({
    ...p,
    avatar_path: avatarMap.get(p.user_id) ?? null,
  }));

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">参加者一覧</h1>
          <p className="text-sm text-muted-foreground">
            検索 / 継続中バッジ / DM開始 / プロフィール
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
``