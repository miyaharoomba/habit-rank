import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // ここでは通常ルートだけ処理する
  return await updateSession(request);
}

export const config = {
  matcher: [
    /**
     * 除外するもの
     * - /api/push/*      … Web Push系（dispatch / subscribe 等）
     * - /api/cron/*      … Vercel Cron系
     * - _next/static
     * - _next/image
     * - favicon.ico
     * - 画像拡張子
     */
    "/((?!api/push|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};