// app/users/[userId]/page.tsx
import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatJst } from "@/lib/time";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  if (userId === user.id) {
    redirect("/profile");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, status_message, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!profile) {
    return (
      <Container>
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">ユーザープロフィール</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-destructive">プロフィールが見つかりません。</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link className="text-sm text-primary hover:underline" href="/participants">
                /participants へ戻る
              </Link>
              <Link className="text-sm text-primary hover:underline" href="/app">
                /app
              </Link>
            </div>
          </CardBody>
        </Card>
      </Container>
    );
  }

  const row = profile as ProfileRow;
  const avatar = avatarUrl(row.avatar_path);

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">ユーザープロフィール</h1>
          <p className="text-sm text-muted-foreground">他の参加者のプロフィール情報です。</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/participants">
            /participants
          </Link>
          <Link
            className="text-sm text-primary hover:underline"
            href={`/dm/new?u=${encodeURIComponent(row.id)}`}
          >
            DMを送る
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">プロフィール情報</h2>
          </CardHeader>
          <CardBody>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="shrink-0">
                {avatar ? (
                  <img
                    src={avatar}
                    alt="avatar"
                    className="h-24 w-24 rounded-full object-cover border border-border"
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {(row.display_name ?? "?").trim().slice(0, 1) || "?"}
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xl font-bold break-words">
                  {(row.display_name ?? "").trim() || "NoName"}
                </div>

                <div className="mt-2 rounded-xl border border-border bg-secondary/30 px-4 py-3 text-sm whitespace-pre-wrap break-words">
                  {(row.status_message ?? "").trim() || "ステータスメッセージはまだ設定されていません。"}
                </div>

                <div className="mt-3 space-y-1 text-xs text-muted-foreground tabular-nums">
                  <div>ユーザーID: {row.id}</div>
                  <div>更新日時: {row.updated_at ? formatJst(row.updated_at) : "-"}</div>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``