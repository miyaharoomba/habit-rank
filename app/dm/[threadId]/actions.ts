"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const { error } = await supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: user.id,
    body,
  });

  if (error) throw new Error(error.message);

  // ✅ dm_threads の更新はトリガーがやるので不要
  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}