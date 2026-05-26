import { createClient } from "@/lib/supabase/server"
import { updateDisplayName } from "./actions"
import { redirect } from "next/navigation"
import Link from "next/link"

import Container from "@/app/components/ui/Container"
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card"
import Input from "@/app/components/ui/Input"
import Button from "@/app/components/ui/Button"

export default async function SettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/sign-in")

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  return (
    <Container>
      {/* ヘッダー */}
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">設定</h1>
          <p className="text-sm text-muted-foreground">
            表示名を変更できます
          </p>
        </div>

        <Link
          href="/app"
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          ← メインへ
        </Link>
      </header>

      <div className="mt-6 grid gap-4">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">表示名</h2>
          </CardHeader>

          <CardBody>
            {/* 名前変更フォーム */}
            <form action={updateDisplayName} className="flex flex-col gap-3">
              <Input
                name="displayName"
                defaultValue={profile?.display_name ?? ""}
                placeholder="20文字以内"
                maxLength={20}
              />

              <div className="flex flex-wrap gap-3">
                <Button type="submit">保存</Button>

                <Link href="/app">
                  <Button type="button" variant="ghost">
                    キャンセル
                  </Button>
                </Link>
              </div>

              <p className="text-xs text-muted-foreground">
                ※ 変更はいつでもできます。名前はランキング表示などに使う想定です。
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  )
}