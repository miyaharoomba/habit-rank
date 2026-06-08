import { redirect } from "next/navigation";
import Container from "@/app/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import BadgeCollectionClient from "./BadgeCollectionClient";

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

type ProfileRow = {
  current_title_badge_id: string | null;
};

export default async function BadgesPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  const [
    { data: badges, error: bErr },
    { data: earned, error: eErr },
    { data: profile, error: pErr },
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
      .eq("user_id", user.id)
      .order("unlocked_at", { ascending: false }),

    supabase
      .from("profiles")
      .select("current_title_badge_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (bErr) {
    throw new Error(bErr.message);
  }

  if (eErr) {
    throw new Error(eErr.message);
  }

  if (pErr) {
    throw new Error(pErr.message);
  }

  const badgeRows = (badges ?? []) as BadgeRow[];
  const earnedRows = (earned ?? []) as UserBadgeRow[];
  const profileRow = (profile ?? { current_title_badge_id: null }) as ProfileRow;

  return (
    <Container>
      <BadgeCollectionClient
        title="トロフィーコレクション"
        subtitle="獲得したトロフィーと使える称号を確認できます。"
        profileHref="/profile"
        badges={badgeRows}
        earned={earnedRows}
        currentTitleBadgeId={profileRow.current_title_badge_id}
        readOnly={false}
      />
    </Container>
  );
}
     