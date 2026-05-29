import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  // API は matcher で除外するので、ここには通常ページだけ来る
  return await updateSession(request);
}

export const config = {
  matcher: [
    /**
     * proxy をかけるのは「ページ系」だけ。
     * API は全部除外する。
     *
     * 除外:
     * - /api/*
     * - _next/static
     * - _next/image
     * - favicon.ico
     * - 画像などの静的拡張子
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
