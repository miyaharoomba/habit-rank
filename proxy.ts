import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // ✅ Web Push系APIは内部認証で守るのでログイン不要
  if (pathname.startsWith("/api/push/")) {
    return NextResponse.next();
  }

  // ✅ Cron系APIもログイン不要（CRON_SECRETで守る）
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};