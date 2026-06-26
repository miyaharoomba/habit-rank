import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { levelFromProfileXp } from "@/app/lib/leveling";

type ChatRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
  message_type: "text" | "image" | "video" | "file";
  image_url: string | null;
  file_url: string | null;
  file_name: string | null;
  file_mime: string | null;
  file_size: number | null;
  edited_at: string | null;
  reply_to_message_id: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
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

function mediaProxyUrl(path: string) {
  return `/api/media/dm?path=${encodeURIComponent(path)}`;
}

function avatarProxyUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function messagePreview(row: ChatRow) {
  const text = row.body.trim();
  if (text) return text;
  if (row.message_type === "image") return "画像";
  if (row.message_type === "video") return "動画";
  if (row.message_type === "file") return row.file_name || "ファイル";
  return "メッセージ";
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const requestUrl = new URL(request.url);
  const rawLimit = Number(requestUrl.searchParams.get("limit") ?? 30);
  const limit = Number.isFinite(rawLimit)
    ? Math.max(1, Math.min(rawLimit, 50))
    : 30;
  const includeModeration =
    requestUrl.searchParams.get("moderation") === "1";

  const { data, error } = await supabase
    .from("global_chat_messages")
    .select(
      "id, user_id, body, created_at, message_type, image_url, file_url, file_name, file_mime, file_size, edited_at, reply_to_message_id"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as ChatRow[];
  const rowMap = new Map(rows.map((r) => [r.id, r]));

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const profileMap = new Map<string, ProfileRow>();

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_path, current_title_badge_id, xp_total, level")
      .in("id", userIds);

    ((profiles ?? []) as ProfileRow[]).forEach((p) => {
      profileMap.set(p.id, p);
    });
  }

  const badgeIds = Array.from(
    new Set(
      Array.from(profileMap.values())
        .map((p) => p.current_title_badge_id)
        .filter(Boolean)
    )
  ) as string[];

  const badgeMap = new Map<string, BadgeLiteRow>();
  if (badgeIds.length > 0) {
    const { data: badges } = await supabase
      .from("badges")
      .select("id, title_label, badge_rank")
      .in("id", badgeIds);

    ((badges ?? []) as BadgeLiteRow[]).forEach((b) => {
      badgeMap.set(b.id, b);
    });
  }

  // 管理者判定
  let canModerate = false;
  if (includeModeration) {
    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    canModerate = !adminErr && !!isAdmin;
  }

  const items = rows.map((r) => {
    const profile = profileMap.get(r.user_id);
    const currentBadge =
      profile?.current_title_badge_id
        ? badgeMap.get(profile.current_title_badge_id)
        : null;

    return {
      id: r.id,
      user_id: r.user_id,
      user_name: (profile?.display_name ?? "").trim() || "NoName",
      user_avatar_url: avatarProxyUrl(profile?.avatar_path ?? null),
      user_title_label: currentBadge?.title_label?.trim() || null,
      user_title_rank: currentBadge?.badge_rank ?? null,
      user_level: levelFromProfileXp(profile?.xp_total, profile?.level),
      body: r.body,
      created_at: r.created_at,
      message_type: r.message_type ?? "text",
      image_url: r.image_url ? mediaProxyUrl(r.image_url) : null,
      file_url: r.file_url ? mediaProxyUrl(r.file_url) : null,
      file_name: r.file_name,
      file_mime: r.file_mime,
      file_size: r.file_size,
      edited_at: r.edited_at,
      reply_to_message_id: r.reply_to_message_id,
      reply_to: r.reply_to_message_id
        ? (() => {
            const reply = rowMap.get(r.reply_to_message_id);
            const replyProfile = reply ? profileMap.get(reply.user_id) : null;

            return reply
              ? {
                  id: reply.id,
                  user_name: (replyProfile?.display_name ?? "").trim() || "NoName",
                  body: messagePreview(reply),
                }
              : {
                  id: r.reply_to_message_id,
                  user_name: "NoName",
                  body: "元のメッセージを表示できません",
                };
          })()
        : null,
    };
  });

  return NextResponse.json({
    items,
    ...(includeModeration ? { canModerate } : {}),
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const bodyJson = await request.json().catch(() => null);
  const body = String(bodyJson?.body ?? "").trim();
  const replyToMessageId = String(bodyJson?.replyToMessageId ?? "").trim();

  if (!body) {
    return NextResponse.json({ error: "本文は必須です。" }, { status: 400 });
  }

  if (body.length > 200) {
    return NextResponse.json({ error: "本文は200文字以内です。" }, { status: 400 });
  }

  if (replyToMessageId) {
    const { data: replyTarget, error: replyErr } = await supabase
      .from("global_chat_messages")
      .select("id")
      .eq("id", replyToMessageId)
      .maybeSingle();

    if (replyErr) {
      return NextResponse.json({ error: replyErr.message }, { status: 400 });
    }

    if (!replyTarget) {
      return NextResponse.json(
        { error: "返信先のメッセージが見つかりません。" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabase
    .from("global_chat_messages")
    .insert({
      user_id: user.id,
      body,
      message_type: "text",
      image_url: null,
      file_url: null,
      file_name: null,
      file_mime: null,
      file_size: null,
      reply_to_message_id: replyToMessageId || null,
    })
    .select("id, user_id, body, created_at, message_type")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item: data });
}
