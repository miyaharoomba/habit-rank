import { NextResponse } from "next/server";
import { dispatchPendingPush } from "@/lib/push/dispatchPendingPush";

const CRON_DISPATCH_VERSION = "cron_dispatch_v2026_06_19_check";

function getAuthDiagnostics(authHeader: string | null, cronSecret: string | undefined) {
  return {
    version: CRON_DISPATCH_VERSION,
    cronSecretConfigured: Boolean(cronSecret),
    authorizationHeaderPresent: Boolean(authHeader),
    authorizationHeaderLength: authHeader?.length ?? 0,
    authorizationUsesBearer: Boolean(authHeader?.startsWith("Bearer ")),
  };
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        diagnostics: getAuthDiagnostics(authHeader, cronSecret),
      },
      { status: 401 }
    );
  }

  if (requestUrl.searchParams.get("check") === "1") {
    return NextResponse.json({
      ok: true,
      authenticated: true,
      version: CRON_DISPATCH_VERSION,
      pushDispatchSecretConfigured: Boolean(process.env.PUSH_DISPATCH_SECRET),
    });
  }

  const result = await dispatchPendingPush();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
