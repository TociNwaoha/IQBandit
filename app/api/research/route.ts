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

  const searchUrl = process.env.SEARCH_SERVICE_URL ?? "http://iqbandit-search:9000";

  // ── Sports fast path — ESPN live data ────────────────────────────────────────
  const SPORTS_KEYWORDS = [
    "nba", "nfl", "mlb", "nhl", "wnba", "basketball", "football",
    "baseball", "hockey", "game", "games", "score", "scores",
    "schedule", "standings", "playoff", "lakers", "celtics",
    "warriors", "knicks", "bulls", "heat", "nets",
  ];
  const SPORT_MAP: Record<string, string> = {
    nba: "nba", basketball: "nba",
    nfl: "nfl", football: "nfl",
    mlb: "mlb", baseball: "mlb",
    nhl: "nhl", hockey: "nhl",
    wnba: "nba_womens",
  };

  const lowerQuery    = query.toLowerCase();
  const isSportsQuery = SPORTS_KEYWORDS.some(k => lowerQuery.includes(k));
  const detectedSport = Object.entries(SPORT_MAP).find(([k]) => lowerQuery.includes(k))?.[1] ?? "nba";

  if (isSportsQuery) {
    try {
      const sportsRes = await fetch(`${searchUrl}/sports`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ sport: detectedSport }),
        signal:  AbortSignal.timeout(8_000),
      });

      if (sportsRes.ok) {
        const sportsData = await sportsRes.json() as { games?: Array<{
          completed: boolean; away_team: string; away_score: string;
          home_team: string; home_score: string; status: string; broadcast?: string;
        }> };
        const games = sportsData.games ?? [];

        const researchContext = games.length > 0
          ? `[Live Sports Data — ${detectedSport.toUpperCase()} — Source: ESPN]\n\n` +
            games.map(g =>
              g.completed
                ? `${g.away_team} ${g.away_score} @ ${g.home_team} ${g.home_score} — Final`
                : `${g.away_team} @ ${g.home_team} — ${g.status}${g.broadcast ? ` (${g.broadcast})` : ""}`
            ).join("\n") +
            `\n\n[End of Sports Data]\n\nUsing ONLY the above live data, answer the user's question. Do not add games not listed above.`
          : `[ESPN returned no games for this query. Tell the user no games were found for today.]`;

        incrementSearchCount(userId, today);
        const used = getSearchUsage(userId, today);

        return NextResponse.json({
          research_context: researchContext,
          result_count:     games.length,
          searches_used:    used,
          searches_limit:   limit === Infinity ? null : limit,
          source_type:      "espn_live",
        });
      }
    } catch {
      // ESPN failed — fall through to regular search
    }
  }

  // ── Call iqbandit-search with full depth ──────────────────────────────────────
  let searchRes: Response;
  try {
    searchRes = await fetch(`${searchUrl}/search`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        query,
        depth: "full",  // triggers full page content fetch via Jina Reader
        limit: 3,       // top 3 results only — enough context, not too many tokens
      }),
      signal: AbortSignal.timeout(15_000),
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
  let results = searchData.results ?? [];

  // ── Fallback: if full content failed for all results, re-fetch snippets ───────
  const hasContent = results.some(r => r.content);
  if (!hasContent) {
    try {
      const fallbackRes = await fetch(`${searchUrl}/search`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ query, depth: "snippets", limit: 5 }),
        signal:  AbortSignal.timeout(8_000),
      });
      if (fallbackRes.ok) {
        const fallbackData = await fallbackRes.json() as {
          results?: Array<{ title: string; url: string; snippet?: string }>;
        };
        const snippets = fallbackData.results ?? [];
        if (snippets.length > 0) {
          incrementSearchCount(userId, today);
          const used = getSearchUsage(userId, today);
          const researchContext =
            `[Search Snippets for "${query}" — full page content unavailable]\n\n` +
            snippets.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\nSource: ${r.url}`).join("\n\n") +
            `\n\nNote: Only snippet previews are available. Answer carefully and flag any uncertainty.`;
          return NextResponse.json({
            research_context: researchContext,
            result_count:     snippets.length,
            searches_used:    used,
            searches_limit:   limit === Infinity ? null : limit,
            source_type:      "snippets_fallback",
          });
        }
      }
    } catch { /* ignore — fall through to no-results message */ }
  }

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
