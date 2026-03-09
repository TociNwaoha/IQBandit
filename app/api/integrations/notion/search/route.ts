/**
 * app/api/integrations/notion/search/route.ts
 * POST — searches Notion pages and databases visible to the connected bot.
 *
 * POST body (JSON):
 * {
 *   query?: string   — freetext search; empty = return most recently edited
 *   limit?: number   — 1–100, default 10
 * }
 *
 * Preconditions checked before calling Notion:
 *   - Valid session
 *   - Notion connection exists and status === "connected"
 *   - INTEGRATIONS_ENCRYPTION_SECRET configured (token decryption)
 *
 * Response (200):
 * {
 *   results: NotionPageResult[]
 *   has_more: boolean
 *   next_cursor: string | null
 * }
 *
 * Error responses:
 *   400 — invalid body / unknown fields / out-of-range limit
 *   401 — no session
 *   409 — Notion not connected or connection in error state
 *   502 — Notion API error (code + message forwarded)
 *   503 — encryption secret not configured
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnectionByProvider, getDecryptedAccessToken } from "@/lib/integrations/connections";
import { isEncryptionConfigured } from "@/lib/integrations/crypto";
import { searchPages, NotionAdapterError } from "@/lib/integrations/providers/notion";

const USER_ID = "default";
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const MAX_QUERY_LEN = 200;

export async function POST(request: NextRequest) {
  // ── auth ────────────────────────────────────────────────────────────────────
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  // ── encryption prerequisite ─────────────────────────────────────────────────
  if (!isEncryptionConfigured()) {
    return NextResponse.json(
      { error: "INTEGRATIONS_ENCRYPTION_SECRET is not configured. Cannot decrypt stored tokens." },
      { status: 503, headers: NO_STORE }
    );
  }

  // ── parse body ───────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Body must be a JSON object" },
      { status: 400, headers: NO_STORE }
    );
  }

  const raw = body as Record<string, unknown>;

  // Reject unknown fields
  const ALLOWED_KEYS = new Set(["query", "limit"]);
  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate query
  const query = raw.query !== undefined
    ? (typeof raw.query === "string" ? raw.query : null)
    : "";
  if (query === null) {
    return NextResponse.json(
      { error: '"query" must be a string' },
      { status: 400, headers: NO_STORE }
    );
  }
  if (query.length > MAX_QUERY_LEN) {
    return NextResponse.json(
      { error: `"query" must not exceed ${MAX_QUERY_LEN} characters` },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate limit
  let limit = DEFAULT_LIMIT;
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== "number" || !Number.isInteger(raw.limit)) {
      return NextResponse.json(
        { error: '"limit" must be an integer' },
        { status: 400, headers: NO_STORE }
      );
    }
    if (raw.limit < 1 || raw.limit > MAX_LIMIT) {
      return NextResponse.json(
        { error: `"limit" must be between 1 and ${MAX_LIMIT}` },
        { status: 400, headers: NO_STORE }
      );
    }
    limit = raw.limit;
  }

  // ── check Notion connection ──────────────────────────────────────────────────
  const connection = getConnectionByProvider("notion", USER_ID);

  if (!connection) {
    return NextResponse.json(
      { error: "Notion is not connected. Go to /integrations to connect it." },
      { status: 409, headers: NO_STORE }
    );
  }

  if (connection.status !== "connected") {
    return NextResponse.json(
      {
        error: `Notion connection status is "${connection.status}". Reconnect at /integrations.`,
        connection_status: connection.status,
      },
      { status: 409, headers: NO_STORE }
    );
  }

  // ── decrypt token ────────────────────────────────────────────────────────────
  const accessToken = getDecryptedAccessToken("notion", USER_ID);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Could not retrieve Notion access token. Try reconnecting the integration." },
      { status: 409, headers: NO_STORE }
    );
  }

  // ── call Notion adapter ──────────────────────────────────────────────────────
  try {
    const results = await searchPages(accessToken, query, limit);
    return NextResponse.json(results, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof NotionAdapterError) {
      // Surface Notion-specific errors as 502 (bad gateway) with a typed code
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 502, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: "Unexpected error calling Notion API" },
      { status: 502, headers: NO_STORE }
    );
  }
}
