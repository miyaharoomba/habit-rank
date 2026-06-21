import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import {
  Flag,
  Home,
  MessageCircle,
  MoreVertical,
  Trophy,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import DmBackButton from "./DmBackButton";
import DmChatClient from "./DmChatClient";
import { DmLink, RankingLink } from "@/app/components/AppPageHeader";

type MessageRow = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  message_type: "text" | "image" | "video" | "file";
  image_path: string | null;
  file_path: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  read_at: string | null;
  unsent_at: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  current_title_badge_id: string | null;
};

type BadgeLiteRow = {
  id: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

type MessageForClient = {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_avatar_url: string | null;
  sender_profile_href: string;
  sender_title_label?: string | null;
  sender_title_rank?: "platinum" | "gold" | "silver" | "bronze" | null;
  body: string;
  created_at: string;
  message_type?: "text" | "image" | "video" | "file";
  image_path?: string | null;
  image_url?: string | null;
  file_path?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  file_mime?: string | null;
  file_size?: number | null;
  read_at?: string | null;
  unsent_at?: string | null;
};

function mediaProxyUrl(path: string) {
  return `/api/media/dm?path=${encodeURIComponent(path)}`;
}

function avatarProxyUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default async function DmThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ threadId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { threadId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  async function submitReport(formData: FormData): Promise<void> {
    "use server";

    const reason = String(formData.get("reason") ?? "").trim();
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/sign-in");
    }

    if (reason.length < 3) {
      redirect(`/dm/${threadId}?report=error`);
    }

    const { error } = await supabase.from("dm_reports").insert({
      reporter_id: user.id,
      thread_id: threadId,
      reason,
    });

    if (error) {
      redirect(`/dm/${threadId}?report=error`);
    }

    redirect(`/dm/${threadId}?report=ok`);
  }

  // 1) スレッド情報
  const { data: thread, error: threadErr } = await supabase
    .from("dm_threads")
    .select("id, user_low, user_high")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr || !thread) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">DM</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">
              スレッドが見つかりません（または権限がありません）。
            </p>
            <div className="mt-3 flex gap-3">
              <DmLink />
              <RankingLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  // 参加者チェック（安全のため）
  const isMember = thread.user_low === user.id || thread.user_high === user.id;
  if (!isMember) {
    redirect("/dm");
  }

  const otherUserId =
    thread.user_low === user.id ? thread.user_high : thread.user_low;

  const { error: readErr } = await supabase.rpc("mark_dm_thread_read", {
    p_thread_id: threadId,
  });

  if (readErr) {
    console.error("mark_dm_thread_read failed:", readErr.message);
  }

  // 2) 参加ユーザーのプロフィールをまとめて取得
  const userIds = [user.id, otherUserId];
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, current_title_badge_id")
    .in("id", userIds);

  if (profilesErr) {
    throw new Error(profilesErr.message);
  }

  const profileRows = (profiles ?? []) as ProfileRow[];
  const profileMap = new Map<string, ProfileRow>();
  profileRows.forEach((p) => {
    profileMap.set(p.id, p);
  });

  const otherName =
    (profileMap.get(otherUserId)?.display_name ?? "").trim() || "NoName";

  // 3) 称号用の badge 情報を取得
  const titleBadgeIds = Array.from(
    new Set(
      profileRows
        .map((p) => p.current_title_badge_id)
        .filter(Boolean)
    )
  ) as string[];

  const badgeMap = new Map<string, BadgeLiteRow>();

  if (titleBadgeIds.length > 0) {
    const { data: titleBadges, error: titleBadgesErr } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", titleBadgeIds);

    if (titleBadgesErr) {
      throw new Error(titleBadgesErr.message);
    }

    ((titleBadges ?? []) as BadgeLiteRow[]).forEach((b) => {
      badgeMap.set(b.id, b);
    });
  }

  // 4) メッセージ取得（送信取り消し含む）
  const { data: msgs, error: msgErr } = await supabase
    .from("dm_messages")
    .select(
      "id, sender_id, body, created_at, message_type, image_path, file_path, file_name, file_mime, file_size, read_at, unsent_at"
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (msgErr) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">DM</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">取得エラー: {msgErr.message}</p>
            <div className="mt-3">
              <DmLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (msgs ?? []) as MessageRow[];

  // 5) fixed proxy URL + 送信者プロフィール情報 + 称号を返す
  const messages: MessageForClient[] = rows.map((m) => {
    const senderProfile = profileMap.get(m.sender_id);

    const currentBadge =
      senderProfile?.current_title_badge_id
        ? badgeMap.get(senderProfile.current_title_badge_id)
        : null;

    const base: MessageForClient = {
      id: m.id,
      sender_id: m.sender_id,
      sender_name: senderProfile?.display_name?.trim() || "NoName",
      sender_avatar_url: avatarProxyUrl(senderProfile?.avatar_path ?? null),
      sender_profile_href:
        m.sender_id === user.id
          ? "/profile"
          : `/users/${encodeURIComponent(m.sender_id)}`,
      sender_title_label: currentBadge?.title_label?.trim() || null,
      sender_title_rank: currentBadge?.badge_rank ?? null,
      body: m.body,
      created_at: m.created_at,
      message_type: m.message_type,
      image_path: m.image_path,
      file_path: m.file_path,
      file_name: m.file_name ?? undefined,
      file_mime: m.file_mime ?? undefined,
      file_size: m.file_size ?? undefined,
      read_at: m.read_at ?? undefined,
      unsent_at: m.unsent_at ?? undefined,
    };

    if (m.message_type === "text") return base;

    if (m.message_type === "image" && m.image_path) {
      return {
        ...base,
        image_url: mediaProxyUrl(m.image_path),
      };
    }

    if ((m.message_type === "video" || m.message_type === "file") && m.file_path) {
      return {
        ...base,
        file_url: mediaProxyUrl(m.file_path),
      };
    }

    return base;
  });

  const reportStatus = typeof sp.report === "string" ? sp.report : "";
  const otherProfileHref = `/users/${encodeURIComponent(otherUserId)}`;
  const otherInitial = otherName.trim().slice(0, 1) || "?";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-2 sm:h-16 sm:px-6">
          <DmBackButton />

          <Link
            href={otherProfileHref}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1.5 py-1 transition hover:bg-secondary/40"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary/50 text-sm font-bold">
              {otherInitial}
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-bold leading-tight sm:text-lg">
                {otherName}
              </div>
              <div className="hidden text-xs text-muted-foreground sm:block">DM</div>
            </div>
          </Link>

          <nav
            className="flex shrink-0 items-center gap-1"
            aria-label="DMナビゲーション"
          >
            <Link
              href="/app"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-secondary/50"
              aria-label="メイン画面へ"
              title="メイン画面へ"
            >
              <Home className="h-5 w-5" aria-hidden="true" />
            </Link>
            <Link
              href="/ranking"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl transition hover:bg-secondary/50"
              aria-label="ランキングへ"
              title="ランキングへ"
            >
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </Link>

            <details className="relative shrink-0">
              <summary
                className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-xl transition hover:bg-secondary/50 [&::-webkit-details-marker]:hidden"
                aria-label="DMメニュー"
                title="DMメニュー"
              >
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border bg-card p-3 shadow-glow">
                <div className="space-y-1 border-b border-border pb-2">
                  <Link
                    href={otherProfileHref}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary/50"
                  >
                    <UserRound className="h-4 w-4" aria-hidden="true" />
                    プロフィール
                  </Link>
                  <Link
                    href="/dm"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-secondary/50"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    DM一覧
                  </Link>
                </div>

                <div className="pt-3">
                  {reportStatus === "ok" && (
                    <div className="mb-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                      通報しました。ご協力ありがとうございます。
                    </div>
                  )}
                  {reportStatus === "error" && (
                    <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                      通報に失敗しました。理由は3文字以上で入力してください。
                    </div>
                  )}

                  <form action={submitReport}>
                    <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                      <Flag className="h-3.5 w-3.5" aria-hidden="true" />
                      通報
                    </div>
                    <textarea
                      name="reason"
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                      placeholder="理由を入力"
                      rows={3}
                      required
                      minLength={3}
                    />
                    <button
                      type="submit"
                      className="mt-2 w-full rounded-lg bg-destructive px-3 py-2 text-sm font-semibold text-destructive-foreground hover:opacity-90"
                    >
                      通報を送信
                    </button>
                  </form>
                </div>
              </div>
            </details>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-3 py-3 sm:px-6">
        <DmChatClient
          threadId={threadId}
          myUserId={user.id}
          messages={messages}
        />
      </main>
    </div>
  );
}
