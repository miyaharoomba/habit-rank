import { NextResponse } from "next/server";
import {
  dispatchPendingPush,
  PUSH_DISPATCH_VERSION,
} from "@/lib/push/dispatchPendingPush";

function bearerToken(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

function isDispatchAuthorized(request: Request) {
  const pushSecret = process.env.PUSH_DISPATCH_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-push-secret");
  const token = bearerToken(request);

  return Boolean(
    (pushSecret && headerSecret === pushSecret) ||
      (cronSecret && token === cronSecret)
  );
}

function forbidden() {
  return NextResponse.json(
    { ok: false, version: PUSH_DISPATCH_VERSION, error: "forbidden" },
    { status: 403 }
  );
}

function errorMessage(e: unknown) {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e);
}

async function runDispatchResponse() {
  const result = await dispatchPendingPush();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  try {
    if (!isDispatchAuthorized(request)) {
      return forbidden();
    }

    return await runDispatchResponse();
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, version: PUSH_DISPATCH_VERSION, error: errorMessage(e) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!isDispatchAuthorized(request)) {
      return forbidden();
    }

    return await runDispatchResponse();
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, version: PUSH_DISPATCH_VERSION, error: errorMessage(e) },
      { status: 500 }
    );
  }
}
