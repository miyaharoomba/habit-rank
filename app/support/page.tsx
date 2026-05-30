// app/support/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type ThreadRow = {
  id: string;
  subject: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
  last_message_at: string;
};

export default async function SupportPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  async function createSupportThreadAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/sign-in");
    }

    const subject = String(formData.get("subject") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();

    if (!subject || !body) {
      throw new Error("件名と本文は必須です。");
    }

    // 1) スレッド作成
    const { data: thread, error: threadErr } = await supabase
      .from("support_threads")
      .insert({
        user_id: user.id,
        subject,
        status: "open",
      })
      .select("id")
      .single();

    if (threadErr || !thread) {
      throw new Error(threadErr?.message ?? "support_threads insert failed");
    }

    // 2) 最初の本文をメッセージとして保存
    const { error: msgErr } = await supabase
      .from("support_messages")
      .insert({
        thread_id: thread.id,
        sender_id: user.id,
        sender_role: "user",
        body,
      });

    if (msgErr) {
      throw new Error(msgErr.message);
    }

    redirect(`/support/${thread.id}`);
  }

  const { data: threads, error } = await supabase
    .from("support_threads")
    .select("id, subject, status, created_at, updated_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (threads ?? []) as ThreadRow[];

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">管理者への問い合わせ</h1>
          <p className="text-sm text-muted-foreground">
            不具合報告・相談・要望などを管理者に送れます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/ranking">
            /ranking
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">新しい問い合わせを送る</h2>
          </CardHeader>
          <CardBody>
            <form action={createSupportThreadAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">件名</label>
                <input
                  name="subject"
                  required
                  maxLength={120}
                  placeholder="例: 通知が届かない / 不具合報告 / 要望"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">本文</label>
                <textarea
                  name="body"
                  required
                  rows={8}
                  placeholder="問い合わせ内容を入力してください"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-y"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
              >
                問い合わせを送信
              </button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">これまでの問い合わせ</h2>
          </CardHeader>
          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                まだ問い合わせはありません。
              </p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-secondary/30 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/support/${row.id}`}
                            className="font-semibold break-words hover:underline"
                          >
                            {row.subject}
                          </Link>
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

                        <div className="mt-1 text-xs text-muted-foreground">
                          作成:{" "}
                          <span className="tabular-nums">{formatJst(row.created_at)}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          最終更新:{" "}
                          <span className="tabular-nums">
                            {formatJst(row.last_message_at)}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm">
                        <Link
                          href={`/support/${row.id}`}
                          className="text-primary hover:underline"
                        >
                          開く →
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
