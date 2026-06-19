"use server";

import { revalidatePath } from "next/cache";
import { triggerPushDispatchBestEffort } from "@/lib/push/triggerDispatchSoon";
import { createClient } from "@/lib/supabase/server";

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not logged in");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const { error } = await supabase.rpc("send_dm_message", {
    p_thread_id: threadId,
    p_body: body,
  });

  if (error) throw new Error(error.message);

  await triggerPushDispatchBestEffort("sendDm");

  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}
