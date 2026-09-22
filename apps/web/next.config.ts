import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dedicated acceptance never shares build files with the local user server.
  distDir: process.env.E2E_STACK_PROJECT === "jalon-2-qonto-tests" ? ".next-isolated" : ".next",
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ] }];
  },
};

export default nextConfig;
