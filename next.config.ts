import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  agentRules: false,
} as NextConfig;

export default nextConfig;
