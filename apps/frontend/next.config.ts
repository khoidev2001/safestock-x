import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép import type từ workspace package (@safestock/shared-types).
  transpilePackages: ["@safestock/shared-types"],
  // Cho phép chạy song song một instance thứ hai (vd demo) với thư mục build
  // riêng qua NEXT_DIST_DIR, tránh giẫm .next của instance đang chạy. Không đặt
  // env → giữ nguyên .next mặc định (không đổi hành vi hiện có).
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
