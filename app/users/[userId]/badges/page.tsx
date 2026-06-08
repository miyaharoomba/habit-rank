import { redirect } from "next/navigation";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BadgeCollectionClient from "@/app/badges/BadgeCollectionClient";

type BadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  description: string;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  condition_type: string;
  condition_value: number;
  icon_path: string | null;
};

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: string;
};

export default async function UserBadgesPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  if (userId === user.id) {
    redirect("/badges");
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    throw new Error(profileErr.message);
  }

  if (!profile) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">トロフィー</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">
              ユーザーが見つかりません。
            </p>
            <div className="mt-3 flex gap-3">
              <Link
                href="/participants"
                className="text-sm text-primary hover:underline"
              >
                /participants
              </Link>
              <Link
                href="/app"
                className="text-sm text-primary hover:underline"
              >
                /app
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const [
    { data: badges, error: badgesErr },
    { data: earned, error: earnedErr },
  ] = await Promise.all([
    supabase
      .from("badges")
      .select(
        "id, title, title_label, description, badge_rank, condition_type, condition_value, icon_path"
      )
      .order("created_at", { ascending: true }),

    supabase
      .from("user_badges")
      .select("badge_id, unlocked_at")
      .eq("user_id", userId)
      .order("unlocked_at", { ascending: false }),
  ]);

  if (badgesErr) {
    throw new Error(badgesErr.message);
  }

  if (earnedErr) {
    throw new Error(earnedErr.message);
  }

  const displayName = (profile.display_name ?? "").trim() || "NoName";

  return (
    <Container>
      <BadgeCollectionClient
        title="トロフィーコレクション"
        subtitle={`${displayName} の獲得トロフィー一覧です。`}
        profileHref={`/users/${encodeURIComponent(userId)}`}
        badges={(badges ?? []) as BadgeRow[]}
        earned={(earned ?? []) as UserBadgeRow[]}
        currentTitleBadgeId={null}
        readOnly={true}
      />
    </Container>
  );
}
``