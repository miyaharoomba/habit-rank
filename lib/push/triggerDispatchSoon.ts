import { after } from "next/server";
import { dispatchPendingPush } from "@/lib/push/dispatchPendingPush";

export type PushDispatchResult = { ok: boolean; status: number; body: string };

// The outbox is durable. Notification delivery must not hold up saving a record
// or sending a message; the scheduled dispatcher also recovers pending work.
export async function triggerPushDispatchSoon({ baseUrl, delayMs }: { baseUrl?: string; delayMs?: number } = {}): Promise<PushDispatchResult> {
  void baseUrl;
  void delayMs;
  after(async () => {
    try {
      const result = await dispatchPendingPush();
      if (!result.ok) console.error("background push dispatch failed:", result.error ?? result.failed);
    } catch (error) { console.error("background push dispatch failed:", error); }
  });
  return { ok: true, status: 202, body: "queued" };
}

export async function triggerPushDispatchBestEffort(label: string, baseUrl?: string) {
  try { return await triggerPushDispatchSoon({ baseUrl }); }
  catch (error) {
    console.error(label + " push dispatch scheduling failed:", error);
    return null;
  }
}
