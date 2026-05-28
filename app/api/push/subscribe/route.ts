import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type IncomingSubscription = {
  endpoint?: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
  userAgent?: string;
  platform?: string;
};

export async function POST(req: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as IncomingSubscription | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const endpoint = String(body.endpoint ?? "").trim();
  const p256dh = String(body.keys?.p256dh ?? "").trim();
  const auth = String(body.keys?.auth ?? "").trim();

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { ok: false, error: "endpoint/keys are required" },
      { status: 400 }
    );
  }

  const uaHeader = req.headers.get("user-agent") ?? "";
  const user_agent = (String(body.userAgent ?? "").trim() || uaHeader).slice(0, 500);
  const platform = String(body.platform ?? "").trim().slice(0, 80);

  const payload = {
    user_id: user.id,
    endpoint,
    p256dh,
    auth,
    user_agent: user_agent || null,
    platform: platform || null,
    disabled: false,
    last_seen_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("push_subscriptions")
    .upsert(payload, { onConflict: "user_id,endpoint" });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
``