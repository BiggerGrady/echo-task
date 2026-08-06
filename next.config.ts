import type { NextConfig } from "next";

const nextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  // Next 16 blocks /_next assets from non-allowlisted hosts in dev.
  // Include local hosts + Cursor cloud preview proxy domains.
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "0.0.0.0",
    "**.agent.cvm.dev",
    "*.agent.cvm.dev",
  ],
  experimental: {
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  agentRules: false,
} as NextConfig;

export default nextConfig;
