
import { redirect } from "next/navigation";
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import BadgeCollectionClient from "@/app/badges/BadgeCollectionClient";

type BadgeRow = {
  id: string;
  title: string;
  description: string;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
  condition_type: string;
  condition_value: number;
  icon_path: string | null;
};

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: string;
  is_pinned: boolean;
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

  if (userErr || !user) redirect("/auth/sign-in");
  if (userId === user.id) redirect("/badges");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (!profile) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">トロフィー</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-muted-foreground">ユーザーが見つかりません。</p>
            <div className="mt-3 flex gap-3">
              <Link href="/participants" className="text-sm text-primary hover:underline">/participants</Link>
              <Link href="/app" className="text-sm text-primary hover:underline">/app</Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const [{ data: badges, error: bErr }, { data: earned, error: eErr }] = await Promise.all([
    supabase
      .from("badges")
      .select("id, title, description, badge_rank, condition_type, condition_value, icon_path")
      .order("created_at", { ascending: true }),
    supabase
      .from("user_badges")
      .select("badge_id, unlocked_at, is_pinned")
      .eq("user_id", userId),
  ]);

  if (bErr) throw new Error(bErr.message);
  if (eErr) throw new Error(eErr.message);

  const displayName = (profile.display_name ?? "").trim() || "NoName";

  return (
    <Container>
      <BadgeCollectionClient
        title="トロフィーコレクション"
        subtitle={`${displayName} の獲得トロフィー一覧です。`}
        profileHref={`/users/${encodeURIComponent(userId)}`}
        badges={(badges ?? []) as BadgeRow[]}
        earned={(earned ?? []) as UserBadgeRow[]}
        readOnly={true}
      />
    </Container>
  );
}
