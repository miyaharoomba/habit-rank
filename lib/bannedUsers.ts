import "server-only";

import { createClient as createAdminClient } from "@supabase/supabase-js";

type UserFlagRow = {
  user_id: string;
  is_banned: boolean | null;
  banned_until: string | null;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase admin env is missing for ban filtering");
  }

  return createAdminClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isActiveBan(row: UserFlagRow, nowMs: number) {
  if (!row.is_banned) return false;
  if (!row.banned_until) return true;

  const untilMs = new Date(row.banned_until).getTime();
  return Number.isNaN(untilMs) || untilMs > nowMs;
}

export async function getActiveBannedUserIds(userIds: string[]) {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Set<string>();

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("user_flags")
    .select("user_id, is_banned, banned_until")
    .in("user_id", uniqueIds)
    .eq("is_banned", true);

  if (error) {
    throw new Error(error.message);
  }

  const nowMs = Date.now();

  return new Set(
    ((data ?? []) as UserFlagRow[])
      .filter((row) => isActiveBan(row, nowMs))
      .map((row) => row.user_id)
  );
}
