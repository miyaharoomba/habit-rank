import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Preserve the existing prefetch behavior during this security update.
  partialPrefetching: false,
};

export default nextConfig;
