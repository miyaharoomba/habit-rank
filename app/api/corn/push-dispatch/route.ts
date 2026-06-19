import { NextResponse } from "next/server";

export async function GET(request: Request) {
  // ✅ Vercel Cronの認証（Authorization: Bearer <CRON_SECRET> が自動付与される）
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ✅ 同一オリジンのdispatchを内部呼び出し（POST + x-push-secret）
  const origin = new URL(request.url).origin;

  const resp = await fetch(`${origin}/api/push/dispatch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      "x-push-secret": process.env.PUSH_DISPATCH_SECRET ?? "",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  const text = await resp.text();

  return new NextResponse(text, {
    status: resp.status,
    headers: { "Content-Type": "application/json" },
  });
}
