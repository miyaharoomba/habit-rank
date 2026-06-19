export type PushDispatchResult = {
  ok: boolean;
  status: number;
  body: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveBaseUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function trimTrailingSlash(url: string) {
  return url.replace(/\/+$/, "");
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

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (process.env.PUSH_DISPATCH_SECRET) {
    headers["x-push-secret"] = process.env.PUSH_DISPATCH_SECRET;
  }

  if (process.env.CRON_SECRET) {
    headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
  }

  const resp = await fetch(`${trimTrailingSlash(baseUrl ?? resolveBaseUrl())}/api/push/dispatch`, {
    method: "POST",
    headers,
    cache: "no-store",
  });

  const body = await resp.text().catch(() => "");
  return {
    ok: resp.ok,
    status: resp.status,
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
