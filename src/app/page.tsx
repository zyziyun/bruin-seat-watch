import Link from "next/link";
import { countSnapshots, searchSections } from "@/db/queries";
import { usingPglite } from "@/db";
import { dbUnavailableReason } from "@/db/status";

export const dynamic = "force-dynamic";

function SetupNeeded({ reason }: { reason: string }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Bruin Seat Watch</h1>
      <p className="mt-6 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {reason}
      </p>
      <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm text-neutral-700 dark:text-neutral-300">
        <li>
          Create a free Postgres database at{" "}
          <a className="underline" href="https://neon.com">
            neon.com
          </a>{" "}
          and copy the connection string.
        </li>
        <li>
          In Vercel, open this project, Settings, Environment Variables, and add{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">DATABASE_URL</code>{" "}
          and{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">INGEST_TOKEN</code>.
        </li>
        <li>
          Run <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">pnpm db:setup --seed</code>{" "}
          locally against that same connection string to create the tables.
        </li>
        <li>Redeploy.</li>
      </ol>
    </main>
  );
}

function SeatBar({ taken, total }: { taken: number; total: number }) {
  const pct = Math.min(100, Math.round((taken / total) * 100));
  const full = taken >= total;
  return (
    <div className="h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
      <div
        className={full ? "h-full bg-red-500" : "h-full bg-emerald-500"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;

  const blocked = dbUnavailableReason();
  if (blocked) return <SetupNeeded reason={blocked} />;

  const [rows, total] = await Promise.all([searchSections(q), countSnapshots()]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Bruin Seat Watch</h1>
      <p className="mt-2 text-neutral-600 dark:text-neutral-400">
        UCLA publishes live seat counts but nobody keeps the history. We snapshot
        every section every 15 minutes so you can see whether a full class
        actually opens up.
      </p>

      {usingPglite && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          Running on the local PGlite fallback with generated demo data. Set
          DATABASE_URL to use real Postgres.
        </p>
      )}

      <form className="mt-8 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="COM SCI 32, or data science"
          className="flex-1 rounded border border-neutral-300 px-3 py-2 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-950 dark:focus:border-neutral-300"
        />
        <button className="rounded bg-neutral-900 px-4 py-2 text-white dark:bg-white dark:text-neutral-900">
          Search
        </button>
      </form>

      <p className="mt-4 text-sm text-neutral-500">
        {total.toLocaleString()} snapshots stored · {rows.length} sections shown
      </p>

      <ul className="mt-4 divide-y divide-neutral-200 dark:divide-neutral-800">
        {rows.map((r) => (
          <li key={r.sectionId} className="py-4">
            <Link href={`/section/${r.sectionId}`} className="block group">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-medium group-hover:underline">
                  {r.subjectCode} {r.number} · {r.activity}
                </span>
                <span className="shrink-0 text-sm text-neutral-500">
                  {r.seatsTaken}/{r.seatsTotal}
                  {r.waitlistTaken > 0 && ` · WL ${r.waitlistTaken}`}
                </span>
              </div>
              <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                {r.title}
              </div>
              <div className="mt-2">
                <SeatBar taken={r.seatsTaken} total={r.seatsTotal} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {rows.length === 0 && (
        <p className="mt-8 text-neutral-500">
          No sections matched. Try COM SCI, or leave the box empty.
        </p>
      )}
    </main>
  );
}
