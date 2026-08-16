import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { getDb } from "./index";
import { courses, enrollmentSnapshots, sections, subjectAreas } from "./schema";

export type SectionRow = {
  sectionId: number;
  subjectCode: string;
  number: string;
  title: string;
  activity: string;
  term: string;
  seatsTotal: number;
  seatsTaken: number;
  waitlistTaken: number;
  status: string;
  capturedAt: Date;
};

// The latest snapshot per section, optionally filtered by a search string.
// DISTINCT ON is a Postgres feature and it is the right tool here: it beats
// the usual "group by then join back" pattern for readability and speed.
export async function searchSections(q: string): Promise<SectionRow[]> {
  const db = await getDb();
  const term = `%${q.trim()}%`;

  const latest = db
    .selectDistinctOn([enrollmentSnapshots.sectionId], {
      sectionId: enrollmentSnapshots.sectionId,
      seatsTotal: enrollmentSnapshots.seatsTotal,
      seatsTaken: enrollmentSnapshots.seatsTaken,
      waitlistTaken: enrollmentSnapshots.waitlistTaken,
      status: enrollmentSnapshots.status,
      capturedAt: enrollmentSnapshots.capturedAt,
    })
    .from(enrollmentSnapshots)
    .orderBy(enrollmentSnapshots.sectionId, desc(enrollmentSnapshots.capturedAt))
    .as("latest");

  const where = q.trim()
    ? or(
        ilike(sql`${courses.subjectCode} || ' ' || ${courses.number}`, term),
        ilike(courses.title, term),
      )
    : undefined;

  return db
    .select({
      sectionId: sections.id,
      subjectCode: courses.subjectCode,
      number: courses.number,
      title: courses.title,
      activity: sections.activity,
      term: sections.term,
      seatsTotal: latest.seatsTotal,
      seatsTaken: latest.seatsTaken,
      waitlistTaken: latest.waitlistTaken,
      status: latest.status,
      capturedAt: latest.capturedAt,
    })
    .from(sections)
    .innerJoin(courses, eq(courses.id, sections.courseId))
    .innerJoin(latest, eq(latest.sectionId, sections.id))
    .where(where)
    .orderBy(asc(courses.subjectCode), asc(courses.number))
    .limit(50);
}

export async function getSection(sectionId: number) {
  const db = await getDb();
  const rows = await db
    .select({
      sectionId: sections.id,
      subjectCode: courses.subjectCode,
      subjectName: subjectAreas.name,
      number: courses.number,
      title: courses.title,
      activity: sections.activity,
      term: sections.term,
      classId: sections.classId,
    })
    .from(sections)
    .innerJoin(courses, eq(courses.id, sections.courseId))
    .innerJoin(subjectAreas, eq(subjectAreas.code, courses.subjectCode))
    .where(eq(sections.id, sectionId))
    .limit(1);

  return rows[0] ?? null;
}

export async function getSnapshots(sectionId: number) {
  const db = await getDb();
  return db
    .select({
      capturedAt: enrollmentSnapshots.capturedAt,
      seatsTotal: enrollmentSnapshots.seatsTotal,
      seatsTaken: enrollmentSnapshots.seatsTaken,
      waitlistTaken: enrollmentSnapshots.waitlistTaken,
      status: enrollmentSnapshots.status,
    })
    .from(enrollmentSnapshots)
    .where(eq(enrollmentSnapshots.sectionId, sectionId))
    .orderBy(asc(enrollmentSnapshots.capturedAt));
}

// How many times did a seat actually open up after the section first filled?
// This is the honest, non ML version of the eventual prediction feature, and it
// is the number a waitlisted student actually wants.
export async function getSeatReleaseStats(sectionId: number) {
  const snaps = await getSnapshots(sectionId);
  let releases = 0;
  let firstFullAt: Date | null = null;

  for (let i = 1; i < snaps.length; i++) {
    const prev = snaps[i - 1];
    const cur = snaps[i];
    if (!firstFullAt && cur.seatsTaken >= cur.seatsTotal) firstFullAt = cur.capturedAt;
    if (firstFullAt && cur.seatsTaken < prev.seatsTaken) releases += 1;
  }

  const hoursSinceFull = firstFullAt
    ? (snaps[snaps.length - 1].capturedAt.getTime() - firstFullAt.getTime()) / 3_600_000
    : 0;

  return {
    releases,
    firstFullAt,
    releasesPerDay: hoursSinceFull > 0 ? (releases / hoursSinceFull) * 24 : 0,
    observations: snaps.length,
  };
}

export async function countSnapshots() {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(enrollmentSnapshots);
  return rows[0]?.n ?? 0;
}

export { and };
