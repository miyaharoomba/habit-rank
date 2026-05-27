"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const bodyRaw = String(formData.get("body") ?? "");
  const body = bodyRaw.trim();
  if (!body) return;

  // RLSで sender_id=auth.uid & 当事者のみ insert を保証する想定
  const { error } = await supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    body,
  });

  if (error) throw new Error(error.message);

  // スレッドの最終更新（任意だけど一覧に効く）
  await supabase
    .from("dm_threads")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);

  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}
