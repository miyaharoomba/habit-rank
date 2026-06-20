import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
  if (/^127\.\d+\.\d+\.\d+$/.test(host)) return true;
  if (/^169\.254\.\d+\.\d+$/.test(host)) return true;

  const m172 = host.match(/^172\.(\d+)\.\d+\.\d+$/);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
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
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchHtml(targetUrl: string) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);

  try {
    const res = await fetch(targetUrl, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "habitbase-link-preview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") ?? "";
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("not_html");
    }

    const html = await res.text();
    return {
      finalUrl: res.url || targetUrl,
      html,
    };
  } finally {
    clearTimeout(timer);
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

    const parsed = new URL(normalized);
    if (isPrivateHostname(parsed.hostname)) {
      const fail: FailResponse = { ok: false, error: "blocked_host" };
      setCached(url, fail);
      return fail;
    }

    const { finalUrl, html } = await fetchHtml(normalized);

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
