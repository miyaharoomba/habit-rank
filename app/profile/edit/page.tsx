import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import PendingSubmitButton from "@/app/components/ui/PendingSubmitButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MAX_AVATAR_SIZE_MB = 15;
const MAX_AVATAR_SIZE_BYTES = MAX_AVATAR_SIZE_MB * 1024 * 1024;

function safeExt(filename: string) {
  const last = filename.split(".").pop() || "";
  const ext = last.toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "bin";
}

function uuidLike() {
  // @ts-ignore
  if (globalThis.crypto?.randomUUID) {
    // @ts-ignore
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
};

function avatarUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function buildErrorRedirect(message: string) {
  return `/profile/edit?error=${encodeURIComponent(message)}`;
}

export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const errorMessage = typeof sp.error === "string" ? sp.error : "";

  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  async function saveProfileAction(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      redirect("/auth/sign-in");
    }

    const rawName = String(formData.get("display_name") ?? "").trim();
    const rawStatus = String(formData.get("status_message") ?? "").trim();
    const file = formData.get("avatar");

    if (!rawName) {
      redirect(buildErrorRedirect("名前は必須です。"));
    }

    if (rawName.length > 20) {
      redirect(buildErrorRedirect("名前は20文字以内です。"));
    }

    if (rawStatus.length > 120) {
      redirect(buildErrorRedirect("ステータスメッセージは120文字以内です。"));
    }

    let avatarPath: string | null = null;

    // 既存 avatar_path を取得して維持する
    const { data: existing } = await supabase
      .from("profiles")
      .select("avatar_path")
      .eq("id", user.id)
      .maybeSingle();

    avatarPath = (existing?.avatar_path as string | null) ?? null;

    if (file instanceof File && file.size > 0) {
      const mime = (file.type || "application/octet-stream").toLowerCase();
      const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];

      if (!allowed.includes(mime)) {
        redirect(
          buildErrorRedirect(
            "アイコン画像は jpg / png / webp / gif のみ対応です。"
          )
        );
      }

      if (file.size > MAX_AVATAR_SIZE_BYTES) {
        redirect(
          buildErrorRedirect(
            `アイコン画像のサイズが大きすぎます。${MAX_AVATAR_SIZE_MB}MB以下の画像を選んでください。`
          )
        );
      }

      const ext = safeExt(file.name);
      const objectPath = `${user.id}/${uuidLike()}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("profile-avatars")
        .upload(objectPath, file, {
          contentType: mime,
          upsert: false,
        });

      if (upErr) {
        redirect(
          buildErrorRedirect(
            "アイコン画像のアップロードに失敗しました。サイズや形式を確認して再度お試しください。"
          )
        );
      }

      avatarPath = objectPath;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: rawName,
        status_message: rawStatus || null,
        avatar_path: avatarPath,
      })
      .eq("id", user.id);

    if (error) {
      redirect(buildErrorRedirect("プロフィールの保存に失敗しました。"));
    }

    redirect("/profile");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_path, status_message")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !profile) {
    throw new Error(error?.message ?? "profile not found");
  }

  const row = profile as ProfileRow;
  const avatar = avatarUrl(row.avatar_path);

  return (
    <Container>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">プロフィール編集</h1>
          <p className="text-sm text-muted-foreground">
            名前はいつでも変更できます。
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link className="text-sm text-primary hover:underline" href="/profile">
            /profile
          </Link>
          <Link className="text-sm text-primary hover:underline" href="/app">
            /app
          </Link>
        </div>
      </header>

      <div className="mt-6">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">編集フォーム</h2>
          </CardHeader>

          <CardBody>
            {errorMessage ? (
              <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            ) : null}

            <form action={saveProfileAction} className="space-y-4">
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

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium">アイコン画像</label>
                    <input
                      type="file"
                      name="avatar"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="block w-full text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      jpg / png / webp / gif、最大{MAX_AVATAR_SIZE_MB}MB
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">名前</label>
                    <input
                      name="display_name"
                      required
                      maxLength={20}
                      defaultValue={(row.display_name ?? "").trim()}
                      className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-muted-foreground">1〜20文字</p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-sm font-medium">
                      ステータスメッセージ
                    </label>
                    <textarea
                      name="status_message"
                      rows={4}
                      maxLength={120}
                      defaultValue={(row.status_message ?? "").trim()}
                      placeholder="一言プロフィールを入力"
                      className="w-full rounded-lg bg-background border border-input px-3 py-2 text-sm resize-y"
                    />
                    <p className="text-xs text-muted-foreground">0〜120文字</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <PendingSubmitButton
                  idleText="保存する"
                  pendingText="保存中…"
                  className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                />

                <Link
                  href="/profile"
                  className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                >
                  キャンセル
                </Link>
              </div>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  );
}
``