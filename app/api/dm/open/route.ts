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

    // 既存1対1スレッド探索
    const { data: myMemberships, error: myErr } = await admin
      .from("dm_thread_members")
      .select("thread_id")
      .eq("user_id", user.id);

    if (myErr) {
      return NextResponse.json({ error: myErr.message }, { status: 500 });
    }

    const threadIds = (myMemberships ?? []).map((x: any) => x.thread_id);
    let existingThreadId: string | null = null;

    if (threadIds.length > 0) {
      const { data: members, error: memberErr } = await admin
        .from("dm_thread_members")
        .select("thread_id, user_id")
        .in("thread_id", threadIds);

      if (memberErr) {
        return NextResponse.json({ error: memberErr.message }, { status: 500 });
      }

      const grouped = new Map<string, string[]>();
      for (const row of members ?? []) {
        const arr = grouped.get(row.thread_id) ?? [];
        arr.push(row.user_id);
        grouped.set(row.thread_id, arr);
      }

      for (const [threadId, userIds] of grouped.entries()) {
        const uniqueIds = Array.from(new Set(userIds));
        if (
          uniqueIds.length === 2 &&
          uniqueIds.includes(user.id) &&
          uniqueIds.includes(targetUserId)
        ) {
          existingThreadId = threadId;
          break;
        }
      }
    }

    if (existingThreadId) {
      return NextResponse.json({ ok: true, threadId: existingThreadId });
    }

    // 無ければ新規作成
    const { data: thread, error: threadErr } = await admin
      .from("dm_threads")
      .insert({})
      .select("id")
      .single();

    if (threadErr || !thread) {
      return NextResponse.json(
        { error: threadErr?.message ?? "スレッド作成に失敗しました" },
        { status: 500 }
      );
    }

    const threadId = thread.id as string;

    const { error: memberInsertErr } = await admin.from("dm_thread_members").insert([
      { thread_id: threadId, user_id: user.id },
      { thread_id: threadId, user_id: targetUserId },
    ]);

    if (memberInsertErr) {
      return NextResponse.json({ error: memberInsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, threadId });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
``