import { NextResponse } from "next/server";

// One place that decides how every API response looks. Doing this once means
// the shape stays consistent as routes get added, which is the whole reason
// people bother with an API layer instead of ad hoc handlers.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export function ok<T>(data: T, cacheSeconds = 60) {
  return NextResponse.json(
    { data },
    {
      headers: {
        ...CORS,
        // Serve from the edge cache for a minute, then refresh in the
        // background. Snapshots only change every 15 minutes, so anything
        // shorter just burns database compute.
        "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=600`,
      },
    },
  );
}

export function fail(status: number, message: string) {
  return NextResponse.json({ error: { status, message } }, { status, headers: CORS });
}

export function preflight() {
  return new Response(null, { status: 204, headers: CORS });
}

// Parse and validate an integer path parameter. Returns null when invalid so
// the caller can decide the status code.
export function intParam(value: string): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}
