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
  title_label?: string | null;
  title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
};

type ProfileRow = {
  id: string;
  avatar_path: string | null;
  current_title_badge_id: string | null;
};

type BadgeLiteRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
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
  const titleBadgeIdMap = new Map<string, string | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, avatar_path, current_title_badge_id")
      .in("id", userIds);

    if (profilesErr) {
      throw new Error(profilesErr.message);
    }

    (profiles ?? []).forEach((p: any) => {
      const row = p as ProfileRow;
      avatarMap.set(row.id, row.avatar_path ?? null);
      titleBadgeIdMap.set(row.id, row.current_title_badge_id ?? null);
    });
  }

  const badgeIds = Array.from(
    new Set(Array.from(titleBadgeIdMap.values()).filter(Boolean))
  ) as string[];

  const badgeMap = new Map<string, BadgeLiteRow>();

  if (badgeIds.length > 0) {
    const { data: badges, error: badgesErr } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);

    if (badgesErr) {
      throw new Error(badgesErr.message);
    }

    (badges ?? []).forEach((b: any) => {
      const row = b as BadgeLiteRow;
      badgeMap.set(row.id, row);
    });
  }

  const participants = baseParticipants.map((p) => {
    const badgeId = titleBadgeIdMap.get(p.user_id) ?? null;
    const badge = badgeId ? badgeMap.get(badgeId) ?? null : null;

    return {
      ...p,
      avatar_path: avatarMap.get(p.user_id) ?? null,
      title_label: badge?.title_label?.trim() || null,
      title_rank: badge?.badge_rank ?? null,
    };
  });

  return (
    <Container>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">参加者一覧</h1>
          <p className="text-sm text-muted-foreground">
            検索 / 継続中バッジ / DM開始 / プロフィール
          </p>
        </div>

        <div className="flex gap-3">
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
            <h2 className="font-semibold">参加者（最大200）</h2>
          </CardHeader>
          <CardBody>
            <ParticipantsClient participants={participants} myUserId={user.id} />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
