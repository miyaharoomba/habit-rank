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
};

// Clientに渡す形（signed URLを追加）
type MessageForClient = {
  id: string;
  sender_id: string;
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
};

export default async function DmThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) redirect("/auth/sign-in");

  // 1) スレッド情報（相手ID）
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
              <Link href="/dm" className="text-sm text-primary hover:underline">
                ← DM一覧へ
              </Link>
              <Link href="/ranking" className="text-sm text-primary hover:underline">
                ランキングへ
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const otherUserId =
    thread.user_low === user.id ? thread.user_high : thread.user_low;

  // 2) 相手の表示名
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", otherUserId)
    .maybeSingle();

  const otherName = otherProfile?.display_name?.trim() || "NoName";

  // 3) メッセージ取得（画像/動画/ファイル情報も含める）
  const { data: msgs, error: msgErr } = await supabase
    .from("dm_messages")
    .select(
      "id, sender_id, body, created_at, message_type, image_path, file_path, file_name, file_mime, file_size"
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
              <Link href="/dm" className="text-sm text-primary hover:underline">
                ← DM一覧へ
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const rows = (msgs ?? []) as MessageRow[];

  // 4) Private bucket なので、表示用に signed URL を作る
  // 画像/動画/ファイルすべてに対応
  // createSignedUrl(path, expiresIn) が公式API。[1](https://ihogehoge.hatenablog.com/entry/2025/04/21/153229)[2](https://supabase.com/docs/guides/auth/quickstarts/nextjs)
  const messages: MessageForClient[] = await Promise.all(
    rows.map(async (m) => {
      // 共通部分
      const base: MessageForClient = {
        id: m.id,
        sender_id: m.sender_id,
        body: m.body,
        created_at: m.created_at,
        message_type: m.message_type,
        image_path: m.image_path,
        file_path: m.file_path,
        file_name: m.file_name,
        file_mime: m.file_mime,
        file_size: m.file_size,
        image_url: null,
        file_url: null,
      };

      // text はURL不要
      if (m.message_type === "text") return base;

      // image は image_path を signed URL 化
      if (m.message_type === "image" && m.image_path) {
        const { data: signed, error: sErr } = await supabase.storage
          .from("dm-media")
          .createSignedUrl(m.image_path, 60 * 60); // 1時間
        return {
          ...base,
          image_url: sErr ? null : signed?.signedUrl ?? null,
        };
      }

      // video / file は file_path を signed URL 化
      if ((m.message_type === "video" || m.message_type === "file") && m.file_path) {
        const { data: signed, error: sErr } = await supabase.storage
          .from("dm-media")
          .createSignedUrl(m.file_path, 60 * 60); // 1時間
        return {
          ...base,
          file_url: sErr ? null : signed?.signedUrl ?? null,
        };
      }

      // パスが無いなどの異常系はそのまま返す
      return base;
    })
  );

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">DM</div>
          <h1 className="text-2xl font-bold tracking-tight truncate">{otherName}</h1>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link href="/dm" className="text-sm text-primary hover:underline whitespace-nowrap">
            ← DM一覧
          </Link>
          <Link href="/app" className="text-sm text-primary hover:underline whitespace-nowrap">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">チャット</h2>
          </CardHeader>
          <CardBody>
            {/* ✅ image_url / file_url を含めて渡す */}
            <DmChatClient
              threadId={threadId}
              myUserId={user.id}
              messages={messages as any}
            />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
