import Container from "@/app/components/ui/Container";
import Card, { CardHeader, CardBody } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { formatJst } from "@/lib/time";
import TitleBadge from "@/app/components/TitleBadge";
import LevelBadge from "@/app/components/LevelBadge";
import { levelFromProfileXp } from "@/app/lib/leveling";
import {
  MainLink,
  PageHeader,
  ParticipantsLink,
  RankingLink,
} from "@/app/components/AppPageHeader";

type ThreadRow = {
  thread_id: string;
  other_user_id: string;
  other_display_name: string;
  last_message: string | null;
  last_message_at: string | null;
  unread_count?: number | null;
  avatar_path?: string | null;
  title_label?: string | null;
  title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
  level?: number | null;
};

type ProfileRow = {
  id: string;
  avatar_path: string | null;
  current_title_badge_id: string | null;
  xp_total: number | string | null;
  level: number | null;
};

type BadgeLiteRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

function avatarUrl(path: string | null | undefined) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default async function DmListPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data, error } = await supabase.rpc("get_my_dm_threads", {
    limit_count: 50,
  });

  if (error) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">DM</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {error.message}</p>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const baseThreads = (data ?? []) as ThreadRow[];
  const userIds = Array.from(new Set(baseThreads.map((t) => t.other_user_id)));

  const avatarMap = new Map<string, string | null>();
  const titleBadgeIdMap = new Map<string, string | null>();
  const levelMap = new Map<string, number | null>();

  if (userIds.length > 0) {
    const { data: profiles, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, avatar_path, current_title_badge_id, xp_total, level")
      .in("id", userIds);

    if (profilesErr) {
      throw new Error(profilesErr.message);
    }

    ((profiles ?? []) as ProfileRow[]).forEach((row) => {
      avatarMap.set(row.id, row.avatar_path ?? null);
      titleBadgeIdMap.set(row.id, row.current_title_badge_id ?? null);
      levelMap.set(row.id, levelFromProfileXp(row.xp_total, row.level));
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

    ((badges ?? []) as BadgeLiteRow[]).forEach((row) => {
      badgeMap.set(row.id, row);
    });
  }

  const threads = baseThreads.map((t) => {
    const badgeId = titleBadgeIdMap.get(t.other_user_id) ?? null;
    const badge = badgeId ? badgeMap.get(badgeId) ?? null : null;

    return {
      ...t,
      avatar_path: avatarMap.get(t.other_user_id) ?? null,
      title_label: badge?.title_label?.trim() || null,
      title_rank: badge?.badge_rank ?? null,
      level: levelMap.get(t.other_user_id) ?? 1,
    };
  });

  return (
    <Container>
      <PageHeader
        title="DM"
        description="個別メッセージのやり取りをまとめて確認できます。"
        actions={
          <>
            <MainLink />
            <ParticipantsLink />
            <RankingLink />
          </>
        }
      />

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">スレッド一覧</h2>
          </CardHeader>
          <CardBody>
            {threads.length === 0 ? (
              <div className="rounded-xl border border-border bg-background/60 px-4 py-6 text-sm text-muted-foreground">
                まだDMがありません。参加者一覧から「メッセージ」で開始しよう。
              </div>
            ) : (
              <ul className="space-y-3">
                {threads.map((t) => {
                  const avatar = avatarUrl(t.avatar_path);
                  const initial =
                    (t.other_display_name ?? "?").trim().slice(0, 1) || "?";
                  const lastMessage =
                    (t.last_message ?? "").trim() || "（まだメッセージがありません）";

                  const unreadCount = Number(t.unread_count ?? 0);

                  return (
                    <li key={t.thread_id}>
                      <Link
                        href={`/dm/${t.thread_id}`}
                        className="block rounded-xl border border-border bg-background/60 px-4 py-4 transition hover:bg-secondary/30"
                      >
                        <div className="flex items-start gap-3">
                          <div className="shrink-0">
                            {avatar ? (
                              <img
                                src={avatar}
                                alt={t.other_display_name || "avatar"}
                                loading="lazy"
                                decoding="async"
                                className="h-12 w-12 rounded-full object-cover border border-border"
                              />
                            ) : (
                              <div className="h-12 w-12 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-base font-bold text-muted-foreground">
                                {initial}
                              </div>
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            {/* 上段: 名前＋称号 / 時刻 */}
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <div className="min-w-0 text-sm font-semibold break-words">
                                    {t.other_display_name}
                                  </div>

                                  <LevelBadge level={t.level} compact />

                                  <div className="min-w-0 max-w-[150px] sm:max-w-[220px]">
                                    <TitleBadge
                                      label={t.title_label}
                                      rank={t.title_rank}
                                      compact
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="flex shrink-0 flex-col items-end gap-1">
                                <div className="text-[11px] text-muted-foreground whitespace-nowrap tabular-nums">
                                  {t.last_message_at ? formatJst(t.last_message_at) : ""}
                                </div>
                                {unreadCount > 0 ? (
                                  <div className="min-w-5 rounded-full bg-primary px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-primary-foreground">
                                    {unreadCount > 99 ? "99+" : unreadCount}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            {/* 下段: 最終メッセージ */}
                            <div
                              className={[
                                "mt-2 text-sm break-words overflow-hidden",
                                unreadCount > 0
                                  ? "font-semibold text-foreground"
                                  : "text-muted-foreground",
                              ].join(" ")}
                              style={{
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                              }}
                            >
                              {lastMessage}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
