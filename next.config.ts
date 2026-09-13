import path from "node:path";
import type { NextConfig } from "next";
import pkg from "./package.json";

const nextConfig: NextConfig = {
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version || "1.4.2",
  },
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
    "puppeteer-core",
  ],
};

export default nextConfig;
