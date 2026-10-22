import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchPublicHtml, normalizePublicHttpUrl } from "@/lib/http/publicHtml";

type PreviewResponse = {
  ok: true;
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string | null;
};

type FailResponse = {
  ok: false;
  error: string;
};

type CacheEntry = {
  expiresAt: number;
  value: PreviewResponse | FailResponse;
};

const CACHE_TTL_MS = 1000 * 60 * 30; // 30分
const cache = new Map<string, CacheEntry>();

function getCached(url: string) {
  const hit = cache.get(url);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(url);
    return null;
  }
  return hit.value;
}

function setCached(url: string, value: PreviewResponse | FailResponse) {
  for (const [key, entry] of cache) if (entry.expiresAt < Date.now()) cache.delete(key);
  while (cache.size >= 256) cache.delete(cache.keys().next().value!);
  cache.set(url, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value,
  });
}

function decodeHtml(input: string) {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function collapseWhitespace(input: string) {
  return decodeHtml(String(input ?? "").replace(/\s+/g, " ").trim());
}

function normalizeInputUrl(raw: string) {
  try {
    return normalizePublicHttpUrl(raw).toString();
  } catch {
    return null;
  }
}

function pickMeta(html: string, keys: string[]) {
  for (const key of keys) {
    const metaTagRe = new RegExp(
      `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["'][^>]*>`,
      "i"
    );
    const m = html.match(metaTagRe);
    const value = m?.[1] ?? m?.[2];
    if (value && value.trim()) return collapseWhitespace(value);
  }
  return "";
}

function pickTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return collapseWhitespace(m?.[1] ?? "");
}

function absolutizeMaybe(baseUrl: string, value: string | null) {
  if (!value) return null;
  try {
    return normalizePublicHttpUrl(new URL(value, baseUrl).toString()).toString();
  } catch {
    return null;
  }
}

async function buildPreview(url: string): Promise<PreviewResponse | FailResponse> {
  const cached = getCached(url);
  if (cached) return cached;

  try {
    const normalized = normalizeInputUrl(url);
    if (!normalized) {
      const fail: FailResponse = { ok: false, error: "invalid_url" };
      setCached(url, fail);
      return fail;
    }

    const { finalUrl, html } = await fetchPublicHtml(normalized);

    const title =
      pickMeta(html, ["og:title", "twitter:title"]) || pickTitle(html) || finalUrl;

    const description =
      pickMeta(html, ["og:description", "twitter:description", "description"]) || "";

    const image =
      absolutizeMaybe(
        finalUrl,
        pickMeta(html, ["og:image", "twitter:image"]) || null
      ) ?? null;

    const siteName =
      pickMeta(html, ["og:site_name"]) || new URL(finalUrl).hostname || null;

    const value: PreviewResponse = {
      ok: true,
      url: finalUrl,
      title,
      description,
      image,
      siteName,
    };

    setCached(url, value);
    return value;
  } catch (e: unknown) {
    const errorName = e instanceof Error ? e.name : "";
    const errorMessage = e instanceof Error ? e.message : "fetch_failed";
    const fail: FailResponse = {
      ok: false,
      error: errorName === "AbortError" ? "timeout" : errorMessage,
    };
    setCached(url, fail);
    return fail;
  }
}

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const reqUrl = new URL(request.url);
  const raw = String(reqUrl.searchParams.get("url") ?? "").trim();

  if (!raw) {
    return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
  }

  const preview = await buildPreview(raw);

  if (!preview.ok) {
    return NextResponse.json(preview, { status: 400 });
  }

  return NextResponse.json(preview, {
    headers: {
      "Cache-Control": "private, max-age=300",
    },
  });
}
