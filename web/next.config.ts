import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Avoid resolving workspace root to C:\Users\trevo\ (stray package-lock.json there).
  outputFileTracingRoot: path.join(__dirname, ".."),
};

export default nextConfig;
