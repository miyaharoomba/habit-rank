import { NextResponse } from "next/server";
import { dispatchPendingPush } from "@/lib/push/dispatchPendingPush";

export async function POST(request: Request) {
  const secret = process.env.PUSH_DISPATCH_SECRET;
  if (!secret || request.headers.get("x-push-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await dispatchPendingPush();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (error) {
    console.error("push dispatch failed:", error);
    return NextResponse.json({ ok: false, error: "notification service unavailable" }, { status: 503 });
  }
}
