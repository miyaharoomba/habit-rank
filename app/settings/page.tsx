import Container from "@/app/components/ui/Container";
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  AdminLink,
  DmLink,
  MainLink,
  PageHeader,
  ParticipantsLink,
  RankingLink,
} from "@/app/components/AppPageHeader";

import PushEnableCard from "@/app/components/PushEnableCard";
import SettingsSessionControls from "./SettingsSessionControls";
import NotificationPreferencesCard from "./NotificationPreferencesCard";
import {
  resolveNotificationPreferences,
  type NotificationPreferenceRow,
} from "@/app/lib/notificationPreferences";

export default async function SettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) redirect("/auth/sign-in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name?.trim() || "NoName";

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin");
  const admin = !adminErr && Boolean(isAdmin);

  const { data: notificationPreferenceRows } = await supabase
    .from("notification_preferences")
    .select("notification_type, enabled")
    .eq("user_id", user.id);
  const notificationPreferences = resolveNotificationPreferences(
    notificationPreferenceRows as NotificationPreferenceRow[] | null
  );

  return (
    <Container>
      <PageHeader
        title="設定"
        description="アカウント、通知、表示モード、セッション操作を管理します。"
        actions={
          <>
            <MainLink />
            <DmLink />
            <RankingLink />
            <ParticipantsLink />
            {admin ? <AdminLink /> : null}
          </>
        }
      />

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">アカウント</h2>
          </CardHeader>
          <CardBody>
            <div className="text-sm">
              <span className="text-muted-foreground">表示名：</span>
              <span className="font-semibold">{displayName}</span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              user_id: <span className="font-mono">{user.id}</span>
            </div>
          </CardBody>
        </Card>

        <PushEnableCard />

        <NotificationPreferencesCard initialPreferences={notificationPreferences} />

        {admin && (
          <>
            <Card>
              <CardHeader>
                <h2 className="font-semibold">管理者</h2>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-muted-foreground">
                  管理者コンソールへ移動できます。デバッグ設定も管理者コンソール内にあります。
                </p>
                <div className="mt-3">
                  <Link
                    href="/admin"
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary/40 px-4 py-2 text-sm font-semibold hover:bg-secondary/60"
                  >
                    管理者コンソールを開く
                  </Link>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  ※ 管理者のみ表示（is_admin() 判定）
                </div>
              </CardBody>
            </Card>

          </>
        )}

        <SettingsSessionControls />
      </div>
    </Container>
  );
}
