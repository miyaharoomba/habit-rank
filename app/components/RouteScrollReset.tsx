"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

export default function RouteScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    document.body.style.removeProperty("overflow");
    document.documentElement.style.removeProperty("overflow");
  }, [pathname]);

  return null;
}
