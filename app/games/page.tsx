import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Boxes, Rocket } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export default async function GamesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex items-start gap-4">
          <Link
            href="/app"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border transition hover:bg-secondary/50"
            aria-label="メイン画面へ戻る"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <div>
            <div className="text-xs font-bold uppercase text-muted-foreground">HabitBase Games</div>
            <h1 className="mt-1 text-3xl font-black">ミニゲーム</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              息抜きしながら、記録と成長をみんなで競えます。
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <Link
            href="/games/pulse-runner"
            className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-[#62d8ff]/60"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-[#090d18]">
              <div className="absolute inset-x-0 bottom-0 h-16 border-t-2 border-[#62d8ff]/60 bg-[#24344d]" />
              <div className="absolute bottom-16 left-[22%] h-8 w-8 rotate-12 bg-[#62d8ff] shadow-[0_0_24px_rgba(98,216,255,0.5)]" />
              <div className="absolute bottom-16 left-[58%] h-0 w-0 border-b-0 border-l-[20px] border-r-[20px] border-t-[40px] border-l-transparent border-r-transparent border-t-[#ffd166]" />
              <div className="absolute right-[12%] top-[18%] h-24 w-2 bg-[#ff6b7a]/60" />
              <div className="absolute inset-0 flex items-start justify-between p-5">
                <span className="text-xs font-black uppercase text-[#62d8ff]">New</span>
                <Rocket className="h-7 w-7 text-[#ff7d8b]" aria-hidden="true" />
              </div>
            </div>
            <div className="p-5">
              <h2 className="text-xl font-black">Pulse Runner</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                ビートに合わせてジャンプとロケット飛行。到達率100%を目指すリズムランナー。
              </p>
              <div className="mt-4 text-sm font-bold text-[#2ca6ce]">プレイする →</div>
            </div>
          </Link>

          <Link
            href="/games/stack"
            className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-[#ff9f68]/60"
          >
            <div className="relative aspect-[16/9] overflow-hidden bg-[#090d18]">
              <div className="absolute bottom-[16%] left-1/2 h-12 w-40 -translate-x-1/2 skew-y-6 bg-[#55c2ff]" />
              <div className="absolute bottom-[34%] left-1/2 h-11 w-32 -translate-x-[42%] -skew-y-3 bg-[#ff6b6b]" />
              <div className="absolute bottom-[51%] left-1/2 h-10 w-24 -translate-x-[60%] skew-y-6 bg-[#ffd166]" />
              <div className="absolute inset-0 flex items-start justify-end p-5">
                <Boxes className="h-7 w-7 text-[#ffd166]" aria-hidden="true" />
              </div>
            </div>
            <div className="p-5">
              <h2 className="text-xl font-black">Stack Tower</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                流れるブロックを見極めて高く積む。精度とコンボでスコアを競うタイミングゲーム。
              </p>
              <div className="mt-4 text-sm font-bold text-[#df7546]">プレイする →</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
