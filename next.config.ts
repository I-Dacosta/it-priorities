import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Standalone output for the Docker image (see Dockerfile).
  output: "standalone",
};

export default nextConfig;
