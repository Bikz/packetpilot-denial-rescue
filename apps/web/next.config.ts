import withPWAInit from "@ducanh2912/next-pwa";

import type { NextConfig } from "next";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.DISABLE_PWA === "true",
  register: true,
  cacheOnFrontEndNav: true,
  reloadOnOnline: true,
  fallbacks: {
    document: "/offline",
  },
});

const nextConfig: NextConfig = {
  transpilePackages: ["@packetpilot/ui"],
};

export default withPWA(nextConfig);
