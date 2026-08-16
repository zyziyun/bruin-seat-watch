import type { NextRequest } from "next/server";
import { searchSections } from "@/db/queries";
import { dbUnavailableReason } from "@/db/status";
import { fail, ok, preflight } from "../_lib/respond";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/sections?q=COM+SCI+32
 * Latest known enrollment state for each matching section.
 */
export async function GET(req: NextRequest) {
  const blocked = dbUnavailableReason();
  if (blocked) return fail(503, blocked);

  const q = req.nextUrl.searchParams.get("q") ?? "";

  // Cap the input. An unbounded string goes straight into an ILIKE pattern, and
  // a 10k character query is a cheap way for someone to make your database work
  // hard for free.
  if (q.length > 100) return fail(400, "q must be 100 characters or fewer");

  try {
    const rows = await searchSections(q);
    return ok({
      query: q,
      count: rows.length,
      sections: rows.map((r) => ({
        id: r.sectionId,
        subject: r.subjectCode,
        number: r.number,
        title: r.title,
        activity: r.activity,
        term: r.term,
        seats: { total: r.seatsTotal, taken: r.seatsTaken },
        waitlist: { taken: r.waitlistTaken },
        status: r.status,
        observedAt: r.capturedAt,
      })),
    });
  } catch (err) {
    console.error("GET /api/sections failed", err);
    return fail(500, "query failed");
  }
}
