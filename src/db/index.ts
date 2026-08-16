import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

// Two ways to run this app.
//
// 1. DATABASE_URL is set. We talk to a real Postgres, which is Neon in
//    production and can be a local Postgres in development. This is the same
//    database the Python scraper writes to. This is the real architecture.
// 2. DATABASE_URL is missing. We fall back to PGlite, a Postgres that runs
//    inside this Node process with no server and no install, and seed it with
//    fake data on first use. This exists only so the app runs immediately
//    after a clone, for a demo.
//
// Every query in this app is identical either way, because both are Postgres
// and Drizzle hides the driver behind the same API.

export const usingPglite = !process.env.DATABASE_URL;

export const initSql = () =>
  readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");

async function createRealPostgres(url: string) {
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const postgres = (await import("postgres")).default;
  // prepare: false is required when connecting through a pooler such as Neon's.
  const client = postgres(url, { prepare: false, max: 5 });
  return drizzle(client, { schema });
}

async function createPglite() {
  const { drizzle } = await import("drizzle-orm/pglite");
  const { PGlite } = await import("@electric-sql/pglite");
  const client = new PGlite(".pglite");
  await client.exec(initSql());
  const db = drizzle(client, { schema });
  const { seedDemoData } = await import("./seed-data");
  await seedDemoData(db);
  return db;
}

async function create() {
  const url = process.env.DATABASE_URL;
  if (url) return createRealPostgres(url);

  // PGlite writes to the local filesystem and lives inside one Node process.
  // On Vercel the filesystem is read only apart from /tmp, and every request
  // can land on a fresh instance, so the data would silently vanish. Fail loudly
  // here instead of shipping a site that looks fine and stores nothing.
  if (process.env.VERCEL || process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. The PGlite fallback is for local development only " +
        "and cannot persist on Vercel. Create a Neon database and add DATABASE_URL " +
        "in Vercel project settings under Environment Variables.",
    );
  }

  return createPglite();
}

type Db = Awaited<ReturnType<typeof create>>;

// Cache the connection on globalThis. Next.js dev reloads modules on every
// edit, and without this you leak a connection pool per reload.
const globalForDb = globalThis as unknown as { __db?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__db ??= create();
  return globalForDb.__db;
}
