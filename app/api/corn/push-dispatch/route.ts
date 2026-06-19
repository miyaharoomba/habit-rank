import { NextResponse } from "next/server";

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
