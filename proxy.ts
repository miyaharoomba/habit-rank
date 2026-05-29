import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ✅ Web Push 系は合言葉認証で守るのでログイン不要
  if (pathname.startsWith("/api/push/")) {
    return NextResponse.next();
  }

  // ✅ 通知APIは “ログイン画面へリダイレクト” ではなく、
  //    route側に401を返させる（APIを安定させる）
  if (pathname.startsWith("/api/notifications")) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
