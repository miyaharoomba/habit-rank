// app/admin/support/[threadId]/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { formatJst } from "@/lib/time";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";
import {
  AdminLink,
  HeaderLink,
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

function preview(text: string, max = 100) {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default async function AdminSupportThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  async function replyAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !isAdmin) redirect("/settings");

    const body = String(formData.get("body") ?? "").trim();
    if (!body) {
      throw new Error("本文は必須です。");
    }

    // 対象スレッドを取得（通知先 user_id と件名が必要）
    const { data: targetThread, error: threadErr } = await supabase
      .from("support_threads")
      .select("id, user_id, subject, status")
      .eq("id", threadId)
      .single();

    if (threadErr || !targetThread) {
      throw new Error(threadErr?.message ?? "support thread not found");
    }

    // 1) 返信本文を保存（通常クライアント）
    const { error: msgErr } = await supabase.from("support_messages").insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: "admin",
      body,
    });

    if (msgErr) {
      throw new Error(msgErr.message);
    }

    // 2) 通知を作成する。push_outbox は DB trigger 側で作られる。
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
    }

    const adminClient = createAdminClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const notifPreview = preview(body, 120);

    const { data: notif, error: notifErr } = await adminClient
      .from("notifications")
      .insert({
        type: "support_reply",
        actor_id: user.id,
        recipient_id: targetThread.user_id,
        thread_id: null,
        session_id: null,
        announcement_id: null,
        support_thread_id: threadId,
        message_preview: notifPreview,
      })
      .select("id")
      .single();

    if (notifErr || !notif) {
      throw new Error(
        notifErr?.message ?? "support_reply notification insert failed"
      );
    }

    // 3) 監査ログ
    await triggerPushDispatchBestEffort("supportReply");

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "SUPPORT_REPLY",
      target_user_id: targetThread.user_id,
      target_thread_id: threadId,
      details: {
        preview: notifPreview,
      },
    });

    redirect(`/admin/support/${threadId}`);
  }

  async function closeAction() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !isAdmin) redirect("/settings");

    const { error } = await supabase
      .from("support_threads")
      .update({ status: "closed", updated_at: new Date().toISOString() })
      .eq("id", threadId);

    if (error) {
      throw new Error(error.message);
    }

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "SUPPORT_CLOSE",
      target_user_id: null,
      target_thread_id: threadId,
      details: {},
    });

    redirect(`/admin/support/${threadId}`);
  }

  async function reopenAction() {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !isAdmin) redirect("/settings");

    const { error } = await supabase
      .from("support_threads")
      .update({ status: "open", updated_at: new Date().toISOString() })
      .eq("id", threadId);

    if (error) {
      throw new Error(error.message);
    }

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "SUPPORT_REOPEN",
      target_user_id: null,
      target_thread_id: threadId,
      details: {},
    });

    redirect(`/admin/support/${threadId}`);
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
            <h1 className="text-xl font-bold tracking-tight">問い合わせ管理</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">問い合わせが見つかりません。</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <HeaderLink href="/admin/support" icon={LifeBuoy}>
                問い合わせ一覧
              </HeaderLink>
              <AdminLink />
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

  const senderIds = Array.from(
    new Set([row.user_id, ...msgRows.map((m) => m.sender_id)])
  );
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

  const userName = nameMap.get(row.user_id) ?? "NoName";

  return (
    <Container>
      <PageHeader
        title="問い合わせ詳細"
        description={row.subject}
        actions={
          <>
            <HeaderLink href="/admin/support" icon={LifeBuoy}>
              問い合わせ一覧
            </HeaderLink>
            <AdminLink />
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold">スレッド情報</h2>
                <div className="mt-1 text-sm text-muted-foreground">
                  送信者: {userName}
                </div>
              </div>

              <div className="flex items-center gap-2">
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

                {row.status === "open" ? (
                  <form action={closeAction}>
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary/40"
                    >
                      完了にする
                    </button>
                  </form>
                ) : (
                  <form action={reopenAction}>
                    <button
                      type="submit"
                      className="rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-secondary/40"
                    >
                      再オープン
                    </button>
                  </form>
                )}
              </div>
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
                  const mine = m.sender_role === "admin";
                  const senderLabel =
                    m.sender_role === "admin"
                      ? "管理者"
                      : `${nameMap.get(m.sender_id) ?? "ユーザー"}（ユーザー）`;

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
              <h2 className="font-semibold">返信する</h2>
            </CardHeader>
            <CardBody>
              <form action={replyAction} className="space-y-3">
                <textarea
                  name="body"
                  required
                  rows={6}
                  placeholder="管理者として返信を入力"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-y"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
                >
                  返信を送信
                </button>
              </form>
            </CardBody>
          </Card>
        )}
      </div>
    </Container>
  );
}
