import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép import type từ workspace package (@safestock/shared-types).
  transpilePackages: ["@safestock/shared-types"],
};

export default nextConfig;
