"use client";

import Image from "next/image";
import { useState } from "react";

/** Signed/private URLs stay in the browser, never in the public image optimizer. */
export default function ChatImage({ src, alt, className = "" }: {
  src: string;
  alt: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState<{ src: string; ratio: number } | null>(null);
  const ratio = loaded?.src === src ? loaded.ratio : 4 / 3;

  return (
    <span
      className={`relative block w-[28rem] max-w-full overflow-hidden ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        unoptimized
        sizes="(max-width: 640px) 85vw, 448px"
        className="object-contain"
        onLoad={({ currentTarget }) => {
          if (currentTarget.naturalWidth > 0 && currentTarget.naturalHeight > 0) {
            setLoaded({ src, ratio: currentTarget.naturalWidth / currentTarget.naturalHeight });
          }
        }}
      />
    </span>
  );
}
