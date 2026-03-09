/**
 * app/api/integrations/gmail/search/route.ts
 * POST — search Gmail messages.
 *
 * Body: { q: string (required, max 500 chars), maxResults?: number (1–50) }
 * Success: { result: GmailSearchResult }
 * Errors: 400 validation · 401 auth · 409 not connected · 502 provider error
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                   from "@/lib/auth";
import { searchMessages, GmailAdapterError } from "@/lib/integrations/providers/gmail";
import { getValidGmailAccessToken }     from "@/lib/integrations/providers/gmailAuth";
import { markConnectionStatus }         from "@/lib/integrations/connections";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = (body ?? {}) as Record<string, unknown>;

  if (!raw.q || typeof raw.q !== "string" || !raw.q.trim()) {
    return NextResponse.json(
      { error: '"q" is required and must be a non-empty string' },
      { status: 400, headers: NO_STORE },
    );
  }

  const q = raw.q.trim().slice(0, 500);

  let maxResults = 10;
  if (raw.maxResults !== undefined) {
    if (typeof raw.maxResults !== "number" || !Number.isInteger(raw.maxResults)) {
      return NextResponse.json({ error: '"maxResults" must be an integer' }, { status: 400, headers: NO_STORE });
    }
    if (raw.maxResults < 1 || raw.maxResults > 50) {
      return NextResponse.json({ error: '"maxResults" must be between 1 and 50' }, { status: 400, headers: NO_STORE });
    }
    maxResults = raw.maxResults;
  }

  try {
    const token  = await getValidGmailAccessToken();
    const result = await searchMessages(token, { q, maxResults });
    return NextResponse.json({ result }, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof GmailAdapterError) {
      if (err.code === "GMAIL_UNAUTHORIZED") markConnectionStatus("gmail", "expired");
      if (err.code === "GMAIL_FORBIDDEN")    markConnectionStatus("gmail", "error");
      return NextResponse.json(
        { error: err.message, provider_error_code: err.code },
        { status: 502, headers: NO_STORE },
      );
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500, headers: NO_STORE });
  }
}
