import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import TitleSettingCard from "./TitleSettingCard";

type ProfileRow = {
  id: string;
  display_name: string | null;
  avatar_path: string | null;
  status_message: string | null;
  current_title_badge_id: string | null;
};

type UserBadgeRow = {
  badge_id: string;
  unlocked_at: string;
};

type BadgeRow = {
  id: string;
  title: string;
  title_label: string | null;
  badge_rank: "platinum" | "gold" | "silver" | "bronze";
};

function avatarProxyUrl(path: string | null) {
  if (!path) return null;
  return `/api/profile/avatar?path=${encodeURIComponent(path)}`;
}

function extFromName(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx < 0) return "bin";
  return name.slice(idx + 1).toLowerCase();
}

export default async function ProfileEditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    redirect("/auth/sign-in");
  }

  const [
    { data: profile, error: profileErr },
    { data: userBadges, error: userBadgesErr },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_path, status_message, current_title_badge_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_badges")
      .select("badge_id, unlocked_at")
      .eq("user_id", user.id)
      .order("unlocked_at", { ascending: false }),
  ]);

  if (profileErr) {
    throw new Error(profileErr.message);
  }

  if (userBadgesErr) {
    throw new Error(userBadgesErr.message);
  }

  const profileRow = (profile ?? {
    id: user.id,
    display_name: "",
    avatar_path: null,
    status_message: "",
    current_title_badge_id: null,
  }) as ProfileRow;

  const earnedRows = (userBadges ?? []) as UserBadgeRow[];
  const badgeIds = Array.from(new Set(earnedRows.map((x) => x.badge_id)));

  let badgeOptions: Array<{
    badge_id: string;
    title: string;
    title_label: string | null;
    badge_rank: "platinum" | "gold" | "silver" | "bronze";
    unlocked_at: string;
  }> = [];

  if (badgeIds.length > 0) {
    const { data: badges, error: badgesErr } = await supabase
      .from("badges")
      .select("id, title, title_label, badge_rank")
      .in("id", badgeIds);

    if (badgesErr) {
      throw new Error(badgesErr.message);
    }

    const badgeMap = new Map<string, BadgeRow>();
    (badges ?? []).forEach((b: any) => {
      badgeMap.set(b.id, b as BadgeRow);
    });

    badgeOptions = earnedRows
      .map((ub) => {
        const badge = badgeMap.get(ub.badge_id);
        if (!badge) return null;
        return {
          badge_id: ub.badge_id,
          title: badge.title,
          title_label: badge.title_label,
          badge_rank: badge.badge_rank,
          unlocked_at: ub.unlocked_at,
        };
      })
      .filter(Boolean) as Array<{
      badge_id: string;
      title: string;
      title_label: string | null;
      badge_rank: "platinum" | "gold" | "silver" | "bronze";
      unlocked_at: string;
    }>;
  }

  async function saveProfile(formData: FormData): Promise<void> {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/auth/sign-in");
    }

    const displayName = String(formData.get("display_name") ?? "").trim();
    const statusMessage = String(formData.get("status_message") ?? "").trim();
    const avatar = formData.get("avatar");

    if (!displayName) {
      redirect("/profile/edit?error=displayName");
    }

    if (displayName.length > 20) {
      redirect("/profile/edit?error=displayNameTooLong");
    }

    if (statusMessage.length > 160) {
      redirect("/profile/edit?error=statusTooLong");
    }

    let nextAvatarPath: string | null = profileRow.avatar_path ?? null;

    if (avatar instanceof File && avatar.size > 0) {
      const maxBytes = 50 * 1024 * 1024;
      if (avatar.size > maxBytes) {
        redirect("/profile/edit?error=avatarTooLarge");
      }

      const mime = avatar.type || "";
      if (!mime.startsWith("image/")) {
        redirect("/profile/edit?error=avatarType");
      }

      const ext = extFromName(avatar.name || "avatar.bin");
      const path = `${user.id}/${Date.now()}.${ext}`;
      const arrayBuffer = await avatar.arrayBuffer();

      const { error: uploadErr } = await supabase.storage
        .from("profile-avatars")
        .upload(path, arrayBuffer, {
          contentType: avatar.type || "application/octet-stream",
          upsert: true,
        });

      if (uploadErr) {
        redirect("/profile/edit?error=avatarUpload");
      }

      nextAvatarPath = path;
    }

    const { error: updateErr } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          display_name: displayName,
          status_message: statusMessage,
          avatar_path: nextAvatarPath,
        },
        { onConflict: "id" }
      );

    if (updateErr) {
      redirect("/profile/edit?error=save");
    }

    revalidatePath("/profile");
    revalidatePath("/profile/edit");
    redirect("/profile?saved=1");
  }

  const avatarUrl = avatarProxyUrl(profileRow.avatar_path);

  const error =
    typeof sp.error === "string"
      ? sp.error
      : "";

  return (
    <Container>
      <div role="banner" className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">プロフィール編集</h1>
          <p className="text-sm text-muted-foreground">
            名前・一言・アイコン・称号を編集できます。
          </p>
        </div>

        <div className="flex gap-3">
          <Link href="/profile">プロフィール</Link>
          <Link href="/badges">称号</Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4">
        {error ? (
          <Card>
            <CardBody>
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error === "displayName" && "表示名は必須です。"}
                {error === "displayNameTooLong" && "表示名は20文字以内で入力してください。"}
                {error === "statusTooLong" && "一言は160文字以内で入力してください。"}
                {error === "avatarTooLarge" && "アイコン画像は50MB以下にしてください。"}
                {error === "avatarType" && "アイコン画像は画像ファイルを選択してください。"}
                {error === "avatarUpload" && "アイコン画像のアップロードに失敗しました。"}
                {error === "save" && "プロフィール保存に失敗しました。"}
                {![
                  "displayName",
                  "displayNameTooLong",
                  "statusTooLong",
                  "avatarTooLarge",
                  "avatarType",
                  "avatarUpload",
                  "save",
                ].includes(error) && "エラーが発生しました。"}
              </div>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <h2 className="font-semibold">基本情報</h2>
          </CardHeader>
          <CardBody>
            <form action={saveProfile} className="space-y-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="shrink-0">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt="Avatar"
                        className="h-24 w-24 rounded-full border border-border object-cover"
                      />
                    ) : (
                      <div className="h-24 w-24 rounded-full border border-border bg-secondary/40 flex items-center justify-center text-2xl font-bold text-muted-foreground">
                        {(profileRow.display_name ?? "?").trim().slice(0, 1) || "?"}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      表示名
                    </label>
                    <input
                      type="text"
                      name="display_name"
                      defaultValue={profileRow.display_name ?? ""}
                      maxLength={20}
                      required
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      一言
                    </label>
                    <textarea
                      name="status_message"
                      defaultValue={profileRow.status_message ?? ""}
                      maxLength={160}
                      rows={4}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      アイコン画像
                    </label>
                    <input
                      type="file"
                      name="avatar"
                      accept="image/*"
                      className="block w-full text-sm"
                    />
                    <div className="mt-1 text-xs text-muted-foreground">
                      jpg / png / webp / gif 推奨・最大 50MB
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="submit"
                      className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      保存する
                    </button>

                    <Link
                      href="/profile"
                      className="inline-flex items-center rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-secondary/40"
                    >
                      キャンセル
                    </Link>
                  </div>
                </div>
              </div>
            </form>
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="font-semibold">称号</h2>
              </CardHeader>
              <CardBody>
                <TitleSettingCard
                  currentTitleBadgeId={profileRow.current_title_badge_id}
                  options={badgeOptions}
                />
              </CardBody>
            </Card>
          </div>
        </Container>
      );
    }