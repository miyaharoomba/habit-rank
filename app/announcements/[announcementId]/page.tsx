// app/announcements/[announcementId]/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  created_by: string;
  created_at: string;
};

export default async function AnnouncementDetailPage({
  params,
}: {
  params: Promise<{ announcementId: string }>;
}) {
  const { announcementId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in");
  }

  const { data: announcement, error } = await supabase
    .from("admin_announcements")
    .select("id, title, body, created_by, created_at")
    .eq("id", announcementId)
    .maybeSingle();

  if (error || !announcement) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">お知らせ</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">お知らせが見つかりません。</p>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="text-sm text-primary hover:underline" href="/app">
                /app へ戻る
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/ranking">
                /ranking
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const row = announcement as AnnouncementRow;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", row.created_by)
    .maybeSingle();

  const senderName = (profile?.display_name ?? "").trim() || "管理者";

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">お知らせ</h1>
          <p className="text-sm text-muted-foreground">
            {senderName} からのお知らせ
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/ranking">
            /ranking
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/dm">
            /dm
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">タイトル</h2>
          </CardHeader>
          <CardBody>
            <div className="text-xl font-bold break-words">{row.title}</div>
            <div className="mt-2 text-xs text-muted-foreground tabular-nums">
              配信日時: {formatJst(row.created_at)}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-semibold">本文</h2>
          </CardHeader>
          <CardBody>
            <div className="rounded-lg border border-border bg-secondary/30 px-4 py-4 text-sm whitespace-pre-wrap break-words leading-relaxed">
              {row.body}
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}