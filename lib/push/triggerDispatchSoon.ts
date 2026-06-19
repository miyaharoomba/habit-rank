import { dispatchPendingPush } from "@/lib/push/dispatchPendingPush";

export type PushDispatchResult = {
  ok: boolean;
  status: number;
  body: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function triggerPushDispatchSoon({
  baseUrl,
  delayMs = 500,
}: {
  baseUrl?: string;
  delayMs?: number;
} = {}): Promise<PushDispatchResult> {
  if (delayMs > 0) {
    await sleep(delayMs);
  }

  // Kept for older callers; direct dispatch no longer needs a public base URL.
  void baseUrl;

  const result = await dispatchPendingPush();
  const body = JSON.stringify(result);

  return {
    ok: result.ok,
    status: result.ok ? 200 : 500,
    body,
  };
}

export async function triggerPushDispatchBestEffort(label: string, baseUrl?: string) {
  try {
    const result = await triggerPushDispatchSoon({ baseUrl });
    if (!result.ok) {
      console.error(
        `${label} push dispatch failed:`,
        result.status,
        result.body.slice(0, 500)
      );
    }
    return result;
  } catch (e) {
    console.error(`${label} push dispatch failed:`, e);
    return null;
  }
}
