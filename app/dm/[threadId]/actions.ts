"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { sendDmPushNow } from "@/lib/push/sendDmPushNow";

export async function sendDm(threadId: string, formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not logged in");

  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  // ✅ DM保存本体
  const { error } = await supabase.rpc("send_dm_message", {
    p_thread_id: threadId,
    p_body: body,
  });

  if (error) throw new Error(error.message);

  // ✅ ここで即時通知を飛ばす
  // 通知が失敗してもDM送信自体は成功させたいので握りつぶす
  try {
    await sendDmPushNow({
      threadId,
      senderId: user.id,
      body,
    });
  } catch (e) {
    console.error("sendDmPushNow failed:", e);
  }

  revalidatePath(`/dm/${threadId}`);
  revalidatePath("/dm");
}
``