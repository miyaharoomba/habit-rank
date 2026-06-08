
import { redirect } from "next/navigation";
import Container from "@/app/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import BadgeCollectionClient from "./BadgeCollectionClient";

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

export default async function BadgesPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/auth/sign-in");

  const [{ data: badges, error: bErr }, { data: earned, error: eErr }] = await Promise.all([
    supabase
      .from("badges")
      .select("id, title, description, badge_rank, condition_type, condition_value, icon_path")
      .order("created_at", { ascending: true }),
    supabase
      .from("user_badges")
      .select("badge_id, unlocked_at, is_pinned")
      .eq("user_id", user.id),
  ]);

  if (bErr) throw new Error(bErr.message);
  if (eErr) throw new Error(eErr.message);

  return (
    <Container>
      <BadgeCollectionClient
        title="トロフィーコレクション"
        subtitle="獲得したバッジと未獲得の目標を確認できます。"
        profileHref="/profile"
        badges={(badges ?? []) as BadgeRow[]}
        earned={(earned ?? []) as UserBadgeRow[]}
        readOnly={false}
      />
    </Container>
  );
}
