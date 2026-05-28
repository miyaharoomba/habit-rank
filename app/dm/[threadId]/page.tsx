import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import DmChatClient from "./DmChatClient";

type Message = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
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
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/auth/sign-in"); // Server Componentでredirect可能 [1](https://stackoverflow.com/questions/76509197/unable-to-delete-cookie-using-next-js-server-side-action)

  // 1) スレッド情報（相手ID決定）
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

  // 2) 相手の名前
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", otherUserId)
    .maybeSingle();

  const otherName = otherProfile?.display_name?.trim() || "NoName";

  // 3) メッセージ一覧（時系列）
  const { data: msgs, error: msgErr } = await supabase
    .from("dm_messages")
    .select("id, sender_id, body, created_at")
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

  const messages = (msgs ?? []) as Message[];

  return (
    <Container>
      {/* ヘッダー：相手の名前 */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">DM</div>
          <h1 className="text-2xl font-bold tracking-tight truncate">
            {otherName}
          </h1>
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
            {/* ✅ ここから先はClient Componentに任せる（固定フォーム＆自動スクロール） */}
            <DmChatClient
              threadId={threadId}
              myUserId={user.id}
              messages={messages}
            />
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}