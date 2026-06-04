"use client";

import Link from "next/link";

export type OgpPreview = {
  ok: true;
  url: string;
  title: string;
  description: string;
  image: string | null;
  siteName: string | null;
};

export default function OgpCard({
  preview,
  className = "",
}: {
  preview: OgpPreview;
  className?: string;
}) {
  const hostLabel = preview.siteName?.trim() || new URL(preview.url).hostname;

  return (
    <Link
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={[
        "block overflow-hidden rounded-xl border border-border bg-background/70 hover:bg-secondary/30 transition",
        className,
      ].join(" ")}
    >
      <div className="flex min-w-0 flex-col sm:flex-row">
        {preview.image ? (
          <div className="shrink-0 sm:w-40">
            <img
              src={preview.image}
              alt=""
              className="h-40 w-full object-cover sm:h-full"
              loading="lazy"
            />
          </div>
        ) : null}

        <div className="min-w-0 flex-1 px-4 py-3">
          <div className="text-[11px] font-medium text-muted-foreground truncate">
            {hostLabel}
          </div>

          <div className="mt-1 text-sm font-semibold break-words line-clamp-2">
            {preview.title || preview.url}
          </div>

          {preview.description ? (
            <div className="mt-1 text-xs text-muted-foreground break-words line-clamp-3">
              {preview.description}
            </div>
          ) : null}

          <div className="mt-2 text-[11px] text-primary truncate">
            {preview.url}
          </div>
        </div>
      </div>
    </Link>
  );
}