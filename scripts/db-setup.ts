// Applies drizzle/0000_init.sql and optionally seeds demo rows against whatever
// DATABASE_URL points at. Run this once after creating a Neon database:
//
//   pnpm db:setup          create tables
//   pnpm db:setup --seed   create tables and load demo data
//
// In a mature project drizzle-kit migrations replace this. It is here so the
// first setup is one command instead of a tutorial.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";
import postgres from "postgres";

// Next.js reads .env.local automatically. Plain Node scripts do not, so say so
// explicitly or you get a confusing "DATABASE_URL is not set" while the file is
// sitting right there.
config({ path: ".env.local" });
config();

import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema";
import { seedDemoData } from "../src/db/seed-data";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Put it in .env.local first.");
    process.exit(1);
  }

  const sql = readFileSync(join(process.cwd(), "drizzle", "0000_init.sql"), "utf8");
  const client = postgres(url, { prepare: false, max: 1 });

  if (process.argv.includes("--reset")) {
    console.log("dropping every table, this deletes all data");
    await client.unsafe(
      "DROP TABLE IF EXISTS enrollment_snapshot, section, course, subject_area CASCADE",
    );
  }

  console.log("applying drizzle/0000_init.sql");
  await client.unsafe(sql);
  console.log("tables ready");

  if (process.argv.includes("--seed")) {
    console.log("seeding demo data");
    await seedDemoData(drizzle(client, { schema }));
    console.log("seed done");
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
