// app/support/[threadId]/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import PendingSubmitButton from "@/app/components/ui/PendingSubmitButton";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import {
  HeaderLink,
  MainLink,
  PageHeader,
} from "@/app/components/AppPageHeader";
import { LifeBuoy } from "lucide-react";

type ThreadRow = {
  id: string;
  user_id: string;
  subject: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

type MessageRow = {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_role: "user" | "admin";
  body: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  async function replyAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/sign-in");
    }

    const body = String(formData.get("body") ?? "").trim();
    if (!body) {
      throw new Error("本文は必須です。");
    }

    const { error } = await supabase.from("support_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "user",
      body,
    });

    if (error) {
      throw new Error(error.message);
    }

    redirect(`/support/${threadId}`);
  }

  const { data: thread, error: threadErr } = await supabase
    .from("support_threads")
    .select("id, user_id, subject, status, created_at, updated_at, last_message_at")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr || !thread) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">問い合わせ</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">問い合わせが見つかりません。</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <HeaderLink href="/support" icon={LifeBuoy}>
                問い合わせ一覧
              </HeaderLink>
              <MainLink />
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const row = thread as ThreadRow;

  const { data: messages, error: msgErr } = await supabase
    .from("support_messages")
    .select("id, thread_id, sender_id, sender_role, body, created_at")
    .eq("thread_id", row.id)
    .order("created_at", { ascending: true });

  if (msgErr) {
    throw new Error(msgErr.message);
  }

  const msgRows = (messages ?? []) as MessageRow[];

  const senderIds = Array.from(new Set(msgRows.map((m) => m.sender_id)));
  const nameMap = new Map<string, string>();

  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);

    (profiles ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <PageHeader
        title="問い合わせ詳細"
        description={row.subject}
        actions={
          <>
            <HeaderLink href="/support" icon={LifeBuoy}>
              問い合わせ一覧
            </HeaderLink>
            <MainLink />
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">スレッド情報</h2>
              <span
                className={[
                  "rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                  row.status === "open"
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {row.status === "open" ? "対応中" : "完了"}
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <div className="text-sm break-words">{row.subject}</div>
            <div className="mt-2 text-xs text-muted-foreground tabular-nums">
              作成: {formatJst(row.created_at)} / 最終更新: {formatJst(row.last_message_at)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">やりとり</h2>
          </CardHeader>
          <CardBody>
            {msgRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだメッセージがありません。</p>
            ) : (
              <div className="space-y-3">
                {msgRows.map((m) => {
                  const mine = m.sender_role === "user";
                  const senderLabel = mine
                    ? "あなた"
                    : `${nameMap.get(m.sender_id) ?? "管理者"}（管理者）`;

                  return (
                    <div
                      key={m.id}
                      className={`flex ${mine ? "justify-end" : "justify-start"}`}
                    >
                      <div className="max-w-[85%] sm:max-w-[72%]">
                        <div className="mb-1 text-[11px] text-muted-foreground">
                          {senderLabel}
                        </div>
                        <div
                          className={[
                            "rounded-2xl border border-border px-3 py-2 text-sm whitespace-pre-wrap break-words",
                            mine ? "bg-primary/15" : "bg-secondary/40",
                          ].join(" ")}
                        >
                          {m.body}
                        </div>
                        <div
                          className={[
                            "mt-1 text-[11px] text-muted-foreground tabular-nums",
                            mine ? "text-right" : "text-left",
                          ].join(" ")}
                        >
                          {formatJst(m.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardBody>
        </Card>

        {row.status === "open" && (
          <Card>
            <CardHeader>
              <h2 className="font-semibold">追記する</h2>
            </CardHeader>
            <CardBody>
              <form action={replyAction} className="space-y-3">
                <textarea
                  name="body"
                  required
                  rows={6}
                  placeholder="追加で伝えたい内容を入力"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-y"
                />
                <PendingSubmitButton
                  idleText="送信"
                  pendingText="送信中…"
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </Container>
  );
}
