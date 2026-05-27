"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not logged in");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  // ✅ INSERTはRPCに任せる（sender_idも参加者チェックもDB側で確定）
  const { error } = await supabase.rpc("send_dm_message", {
    p_thread_id: threadId,
    p_body: body,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}