// In production the app needs a real Postgres. PGlite writes to the local
// filesystem and lives inside one process, so on Vercel it would silently lose
// every write. Rather than crash with an opaque 500, detect the situation and
// say exactly what is missing and how to fix it.

export function dbUnavailableReason(): string | null {
  if (process.env.DATABASE_URL) return null;
  const onVercel = Boolean(process.env.VERCEL) || process.env.NODE_ENV === "production";
  return onVercel
    ? "DATABASE_URL is not set. Serverless functions cannot use the local PGlite fallback, so this deployment has no database yet."
    : null;
}
