import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Support both direct root access and subpath reverse proxying if needed
  reactStrictMode: true,
  // swagger-ui-dist resolves its asset directory via __dirname at runtime
  // (see /api/docs) — keep it on native require so that path stays correct.
  serverExternalPackages: ["swagger-ui-dist"],
};

export default nextConfig;
