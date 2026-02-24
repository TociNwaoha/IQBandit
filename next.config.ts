import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native Node.js addon (.node binary file).
  // Next.js bundles server code with webpack, which cannot process native binaries.
  // This tells Next.js to leave the require("better-sqlite3") call as-is at runtime
  // instead of trying to bundle it. Without this, SQLite logging fails at startup.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
