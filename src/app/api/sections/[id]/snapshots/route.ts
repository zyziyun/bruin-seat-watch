import { getSnapshots } from "@/db/queries";
import { fail, intParam, ok, preflight } from "../../../_lib/respond";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return preflight();
}

/**
 * GET /api/sections/:id/snapshots
 * The raw time series. This is the part of the API that does not exist
 * anywhere else, so it is the reason anybody would use this API at all.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sectionId = intParam(id);
  if (sectionId === null) return fail(400, "id must be a positive integer");

  try {
    const snaps = await getSnapshots(sectionId);
    if (snaps.length === 0) return fail(404, "no snapshots for this section");

    return ok({
      sectionId,
      count: snaps.length,
      snapshots: snaps.map((s) => ({
        at: s.capturedAt,
        seatsTotal: s.seatsTotal,
        seatsTaken: s.seatsTaken,
        waitlistTaken: s.waitlistTaken,
        status: s.status,
      })),
    });
  } catch (err) {
    console.error("GET /api/sections/:id/snapshots failed", err);
    return fail(500, "query failed");
  }
}
