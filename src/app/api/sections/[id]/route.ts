import { getSeatReleaseStats, getSection } from "@/db/queries";
import { fail, intParam, ok, preflight } from "../../_lib/respond";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/sections/:id
 * One section plus the seat release statistics derived from its history.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sectionId = intParam(id);
  if (sectionId === null) return fail(400, "id must be a positive integer");

  try {
    const section = await getSection(sectionId);
    if (!section) return fail(404, "section not found");

    const stats = await getSeatReleaseStats(sectionId);
    return ok({
      id: section.sectionId,
      subject: section.subjectCode,
      subjectName: section.subjectName,
      number: section.number,
      title: section.title,
      activity: section.activity,
      term: section.term,
      classId: section.classId,
      history: {
        observations: stats.observations,
        firstFullAt: stats.firstFullAt,
        seatReleases: stats.releases,
        seatReleasesPerDay: Number(stats.releasesPerDay.toFixed(2)),
      },
    });
  } catch (err) {
    console.error("GET /api/sections/:id failed", err);
    return fail(500, "query failed");
  }
}
