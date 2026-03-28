/**
 * app/api/search/route.ts
 * Forced search pipeline endpoint — called by the frontend when Research Mode is on.
 * Checks per-plan daily search limits, proxies to the iqbandit-search service,
 * and increments the counter on success.
 * SERVER-SIDE ONLY.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getUserById, getSearchUsage, incrementSearchCount } from "@/lib/user-db";
import { SEARCH_LIMITS } from "@/lib/plans";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // ── Auth ─────────────────────────────────────────────────────────────────────
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const user   = getUserById(userId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // ── Validate body ─────────────────────────────────────────────────────────────
  let query: string;
  try {
    const body = await request.json() as { query?: unknown };
    if (!body.query || typeof body.query !== "string") {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }
    query = body.query.trim().slice(0, 500);
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // ── Daily search limit ────────────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  const plan  = (user.plan ?? "free") as keyof typeof SEARCH_LIMITS;
  const limit = SEARCH_LIMITS[plan] ?? SEARCH_LIMITS.free;

  if (limit !== Infinity) {
    const used = getSearchUsage(userId, today);
    if (used >= limit) {
      return NextResponse.json({
        error:         `Daily search limit reached (${limit}/day on free plan). Upgrade for unlimited searches.`,
        upgrade:       true,
        limit_reached: true,
      }, { status: 429 });
    }
  }

  // ── Call iqbandit-search ──────────────────────────────────────────────────────
  const searchUrl = process.env.SEARCH_SERVICE_URL ?? "http://iqbandit-search:9000";
  let searchRes: Response;
  try {
    searchRes = await fetch(`${searchUrl}/search`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query, depth: "snippets", limit: 5 }),
      signal:  AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error("[/api/search] Search service unreachable:", err);
    return NextResponse.json({ error: "Search service unavailable" }, { status: 503 });
  }

  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    console.error(`[/api/search] Search service error ${searchRes.status}: ${text}`);
    return NextResponse.json({ error: "Search service unavailable" }, { status: 503 });
  }

  // iqbandit-search returns { query, results: [...], cached, timestamp }
  // Extract just the results array so the client gets a flat { results: [...] }.
  const body = await searchRes.json() as { results?: Array<{ title: string; url: string; snippet: string }> };
  const results = body.results ?? [];

  // ── Increment counter + return ────────────────────────────────────────────────
  incrementSearchCount(userId, today);
  const used = getSearchUsage(userId, today);

  return NextResponse.json({
    results,
    searches_used:  used,
    searches_limit: limit === Infinity ? null : limit,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
