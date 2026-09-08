import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingExcludes: {
    "*": [
      "./prisma/**",
      "./prisma/data/**",
      "./**/*.db",
      "./**/*.db-journal",
      "./docs/**",
      "@swc/core/**",
      "esbuild/**",
      "webpack/**",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    webpackBuildWorker: false,
    cpus: 1,
    workerThreads: false,
  },
  serverExternalPackages: [
    "@libsql/client",
    "@prisma/adapter-libsql",
    "@prisma/client",
    "libsql",
  ],
};

export default nextConfig;
