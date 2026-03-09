/**
 * app/api/integrations/meta/insights/route.ts
 * POST — returns performance insights for a given Meta Ads ad account.
 *
 * POST body (JSON):
 * {
 *   ad_account_id: string       — ad account ID (with or without "act_" prefix)
 *   level?:        string       — "account" | "campaign" | "adset" | "ad" (default: "campaign")
 *   date_preset?:  string       — e.g. "last_30d", "last_7d", "this_month"
 *                                 (use this OR date_start/date_end; default: "last_30d")
 *   date_start?:   string       — YYYY-MM-DD (used when date_preset not provided)
 *   date_end?:     string       — YYYY-MM-DD (defaults to date_start if omitted)
 *   fields?:       string[]     — metric fields to request (defaults to standard set)
 *   limit?:        number       — 1–100, default 25
 * }
 *
 * Standard default fields: impressions, clicks, spend, reach, ctr, cpc, cpm
 * (date_start and date_stop are always included regardless)
 *
 * Response (200):
 * {
 *   insights:    MetaInsightRow[]
 *   has_more:    boolean
 *   next_cursor: string | null
 * }
 *
 * Error responses:
 *   400 — invalid body / unknown fields / bad params
 *   401 — no session
 *   409 — Meta Ads not connected or connection in error state
 *   502 — Meta API error (code + message forwarded)
 *   503 — encryption secret not configured
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConnectionByProvider, getDecryptedAccessToken } from "@/lib/integrations/connections";
import { isEncryptionConfigured } from "@/lib/integrations/crypto";
import {
  getInsights,
  MetaAdapterError,
  type InsightLevel,
  type DatePreset,
} from "@/lib/integrations/providers/metaAds";

const USER_ID = "default";
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const DEFAULT_LIMIT = 25;
const MAX_LIMIT     = 100;

const VALID_LEVELS = new Set<InsightLevel>(["account", "campaign", "adset", "ad"]);

const VALID_DATE_PRESETS = new Set<DatePreset>([
  "today", "yesterday",
  "this_week_sun_today", "this_week_mon_today",
  "last_week_sun_sat",   "last_week_mon_sun",
  "this_month",          "last_month",
  "this_quarter",        "last_quarter",
  "this_year",           "last_year",
  "last_3d", "last_7d", "last_14d", "last_28d", "last_30d", "last_90d",
]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
  const ALLOWED_KEYS = new Set([
    "ad_account_id", "level", "date_preset", "date_start", "date_end", "fields", "limit",
  ]);
  const unknownKeys = Object.keys(raw).filter((k) => !ALLOWED_KEYS.has(k));
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

  // Validate level
  let level: InsightLevel = "campaign";
  if (raw.level !== undefined) {
    if (typeof raw.level !== "string" || !VALID_LEVELS.has(raw.level as InsightLevel)) {
      return NextResponse.json(
        { error: `"level" must be one of: ${Array.from(VALID_LEVELS).join(", ")}` },
        { status: 400, headers: NO_STORE }
      );
    }
    level = raw.level as InsightLevel;
  }

  // Validate date_preset vs date_start/date_end (mutually exclusive)
  let datePreset: DatePreset | undefined;
  let dateStart:  string | undefined;
  let dateEnd:    string | undefined;

  if (raw.date_preset !== undefined && (raw.date_start !== undefined || raw.date_end !== undefined)) {
    return NextResponse.json(
      { error: '"date_preset" and "date_start"/"date_end" are mutually exclusive — use one or the other' },
      { status: 400, headers: NO_STORE }
    );
  }

  if (raw.date_preset !== undefined) {
    if (typeof raw.date_preset !== "string" || !VALID_DATE_PRESETS.has(raw.date_preset as DatePreset)) {
      return NextResponse.json(
        { error: `"date_preset" must be one of: ${Array.from(VALID_DATE_PRESETS).join(", ")}` },
        { status: 400, headers: NO_STORE }
      );
    }
    datePreset = raw.date_preset as DatePreset;
  }

  if (raw.date_start !== undefined) {
    if (typeof raw.date_start !== "string" || !DATE_RE.test(raw.date_start)) {
      return NextResponse.json(
        { error: '"date_start" must be a date string in YYYY-MM-DD format' },
        { status: 400, headers: NO_STORE }
      );
    }
    dateStart = raw.date_start;
  }

  if (raw.date_end !== undefined) {
    if (typeof raw.date_end !== "string" || !DATE_RE.test(raw.date_end)) {
      return NextResponse.json(
        { error: '"date_end" must be a date string in YYYY-MM-DD format' },
        { status: 400, headers: NO_STORE }
      );
    }
    dateEnd = raw.date_end;
  }

  // date_end without date_start is not meaningful
  if (dateEnd && !dateStart) {
    return NextResponse.json(
      { error: '"date_end" requires "date_start" to also be provided' },
      { status: 400, headers: NO_STORE }
    );
  }

  // Validate fields array
  let fields: string[] | undefined;
  if (raw.fields !== undefined) {
    if (!Array.isArray(raw.fields) || !raw.fields.every((f) => typeof f === "string")) {
      return NextResponse.json(
        { error: '"fields" must be an array of strings' },
        { status: 400, headers: NO_STORE }
      );
    }
    const cleaned = (raw.fields as string[]).map((f) => f.trim()).filter(Boolean);
    if (cleaned.length > 0) {
      fields = cleaned;
    }
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
    const result = await getInsights(accessToken, {
      adAccountId,
      level,
      datePreset,
      dateStart,
      dateEnd,
      fields,
      limit,
    });
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
