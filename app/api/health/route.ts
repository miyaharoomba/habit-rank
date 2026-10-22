import { NextResponse } from "next/server";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const checks = { auth: false, database: false };
  if (url && key) {
    const results = await Promise.allSettled([
      fetch(url + "/auth/v1/health", { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) }),
      fetch(url + "/rest/v1/profiles?select=id&limit=0", { headers: { apikey: key }, cache: "no-store", signal: AbortSignal.timeout(5000) }),
    ]);
    checks.auth = results[0].status === "fulfilled" && results[0].value.ok;
    checks.database = results[1].status === "fulfilled" && results[1].value.ok;
    for (const result of results) if (result.status === "fulfilled") await result.value.body?.cancel();
  }
  const healthy = checks.auth && checks.database;
  const release = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
  return NextResponse.json({ status: healthy ? "healthy" : "unavailable", release, checks }, {
    status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" },
  });
}
