import { sql } from "drizzle-orm";
import { subjectAreas, courses, sections, enrollmentSnapshots } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

const TERM = "26F";

const CATALOG = [
  {
    subject: { code: "COM SCI", name: "Computer Science" },
    courses: [
      { number: "31", title: "Introduction to Computer Science I", seats: 400 },
      { number: "32", title: "Introduction to Computer Science II", seats: 350 },
      { number: "M51A", title: "Logic Design of Digital Systems", seats: 180 },
      { number: "M148", title: "Introduction to Data Science", seats: 150 },
    ],
  },
  {
    subject: { code: "MATH", name: "Mathematics" },
    courses: [
      { number: "115A", title: "Linear Algebra", seats: 120 },
      { number: "170E", title: "Introduction to Probability", seats: 200 },
    ],
  },
  {
    subject: { code: "STATS", name: "Statistics" },
    courses: [{ number: "20", title: "Introduction to Statistical Programming with R", seats: 160 }],
  },
];

// Deterministic pseudo random so the demo looks the same every run. Real data
// comes from the scraper. This only exists to make the UI runnable offline.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export async function seedDemoData(db: AnyDb) {
  const existing = await db.select({ n: sql<number>`count(*)::int` }).from(sections);
  if ((existing[0]?.n ?? 0) > 0) return;

  for (const group of CATALOG) {
    await db.insert(subjectAreas).values(group.subject).onConflictDoNothing();
  }

  let classId = 100000;
  let seed = 7;

  for (const group of CATALOG) {
    for (const c of group.courses) {
      const [course] = await db
        .insert(courses)
        .values({ subjectCode: group.subject.code, number: c.number, title: c.title })
        .returning();

      const [section] = await db
        .insert(sections)
        .values({
          courseId: course.id,
          term: TERM,
          classId: String(classId++),
          activity: "Lec 1",
          instructor: null,
        })
        .returning();

      // 21 days of snapshots, 8 per day, walking from open to full to a few
      // seats trickling back during add and drop.
      const rand = rng((seed += 31));
      const rows = [];
      // 21 days ending now, so the demo history lines up with today rather than
      // sitting in the future and confusing everyone who reads the chart.
      const start = Date.now() - 21 * 24 * 3_600_000;
      let taken = Math.round(c.seats * 0.35);
      let waitTaken = 0;

      for (let i = 0; i < 21 * 8; i++) {
        const capturedAt = new Date(start + i * 3 * 60 * 60 * 1000);
        const dayProgress = i / (21 * 8);

        if (taken < c.seats) {
          taken = Math.min(c.seats, taken + Math.round(rand() * c.seats * 0.02));
        } else if (dayProgress > 0.6 && rand() > 0.85) {
          // Somebody drops. This is the event the whole project is about.
          taken -= 1;
        }

        if (taken >= c.seats) {
          waitTaken = Math.max(0, waitTaken + (rand() > 0.5 ? 1 : 0));
        } else if (waitTaken > 0) {
          waitTaken -= 1;
        }

        rows.push({
          sectionId: section.id,
          capturedAt,
          seatsTotal: c.seats,
          seatsTaken: taken,
          waitlistTotal: 40,
          waitlistTaken: Math.min(40, waitTaken),
          status: taken >= c.seats ? (waitTaken > 0 ? "Waitlist" : "Closed") : "Open",
        });
      }

      for (let i = 0; i < rows.length; i += 100) {
        await db.insert(enrollmentSnapshots).values(rows.slice(i, i + 100));
      }
    }
  }
}
