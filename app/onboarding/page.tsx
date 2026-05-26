import { saveNameAndGo } from "./actions"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"

import Container from "@/app/components/ui/Container"
import Card, { CardBody, CardHeader } from "@/app/components/ui/Card"
import Input from "@/app/components/ui/Input"
import Button from "@/app/components/ui/Button"

export default async function OnboardingPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/auth/sign-in")

  // すでに名前があるなら onboarding は不要
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  if (profile?.display_name?.trim()) redirect("/app")

  return (
    <Container>
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <h1 className="text-xl font-bold tracking-tight">
              はじめに名前を設定しよう
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              この名前はランキングや表示に使われます（後から変更できます）。
            </p>
          </CardHeader>

          <CardBody>
            <form action={saveNameAndGo} className="grid gap-3">
              <Input
                name="displayName"
                placeholder="20文字以内"
                maxLength={20}
                autoFocus
              />

              <div className="flex flex-wrap gap-3">
                <Button type="submit">保存して開始</Button>

                <Link href="/auth/sign-in">
                  <Button type="button" variant="ghost">
                    キャンセル
                  </Button>
                </Link>
              </div>

              <p className="text-xs text-muted-foreground">
                ※ 名前は「設定」画面からいつでも変更できます。
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </Container>
  )
}
``