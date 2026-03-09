/**
 * app/api/analytics/timeseries/route.ts
 * GET — returns per-day request counts, error counts, and avg latency.
 *
 * Query params:
 *   days=7    (default) — window size, clamped to 1–30
 *   model=    (optional) — filter to a single model name
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getTimeseries } from "@/lib/analytics";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawDays = Number(request.nextUrl.searchParams.get("days") ?? "7");
  const days = Number.isNaN(rawDays) ? 7 : Math.min(30, Math.max(1, rawDays));
  const model = request.nextUrl.searchParams.get("model") || undefined;

  return NextResponse.json(getTimeseries(days, model));
}
