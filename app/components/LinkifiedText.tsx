"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import OgpCard, { type OgpPreview } from "@/app/components/OgpCard";
import { firstUrl, linkifyText } from "@/lib/url";

type LinkPreviewResponse =
  | OgpPreview
  | {
      ok: false;
      error: string;
    };

const previewCache = new Map<string, LinkPreviewResponse>();

export default function LinkifiedText({
  text,
  className = "",
  linkClassName = "text-primary underline underline-offset-2 break-all hover:opacity-80",
  previewClassName = "mt-3",
  showPreview = true,
}: {
  text: string | null | undefined;
  className?: string;
  linkClassName?: string;
  previewClassName?: string;
  showPreview?: boolean;
}) {
  const value = String(text ?? "");
  const parts = useMemo(() => linkifyText(value), [value]);
  const previewUrl = useMemo(() => (showPreview ? firstUrl(value) : null), [value, showPreview]);

  const [preview, setPreview] = useState<OgpPreview | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    setPreview(null);
    setPreviewFailed(false);

    if (!previewUrl) return;

    const cached = previewCache.get(previewUrl);
    if (cached) {
      if (cached.ok) {
        setPreview(cached);
      } else {
        setPreviewFailed(true);
      }
      return;
    }

    const ac = new AbortController();
    abortRef.current = ac;

    (async () => {
      try {
        const res = await fetch(
          `/api/link-preview?url=${encodeURIComponent(previewUrl)}`,
          {
            cache: "no-store",
            signal: ac.signal,
          }
        );

        const json = (await res.json().catch(() => null)) as LinkPreviewResponse | null;
        if (!json) {
          previewCache.set(previewUrl, { ok: false, error: "invalid_json" });
          setPreviewFailed(true);
          return;
        }

        previewCache.set(previewUrl, json);

        if (json.ok) {
          setPreview(json);
        } else {
          setPreviewFailed(true);
        }
      } catch (e: any) {
        if (e?.name === "AbortError") return;
        previewCache.set(previewUrl, { ok: false, error: "fetch_failed" });
        setPreviewFailed(true);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [previewUrl]);

  if (!value.trim()) {
    return null;
  }

  return (
    <div className={className}>
      <div className="whitespace-pre-wrap break-words">
        {parts.map((part, idx) => {
          if (part.type === "text") {
            return <span key={idx}>{part.text}</span>;
          }

          return (
            <Link
              key={idx}
              href={part.href}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClassName}
            >
              {part.text}
            </Link>
          );
        })}
      </div>

      {showPreview && previewUrl && preview ? (
        <OgpCard preview={preview} className={previewClassName} />
      ) : null}

      {showPreview && previewUrl && !preview && previewFailed ? null : null}
    </div>
  );
}
``