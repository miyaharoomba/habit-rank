import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import DmChatClient from "./DmChatClient";

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
              <Link className="text-sm text-primary hover:underline" href="/dm">
                ← DM一覧へ
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/ranking">
                ランキングへ
              </Link>
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
      "id, sender_id, body, created_at, message_type, image_path, file_path, file_name, file_mime, file_size, unsent_at"
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
              <Link className="text-sm text-primary hover:underline" href="/dm">
                ← DM一覧へ
              </Link>
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

  return (
    <Container>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">DM</div>
          <h1 className="text-2xl font-bold tracking-tight truncate">{otherName}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link className="text-sm text-primary hover:underline" href="/dm">
            ← DM一覧
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>

          <details className="relative">
            <summary className="cursor-pointer select-none rounded-lg border border-border px-3 py-2 text-sm hover:bg-secondary/40">
              通報
            </summary>
            <div className="absolute right-0 mt-2 w-[320px] rounded-xl border border-border bg-card p-3 shadow-glow z-50">
              {reportStatus === "ok" && (
                <div className="mb-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
                  通報しました。ご協力ありがとうございます。
                </div>
              )}
              {reportStatus === "error" && (
                <div className="mb-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  通報に失敗しました（理由は3文字以上で入力）
                </div>
              )}

              <form action={submitReport}>
                <textarea
                  name="reason"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                  placeholder="通報理由（例：迷惑行為、スパム、暴言など）"
                  rows={3}
                  required
                  minLength={3}
                />
                <button
                  type="submit"
                  className="mt-2 w-full rounded-lg bg-destructive text-destructive-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
                >
                  通報を送信
                </button>
              </form>

              <div className="mt-2 text-[11px] text-muted-foreground">
                ※ 通報は管理者の「通報一覧」に送られます。
              </div>
            </div>
          </details>
        </div>
      </header>

      <div className="mt-4">
        <DmChatClient
          threadId={threadId}
          myUserId={user.id}
          messages={messages}
        />
      </div>
    </Container>
  );
}
