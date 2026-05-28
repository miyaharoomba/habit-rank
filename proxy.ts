import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ✅ Web Push 系 API は「x-push-secret」やAPI内の認証で守るのでログイン不要
  // curl / Cron など Cookie無しで叩けるように proxy を素通りさせる
  if (pathname.startsWith("/api/push/")) {
    return NextResponse.next();
  }

  // （必要なら通知APIも素通りにできる。通常はログイン必須でOK）
  // if (pathname.startsWith("/api/notifications")) return NextResponse.next();

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
