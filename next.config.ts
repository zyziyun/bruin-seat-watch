import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships a WebAssembly build of Postgres. Bundling it breaks the wasm
  // loading, so keep it external and let Node require it at runtime. This only
  // affects local development, since production uses DATABASE_URL.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
