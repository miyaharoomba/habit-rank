"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function openDm(otherUserId: string) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) redirect("/auth/sign-in"); // redirectはサーバー側で利用可 [1](https://stackoverflow.com/questions/76509197/unable-to-delete-cookie-using-next-js-server-side-action)

  if (!otherUserId) {
    redirect("/ranking");
  }

  // DB関数 create_or_get_dm(other_user uuid) を呼ぶ
  const { data: threadId, error } = await supabase.rpc("create_or_get_dm", {
    other_user: otherUserId,
  });

  if (error || !threadId) {
    // ここは好きにエラーページ作ってもOK。いったんrankingへ戻す
    redirect("/ranking");
  }

  redirect(`/dm/${threadId}`); // スレッドへ移動 [1](https://stackoverflow.com/questions/76509197/unable-to-delete-cookie-using-next-js-server-side-action)
}
``