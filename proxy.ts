import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ✅ Web Push dispatch / subscribe などは合言葉認証や内部認証で守るのでログイン不要
  if (pathname.startsWith("/api/push/")) {
    return NextResponse.next();
  }

  // ✅ Vercel Cron から叩くエンドポイントもログイン不要（CRON_SECRETで守る）
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  // それ以外は従来通りセッション更新
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
``