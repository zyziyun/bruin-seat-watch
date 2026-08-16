import Link from "next/link";
import { notFound } from "next/navigation";
import { EnrollmentChart, type Point } from "@/components/EnrollmentChart";
import { getSeatReleaseStats, getSection, getSnapshots } from "@/db/queries";

export const dynamic = "force-dynamic";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      {hint && <div className="mt-1 text-xs text-neutral-500">{hint}</div>}
    </div>
  );
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sectionId = Number(id);
  if (!Number.isInteger(sectionId)) notFound();

  const section = await getSection(sectionId);
  if (!section) notFound();

  const [snaps, stats] = await Promise.all([
    getSnapshots(sectionId),
    getSeatReleaseStats(sectionId),
  ]);

  const latest = snaps[snaps.length - 1];

  const data: Point[] = snaps.map((s) => ({
    t: s.capturedAt.toISOString().slice(5, 10),
    seatsTaken: s.seatsTaken,
    seatsTotal: s.seatsTotal,
    waitlistTaken: s.waitlistTaken,
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        back to search
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        {section.subjectCode} {section.number} · {section.activity}
      </h1>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">{section.title}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {section.subjectName} · term {section.term} · class id {section.classId}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Enrolled" value={`${latest.seatsTaken}/${latest.seatsTotal}`} />
        <Stat label="Waitlist" value={String(latest.waitlistTaken)} />
        <Stat
          label="Seats released"
          value={String(stats.releases)}
          hint="times a seat opened after the class first filled"
        />
        <Stat
          label="Release rate"
          value={stats.releasesPerDay.toFixed(1)}
          hint="per day since it filled"
        />
      </div>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-neutral-500">
        Enrollment over time
      </h2>
      <div className="mt-3">
        <EnrollmentChart data={data} />
      </div>

      <p className="mt-6 text-sm text-neutral-500">
        Built from {stats.observations.toLocaleString()} snapshots. The prediction
        model is not here yet. Right now this page reports what happened, which is
        already more than any other tool can tell you.
      </p>
    </main>
  );
}
