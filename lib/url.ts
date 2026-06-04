export type LinkPart =
  | { type: "text"; text: string }
  | { type: "link"; text: string; href: string };

const URL_RE = /\bhttps?:\/\/[^\s<>"'`]+/gi;

const TRAILING_PUNCTUATION_RE = /[)\]}>.,!?;:'"。、！？＞》」』】]+$/;

function trimTrailingPunctuation(raw: string) {
  let url = raw;
  while (TRAILING_PUNCTUATION_RE.test(url)) {
    url = url.replace(TRAILING_PUNCTUATION_RE, "");
  }
  return url;
}

export function normalizeUrl(raw: string) {
  const trimmed = trimTrailingPunctuation(String(raw ?? "").trim());
  try {
    const u = new URL(trimmed);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function extractUrls(text: string, max = 5) {
  const src = String(text ?? "");
  const matches = src.match(URL_RE) ?? [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const m of matches) {
    const normalized = normalizeUrl(m);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    urls.push(normalized);
    if (urls.length >= max) break;
  }

  return urls;
}

export function firstUrl(text: string) {
  return extractUrls(text, 1)[0] ?? null;
}

export function linkifyText(text: string): LinkPart[] {
  const src = String(text ?? "");
  if (!src) return [{ type: "text", text: "" }];

  const parts: LinkPart[] = [];
  let lastIndex = 0;

  for (const match of src.matchAll(URL_RE)) {
    const raw = match[0];
    const index = match.index ?? 0;
    const normalized = normalizeUrl(raw);
    const cleaned = normalized ?? trimTrailingPunctuation(raw);

    if (index > lastIndex) {
      parts.push({
        type: "text",
        text: src.slice(lastIndex, index),
      });
    }

    if (normalized) {
      parts.push({
        type: "link",
        text: cleaned,
        href: normalized,
      });
    } else {
      parts.push({
        type: "text",
        text: raw,
      });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < src.length) {
    parts.push({
      type: "text",
      text: src.slice(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", text: src }];
}
