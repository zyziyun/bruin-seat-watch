import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDb } from "@/db";
import { courses, enrollmentSnapshots, sections, subjectAreas } from "@/db/schema";
import { fail, ok } from "../_lib/respond";

export const dynamic = "force-dynamic";

// The read endpoints are public. This one writes, so it is not. The scraper
// holds INGEST_TOKEN and nothing else, which means the scraper repo never sees
// the database credentials.

type Incoming = {
  capturedAt: string;
  term: string;
  classId: string;
  subjectCode: string;
  subjectName: string;
  courseNumber: string;
  courseTitle: string;
  activity: string;
  instructor?: string | null;
  seatsTotal: number;
  seatsTaken: number;
  waitlistTotal: number;
  waitlistTaken: number;
  status: string;
};

function authorized(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN;
  if (!expected) return false;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  // Compare in constant time. A plain === leaks the token one character at a
  // time to anyone willing to measure response times.
  return a.length === b.length && timingSafeEqual(a, b);
}

function valid(r: Incoming) {
  return (
    typeof r.classId === "string" &&
    r.classId.length > 0 &&
    typeof r.term === "string" &&
    Number.isInteger(r.seatsTotal) &&
    Number.isInteger(r.seatsTaken) &&
    r.seatsTotal >= 0 &&
    r.seatsTaken >= 0 &&
    !Number.isNaN(Date.parse(r.capturedAt))
  );
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return fail(401, "invalid or missing bearer token");

  let body: { snapshots?: Incoming[] };
  try {
    body = await req.json();
  } catch {
    return fail(400, "body must be JSON");
  }

  const rows = body.snapshots ?? [];
  if (!Array.isArray(rows) || rows.length === 0) return fail(400, "snapshots must be a non-empty array");
  if (rows.length > 5000) return fail(413, "send at most 5000 snapshots per request");

  const bad = rows.findIndex((r) => !valid(r));
  if (bad >= 0) return fail(400, `snapshot at index ${bad} is malformed`);

  const db = await getDb();
  let inserted = 0;

  for (const r of rows) {
    // Upsert the reference rows, then always append the snapshot. Snapshots are
    // append only on purpose: the history is the product.
    await db
      .insert(subjectAreas)
      .values({ code: r.subjectCode, name: r.subjectName })
      .onConflictDoNothing();

    const [course] = await db
      .insert(courses)
      .values({ subjectCode: r.subjectCode, number: r.courseNumber, title: r.courseTitle })
      .onConflictDoUpdate({
        target: [courses.subjectCode, courses.number],
        set: { title: r.courseTitle },
      })
      .returning();

    const [section] = await db
      .insert(sections)
      .values({
        courseId: course.id,
        term: r.term,
        classId: r.classId,
        activity: r.activity,
        instructor: r.instructor ?? null,
      })
      .onConflictDoUpdate({
        target: [sections.term, sections.classId],
        set: { activity: r.activity, instructor: r.instructor ?? null },
      })
      .returning();

    await db.insert(enrollmentSnapshots).values({
      sectionId: section.id,
      capturedAt: new Date(r.capturedAt),
      seatsTotal: r.seatsTotal,
      seatsTaken: r.seatsTaken,
      waitlistTotal: r.waitlistTotal,
      waitlistTaken: r.waitlistTaken,
      status: r.status,
    });
    inserted++;
  }

  return ok({ inserted }, 0);
}
