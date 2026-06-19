// app/admin/announcements/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
};

function bodyPreview(text: string, max = 120) {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default async function AdminAnnouncementsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  async function sendAnnouncementAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
    if (adminErr || !isAdmin) redirect("/settings");

    const title = String(formData.get("title") ?? "").trim();
    const body = String(formData.get("body") ?? "").trim();

    if (!title || !body) {
      throw new Error("タイトルと本文は必須です。");
    }

    // 1) お知らせ本体を保存
    const { data: announcement, error: annErr } = await supabase
      .from("admin_announcements")
      .insert({
        title,
        body,
        created_by: user.id,
      })
      .select("id, title, body, created_by, created_at")
      .single();

    if (annErr || !announcement) {
      throw new Error(annErr?.message ?? "admin_announcements insert failed");
    }

    // 2) 全体通知を1件作成
    const { data: notif, error: notifErr } = await supabase
      .from("notifications")
      .insert({
        type: "admin_broadcast",
        actor_id: user.id,
        recipient_id: null,
        thread_id: null,
        session_id: null,
        announcement_id: announcement.id,
        message_preview: title,
      })
      .select("id")
      .single();

    if (notifErr || !notif) {
      throw new Error(notifErr?.message ?? "notifications insert failed");
    }

    // 3) push配信用に全ユーザー分の outbox を作る
    const { data: recipients, error: recErr } = await supabase
      .from("profiles")
      .select("id");

    if (recErr) {
      throw new Error(recErr.message);
    }

    const allUserIds = ((recipients ?? []) as Array<{ id: string | null }>)
      .map((r) => r.id)
      .filter((id): id is string => Boolean(id));

    if (allUserIds.length > 0) {
      const outboxRows = allUserIds.map((recipientId) => ({
        notification_id: notif.id,
        recipient_id: recipientId,
        payload: {
          title,
          body: bodyPreview(body, 120),
          url: `/announcements/${announcement.id}`,
        },
        attempts: 0,
      }));

      const { error: outboxErr } = await supabase
        .from("push_outbox")
        .insert(outboxRows);

      if (outboxErr) {
        throw new Error(outboxErr.message);
      }
    }

    // 4) 監査ログ
    await triggerPushDispatchBestEffort("adminAnnouncement");

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "SEND_ANNOUNCEMENT",
      target_user_id: null,
      target_thread_id: null,
      details: {
        announcement_id: announcement.id,
        title,
        recipient_count: allUserIds.length,
      },
    });

    redirect("/admin/announcements");
  }

  const { data: announcements, error: listErr } = await supabase
    .from("admin_announcements")
    .select("id, title, body, created_by, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (listErr) {
    throw new Error(listErr.message);
  }

  const rows = (announcements ?? []) as AnnouncementRow[];

  const creatorIds = Array.from(new Set(rows.map((r) => r.created_by))) as string[];
  const nameMap = new Map<string, string>();

  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", creatorIds);

    (creators ?? []).forEach((p: ProfileRow) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">お知らせ配信</h1>
          <p className="text-sm text-muted-foreground">
            管理者が全員に通知を送信します。通知ベル / 端末通知 / 詳細画面に反映されます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/admin">
            /admin
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/settings">
            /settings
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">新しいお知らせを送信</h2>
          </CardHeader>
          <CardBody>
            <form action={sendAnnouncementAction} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">タイトル</label>
                <input
                  name="title"
                  required
                  maxLength={120}
                  placeholder="例: メンテナンスのお知らせ"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">本文</label>
                <textarea
                  name="body"
                  required
                  rows={8}
                  placeholder="お知らせ本文を入力"
                  className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-y"
                />
              </div>

              <button
                type="submit"
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90"
              >
                全員に送信
              </button>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">最近のお知らせ（20件）</h2>
          </CardHeader>
          <CardBody>
            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">まだお知らせはありません。</p>
            ) : (
              <ul className="space-y-3">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-xl border border-border bg-secondary/30 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="font-semibold break-words">{row.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          送信者: {nameMap.get(row.created_by) ?? "NoName"}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                          {bodyPreview(row.body, 180)}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatJst(row.created_at)}
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
