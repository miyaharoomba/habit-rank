import type { SupabaseClient } from "@supabase/supabase-js";

export type TitleRank = "platinum" | "gold" | "silver" | "bronze";

export type UserTitleInfo = {
  label: string | null;
  rank: TitleRank | null;
};

type ProfileRow = {
  id: string;
  current_title_badge_id: string | null;
};

type BadgeLiteRow = {
  id: string;
  title_label: string | null;
  badge_rank: TitleRank;
};

export async function getUserTitleMap(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, UserTitleInfo>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, UserTitleInfo>();

  if (ids.length === 0) return result;

  const { data: profiles, error: pErr } = await supabase
    .from("profiles")
    .select("id, current_title_badge_id")
    .in("id", ids);

  if (pErr) {
    throw new Error(pErr.message);
  }

  const profileRows = (profiles ?? []) as ProfileRow[];

  const badgeIds = Array.from(
    new Set(profileRows.map((p) => p.current_title_badge_id).filter(Boolean))
  ) as string[];

  const badgeMap = new Map<string, BadgeLiteRow>();

  if (badgeIds.length > 0) {
    const { data: badges, error: bErr } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);

    if (bErr) {
      throw new Error(bErr.message);
    }

    (badges ?? []).forEach((b: any) => {
      badgeMap.set(b.id, b as BadgeLiteRow);
    });
  }

  for (const p of profileRows) {
    const badge = p.current_title_badge_id
      ? badgeMap.get(p.current_title_badge_id)
      : null;

    result.set(p.id, {
      label: badge?.title_label?.trim() || null,
      rank: badge?.badge_rank ?? null,
    });
  }

  return result;
}
``