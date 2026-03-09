/**
 * app/api/integrations/meta/campaigns/route.ts
 * POST — returns campaigns for a given Meta Ads ad account.
 *
 * POST body (JSON):
 * {
 *   ad_account_id: string   — ad account ID (with or without "act_" prefix)
 *   limit?:        number   — 1–100, default 25
 * }
 *
 * Preconditions checked before calling Meta:
 *   - Valid session
 *   - Meta Ads connection exists and status === "connected"
 *   - INTEGRATIONS_ENCRYPTION_SECRET configured (token decryption)
 *
 * Response (200):
 * {
 *   campaigns:   MetaCampaign[]
 *   has_more:    boolean
 *   next_cursor: string | null
 * }
 *
 * Error responses:
 *   400 — invalid body / unknown fields / bad ad_account_id / out-of-range limit
 *   401 — no session
 *   409 — Meta Ads not connected or connection in error state
 *   502 — Meta API error (code + message forwarded)
 *   503 — encryption secret not configured
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnectionByProvider, getDecryptedAccessToken } from "@/lib/integrations/connections";
import { isEncryptionConfigured } from "@/lib/integrations/crypto";
import { getCampaigns, MetaAdapterError } from "@/lib/integrations/providers/metaAds";

const USER_ID = "default";
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

/** Validates ad account ID: optional "act_" prefix followed by 1+ digits. */
function isValidAdAccountId(id: string): boolean {
  const numeric = id.startsWith("act_") ? id.slice(4) : id;
  return /^\d+$/.test(numeric) && numeric.length > 0;
}

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
  const ALLOWED_KEYS = new Set(["ad_account_id", "limit"]);
  const unknownKeys  = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate ad_account_id
  if (!raw.ad_account_id || typeof raw.ad_account_id !== "string") {
    return NextResponse.json(
      { error: '"ad_account_id" is required and must be a string' },
      { status: 400, headers: NO_STORE }
    );
  }
  const adAccountId = raw.ad_account_id.trim();
  if (!isValidAdAccountId(adAccountId)) {
    return NextResponse.json(
      { error: '"ad_account_id" must be a numeric ID (e.g. "123456789" or "act_123456789")' },
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

  // ── check Meta Ads connection ────────────────────────────────────────────────
  const connection = getConnectionByProvider("meta_ads", USER_ID);

  if (!connection) {
    return NextResponse.json(
      { error: "Meta Ads is not connected. Go to /integrations to connect it." },
      { status: 409, headers: NO_STORE }
    );
  }

  if (connection.status !== "connected") {
    return NextResponse.json(
      {
        error: `Meta Ads connection status is "${connection.status}". Reconnect at /integrations.`,
        connection_status: connection.status,
      },
      { status: 409, headers: NO_STORE }
    );
  }

  // ── decrypt token ────────────────────────────────────────────────────────────
  const accessToken = getDecryptedAccessToken("meta_ads", USER_ID);
  if (!accessToken) {
    return NextResponse.json(
      { error: "Could not retrieve Meta Ads access token. Try reconnecting the integration." },
      { status: 409, headers: NO_STORE }
    );
  }

  // ── call Meta adapter ────────────────────────────────────────────────────────
  try {
    const result = await getCampaigns(accessToken, adAccountId, limit);
    return NextResponse.json(result, { headers: NO_STORE });
  } catch (err) {
    if (err instanceof MetaAdapterError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 502, headers: NO_STORE }
      );
    }
    return NextResponse.json(
      { error: "Unexpected error calling Meta API" },
      { status: 502, headers: NO_STORE }
    );
  }
}
