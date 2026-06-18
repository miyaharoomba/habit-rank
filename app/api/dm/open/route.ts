import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getAdminClient() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function sortPair(a: string, b: string) {
  return a < b ? { user_low: a, user_high: b } : { user_low: b, user_high: a };
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const admin = getAdminClient();

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const targetUserId = String(body?.targetUserId ?? "").trim();

    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId is required" }, { status: 400 });
    }

    if (targetUserId === user.id) {
      return NextResponse.json({ error: "自分自身とはDMできません" }, { status: 400 });
    }

    const pair = sortPair(user.id, targetUserId);

    const { data: existing, error: existingErr } = await admin
      .from("dm_threads")
      .select("id")
      .eq("user_low", pair.user_low)
      .eq("user_high", pair.user_high)
      .maybeSingle();

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    if (existing?.id) {
      return NextResponse.json({ ok: true, threadId: existing.id });
    }

    const { data: created, error: createErr } = await admin
      .from("dm_threads")
      .insert({
        user_low: pair.user_low,
        user_high: pair.user_high,
      })
      .select("id")
      .single();

    if (createErr || !created) {
      return NextResponse.json(
        { error: createErr?.message ?? "スレッド作成に失敗しました" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, threadId: created.id });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
