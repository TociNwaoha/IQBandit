/**
 * app/api/research/route.ts
 * Deep research endpoint — called by the frontend when Research Mode fetches full page content.
 * Uses iqbandit-search with depth:"full" to retrieve real page content via Jina Reader.
 * Checks per-plan daily search limits and increments the shared counter on success.
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

  // ── Call iqbandit-search with full depth ──────────────────────────────────────
  // Single call to iqbandit-search with full depth
  // This fetches real page content internally via Jina Reader
  const searchUrl = process.env.SEARCH_SERVICE_URL ?? "http://iqbandit-search:9000";
  let searchRes: Response;
  try {
    searchRes = await fetch(`${searchUrl}/search`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        query,
        depth: "full",  // triggers full page content fetch
        limit: 3,       // top 3 results only — enough context, not too many tokens
      }),
      signal: AbortSignal.timeout(15_000), // 15 seconds — full fetch takes longer
    });
  } catch (err) {
    console.error("[/api/research] Search service unreachable:", err);
    return new Response(JSON.stringify({ error: "Research service unavailable" }), { status: 503 });
  }

  if (!searchRes.ok) {
    const text = await searchRes.text().catch(() => "");
    console.error(`[/api/research] Search service error ${searchRes.status}: ${text}`);
    return new Response(JSON.stringify({ error: "Research service unavailable" }), { status: 503 });
  }

  const searchData = await searchRes.json() as {
    results?: Array<{ title: string; url: string; snippet?: string; content?: string }>;
  };
  const results = searchData.results ?? [];

  // ── Build research context block ──────────────────────────────────────────────
  const researchContext = results.length > 0
    ? `\n\n[Research Results for "${query}"]\n\n` +
      results.map((r, i) =>
        `--- Source ${i + 1}: ${r.url} ---\n` +
        `Title: ${r.title}\n` +
        `${r.content ? r.content.slice(0, 4000) : r.snippet ?? "No content available"}\n`
      ).join("\n") +
      `\n[End of Research Results]\n\n` +
      `Based ONLY on the above research results, answer the user's question accurately. ` +
      `Cite sources by number (Source 1, Source 2, etc). ` +
      `If the results don't contain the answer say so explicitly — do not guess or use training data.`
    : `\n\n[Research attempted for "${query}" but no results were returned.]\n` +
      `Tell the user you could not retrieve current information for this query and suggest they check directly.`;

  // ── Increment counter + return ────────────────────────────────────────────────
  incrementSearchCount(userId, today);
  const used = getSearchUsage(userId, today);

  return NextResponse.json({
    research_context: researchContext,
    result_count:     results.length,
    searches_used:    used,
    searches_limit:   limit === Infinity ? null : limit,
  });
}

export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. Use POST.", code: "METHOD_NOT_ALLOWED" },
    { status: 405, headers: { Allow: "POST" } }
  );
}
