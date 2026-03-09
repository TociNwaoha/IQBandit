/**
 * app/api/integrations/meta/accounts/route.ts
 * GET — returns ad accounts accessible to the connected Meta token.
 *
 * Query params (all optional):
 *   limit=<n>   — 1–100, default 25
 *
 * Preconditions checked before calling Meta:
 *   - Valid session
 *   - Meta Ads connection exists and status === "connected"
 *   - INTEGRATIONS_ENCRYPTION_SECRET configured (token decryption)
 *
 * Response (200):
 * {
 *   accounts:    MetaAdAccount[]
 *   has_more:    boolean
 *   next_cursor: string | null
 * }
 *
 * Error responses:
 *   400 — invalid limit param
 *   401 — no session
 *   409 — Meta Ads not connected or connection in error state
 *   502 — Meta API error (code + message forwarded)
 *   503 — encryption secret not configured
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnectionByProvider, getDecryptedAccessToken } from "@/lib/integrations/connections";
import { isEncryptionConfigured } from "@/lib/integrations/crypto";
import { getAdAccounts, MetaAdapterError } from "@/lib/integrations/providers/metaAds";

const USER_ID = "default";
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

export async function GET(request: NextRequest) {
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

  // ── parse limit query param ──────────────────────────────────────────────────
  let limit = DEFAULT_LIMIT;
  const rawLimit = request.nextUrl.searchParams.get("limit");
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return NextResponse.json(
        { error: `"limit" must be an integer between 1 and ${MAX_LIMIT}` },
        { status: 400, headers: NO_STORE }
      );
    }
    limit = parsed;
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
    const result = await getAdAccounts(accessToken, limit);
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
