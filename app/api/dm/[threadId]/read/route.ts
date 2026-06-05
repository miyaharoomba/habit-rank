import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // スレッド参加者か確認
  const { data: thread, error: threadErr } = await supabase
    .from("dm_threads")
    .select("id, user_low, user_high")
    .eq("id", threadId)
    .maybeSingle();

  if (threadErr) {
    return NextResponse.json({ error: threadErr.message }, { status: 500 });
  }

  if (!thread) {
    return NextResponse.json({ error: "thread not found" }, { status: 404 });
  }

  const isMember = thread.user_low === user.id || thread.user_high === user.id;
  if (!isMember) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // 自分以外が送った未読メッセージを既読にする
  const { error: updErr } = await supabase
    .from("dm_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId)
    .neq("sender_id", user.id)
    .is("read_at", null)
    .is("unsent_at", null);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
