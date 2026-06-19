import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";
import {
  AdminLink,
  HeaderLink,
  PageHeader,
} from "@/app/components/AppPageHeader";
import { Flag, ScrollText } from "lucide-react";

type Report = {
  id: number;
  reporter_id: string;
  thread_id: string;
  reason: string;
  created_at: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  admin_note: string | null;
};

type Profile = { id: string; display_name: string | null };

type Thread = { id: string; user_low: string; user_high: string };

type Msg = {
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

type MsgView = Msg & { media_url: string | null };

function maskId(id: string | null) {
  if (!id) return "-";
  return `${id.slice(0, 8)}…`;
}

function bytes(size: number | null) {
  if (!size || !Number.isFinite(size)) return "";
  const kb = size / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const rid = Number(reportId);

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/auth/sign-in");

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  if (adminErr || !isAdmin) redirect("/settings");

  if (!rid || Number.isNaN(rid)) redirect("/admin/reports");

  // Server Action（フォーム action に渡す。戻り値は void/Promise<void>） [2](https://attendence-system-1910.vercel.app/users/login)[3](https://techstudywork.jp/articles/vercel-deployment-complete-guide)
  async function updateReportAction(formData: FormData): Promise<void> {
    "use server";

    const reportId = Number(formData.get("report_id") ?? 0);
    const status = String(formData.get("status") ?? "").trim();
    const adminNote = String(formData.get("admin_note") ?? "").trim();

    const supabase = await createClient();

    const { data: admin } = await supabase.rpc("is_admin");
    if (!admin) redirect("/settings");

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/auth/sign-in");

    if (!reportId || !["open", "reviewing", "resolved", "dismissed"].includes(status)) {
      redirect("/admin/reports");
    }

    const { data: updated, error } = await supabase
      .from("dm_reports")
      .update({
        status,
        admin_note: adminNote || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", reportId)
      .select("id, thread_id, reporter_id, status")
      .maybeSingle();

    if (error) throw new Error(error.message);

    await supabase.from("admin_audit_logs").insert({
      actor_id: user.id,
      action: "REVIEW_REPORT",
      target_user_id: updated?.reporter_id ?? null,
      target_thread_id: updated?.thread_id ?? null,
      details: { report_id: reportId, status, admin_note: adminNote || null },
    });

    redirect(`/admin/reports/${reportId}`);
  }

  // 1) 通報取得
  const { data: report, error: repErr } = await supabase
    .from("dm_reports")
    .select("id, reporter_id, thread_id, reason, created_at, status, reviewed_by, reviewed_at, admin_note")
    .eq("id", rid)
    .maybeSingle();

  if (repErr || !report) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">通報詳細</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">通報が見つかりません。</p>
            <div className="mt-3">
              <HeaderLink href="/admin/reports" icon={Flag}>
                通報一覧
              </HeaderLink>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const r = report as Report;

  // 2) 通報者/対応者の名前
  const ids = Array.from(new Set([r.reporter_id, r.reviewed_by].filter(Boolean))) as string[];
  const nameMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    (profs ?? []).forEach((p: Profile) => {
      nameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  // 3) スレッド情報
  const { data: thread } = await supabase
    .from("dm_threads")
    .select("id, user_low, user_high")
    .eq("id", r.thread_id)
    .maybeSingle();

  const t = thread as Thread | null;

  const memberNameMap = new Map<string, string>();
  if (t) {
    const { data: ps } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", [t.user_low, t.user_high]);
    (ps ?? []).forEach((p: Profile) => {
      memberNameMap.set(p.id, (p.display_name ?? "").trim() || "NoName");
    });
  }

  // 4) 対象スレッドのメッセージ
  const { data: msgs, error: msgErr } = await supabase
    .from("dm_messages")
    .select("id, sender_id, body, created_at, message_type, image_path, file_path, file_name, file_mime, file_size")
    .eq("thread_id", r.thread_id)
    .order("created_at", { ascending: true });

  const baseMsgs = (msgs ?? []) as Msg[];

  // 5) media signed URL（private bucket）
  const enriched: MsgView[] = await Promise.all(
    baseMsgs.map(async (m) => {
      if (m.message_type === "image" && m.image_path) {
        const { data: signed } = await supabase.storage.from("dm-media").createSignedUrl(m.image_path, 60 * 30);
        return { ...m, media_url: signed?.signedUrl ?? null };
      }
      if ((m.message_type === "video" || m.message_type === "file") && m.file_path) {
        const { data: signed } = await supabase.storage.from("dm-media").createSignedUrl(m.file_path, 60 * 30);
        return { ...m, media_url: signed?.signedUrl ?? null };
      }
      return { ...m, media_url: null };
    })
  );

  return (
    <Container>
      <PageHeader
        title={`通報詳細 #${r.id}`}
        description={
          <>
            状態: <span className="font-semibold">{r.status}</span>
          </>
        }
        actions={
          <>
            <HeaderLink href="/admin/reports" icon={Flag}>
              通報一覧
            </HeaderLink>
            <AdminLink />
            <HeaderLink href="/admin/audit" icon={ScrollText}>
              監査ログ
            </HeaderLink>
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">通報情報</h2>
          </CardHeader>
          <CardBody>
            <div className="text-sm">
              <div className="text-muted-foreground">通報者</div>
              <div className="font-semibold">
                {nameMap.get(r.reporter_id) ?? "NoName"}（{maskId(r.reporter_id)}）
              </div>
            </div>

            <div className="mt-3 text-sm">
              <div className="text-muted-foreground">対象スレッド</div>
              <div className="font-mono">{maskId(r.thread_id)}</div>
              {t && (
                <div className="mt-1 text-xs text-muted-foreground">
                  参加者: {memberNameMap.get(t.user_low) ?? "NoName"}（{maskId(t.user_low)}） /{" "}
                  {memberNameMap.get(t.user_high) ?? "NoName"}（{maskId(t.user_high)}）
                </div>
              )}
            </div>

            <div className="mt-3 text-sm">
              <div className="text-muted-foreground">通報理由</div>
              <div className="mt-1 rounded-lg border border-border bg-secondary/30 px-3 py-2 whitespace-pre-wrap break-words">
                {r.reason}
              </div>
            </div>

            <div className="mt-3 text-xs text-muted-foreground tabular-nums">
              作成: {formatJst(r.created_at)} / 最終対応: {r.reviewed_at ? formatJst(r.reviewed_at) : "-"} / by{" "}
              {r.reviewed_by ? maskId(r.reviewed_by) : "-"}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">審査</h2>
          </CardHeader>
          <CardBody>
            <form action={updateReportAction} className="grid gap-2">
              <input type="hidden" name="report_id" value={String(r.id)} />

              <select
                name="status"
                defaultValue={r.status}
                className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
              >
                <option value="open">open</option>
                <option value="reviewing">reviewing</option>
                <option value="resolved">resolved</option>
                <option value="dismissed">dismissed</option>
              </select>

              <textarea
                name="admin_note"
                defaultValue={r.admin_note ?? ""}
                placeholder="管理者メモ（任意）"
                rows={3}
                className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
              />

              <button
                type="submit"
                className="w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-semibold hover:opacity-90"
              >
                更新
              </button>

              <div className="text-[11px] text-muted-foreground">※ 更新は監査ログに記録されます。</div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">対象スレッドのメッセージ</h2>
              <span className="text-xs text-muted-foreground">通報対象のみ表示</span>
            </div>
          </CardHeader>

          <CardBody>
            {msgErr ? (
              <p className="text-sm text-destructive">取得エラー: {msgErr.message}</p>
            ) : enriched.length === 0 ? (
              <p className="text-sm text-muted-foreground">メッセージがありません。</p>
            ) : (
              <ul className="space-y-2">
                {enriched.map((m) => {
                  const senderName =
                    memberNameMap.get(m.sender_id) ??
                    nameMap.get(m.sender_id) ??
                    "NoName";

                  return (
                    <li key={m.id} className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold">
                            {senderName}{" "}
                            <span className="text-xs text-muted-foreground">
                              （{maskId(m.sender_id)}）
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                            {formatJst(m.created_at)} / type: {m.message_type}
                          </div>
                        </div>
                      </div>

                      {m.body ? (
                        <div className="mt-2 text-sm whitespace-pre-wrap break-words">{m.body}</div>
                      ) : null}

                      {m.media_url ? (
                        <div className="mt-2">
                          <a
                            href={m.media_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-primary hover:underline"
                          >
                            {m.message_type === "image"
                              ? "画像を開く"
                              : m.message_type === "video"
                              ? "動画を開く"
                              : `ファイルを開く（${m.file_name ?? "file"} / ${bytes(m.file_size)}）`}
                          </a>
                        </div>
                      ) : null}
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
