/**
 * lib/integrations/providers/metaAds.ts
 * Read-only Meta Ads (Graph API) adapter.
 *
 * Supported operations:
 *   getAdAccounts()   — list ad accounts accessible to the token
 *   getCampaigns()    — list campaigns for a given ad account
 *   getInsights()     — fetch performance insights at account/campaign/adset/ad level
 *
 * Error codes:
 *   META_UNAUTHORIZED    — token invalid, revoked, or expired (HTTP 401 / Graph code 190)
 *   META_FORBIDDEN       — insufficient permissions (HTTP 403 / Graph code 200)
 *   META_RATE_LIMITED    — hit Graph API rate limit (HTTP 429 / Graph code 17/32)
 *   META_UNAVAILABLE     — Meta server error (HTTP 5xx)
 *   META_NETWORK_ERROR   — network / timeout failure
 *   META_INVALID_RESPONSE — non-JSON or unexpected shape
 *
 * Ad account IDs:
 *   Meta Graph API requires the "act_" prefix (e.g. "act_123456789").
 *   This adapter accepts IDs with or without the prefix and normalises internally.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

// ─── error types ──────────────────────────────────────────────────────────────

export type MetaErrorCode =
  | "META_UNAUTHORIZED"
  | "META_FORBIDDEN"
  | "META_RATE_LIMITED"
  | "META_UNAVAILABLE"
  | "META_NETWORK_ERROR"
  | "META_INVALID_RESPONSE";

export class MetaAdapterError extends Error {
  constructor(
    public readonly code: MetaErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MetaAdapterError";
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

const GRAPH_API = "https://graph.facebook.com/v21.0";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGE_SIZE = 100;

/** Graph API error codes that indicate an expired / invalid token. */
const TOKEN_ERROR_CODES = new Set([102, 104, 190, 463, 467]);

/** Graph API error codes that indicate insufficient permission. */
const PERMISSION_ERROR_CODES = new Set([10, 200, 270]);

/** Graph API error codes that indicate rate limiting. */
const RATE_LIMIT_ERROR_CODES = new Set([4, 17, 32, 613]);

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Ensures ad account ID has the "act_" prefix required by the Graph API.
 * Accepts "123456789" or "act_123456789" and normalises to "act_123456789".
 */
function normalizeActId(accountId: string): string {
  return accountId.startsWith("act_") ? accountId : `act_${accountId}`;
}

function getLevelFields(level: InsightLevel): string[] {
  switch (level) {
    case "campaign": return ["campaign_id", "campaign_name"];
    case "adset":    return ["campaign_id", "campaign_name", "adset_id", "adset_name"];
    case "ad":       return ["campaign_id", "campaign_name", "adset_id", "adset_name", "ad_id", "ad_name"];
    case "account":  return [];
  }
}

// ─── low-level fetch ──────────────────────────────────────────────────────────

/**
 * Makes a GET request to the Graph API, appending access_token and all params.
 * Throws MetaAdapterError on any failure.
 */
async function metaFetch(
  accessToken: string,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(`${GRAPH_API}${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new MetaAdapterError(
        "META_NETWORK_ERROR",
        "Meta Graph API timed out — check your connection and try again."
      );
    }
    throw new MetaAdapterError(
      "META_NETWORK_ERROR",
      "Could not reach the Meta Graph API. Check your network connection."
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new MetaAdapterError(
      "META_INVALID_RESPONSE",
      "Meta returned a non-JSON response."
    );
  }

  // Meta returns some errors as HTTP 200 with an "error" envelope
  const graphErr = (body as { error?: { code?: number; message?: string; type?: string } }).error;
  if (graphErr) {
    const code = graphErr.code ?? 0;
    const msg  = graphErr.message ?? "Unknown Meta error";

    if (TOKEN_ERROR_CODES.has(code) || res.status === 401) {
      throw new MetaAdapterError(
        "META_UNAUTHORIZED",
        `Meta token is invalid or has been revoked (code ${code}). Reconnect the integration.`
      );
    }
    if (PERMISSION_ERROR_CODES.has(code) || res.status === 403) {
      throw new MetaAdapterError(
        "META_FORBIDDEN",
        `Insufficient permissions for this resource (code ${code}). ` +
          "Make sure your Meta app has the ads_read permission and the account is linked in Business Manager."
      );
    }
    if (RATE_LIMIT_ERROR_CODES.has(code) || res.status === 429) {
      throw new MetaAdapterError(
        "META_RATE_LIMITED",
        "Meta API rate limit exceeded. Try again in a moment."
      );
    }
    throw new MetaAdapterError(
      "META_UNAVAILABLE",
      `Meta API error (code ${code}): ${msg}`
    );
  }

  if (!res.ok) {
    if (res.status >= 500) {
      throw new MetaAdapterError(
        "META_UNAVAILABLE",
        `Meta API server error (HTTP ${res.status}). Try again shortly.`
      );
    }
    throw new MetaAdapterError(
      "META_UNAVAILABLE",
      `Unexpected Meta API response (HTTP ${res.status}).`
    );
  }

  return body;
}

// ─── result types ─────────────────────────────────────────────────────────────

export interface MetaAdAccount {
  /** Full act_ prefixed ID, e.g. "act_123456789" */
  id: string;
  name: string;
  /** 1 = active, 2 = disabled, 3 = unsettled, 7 = pending_risk_review, etc. */
  status: number;
  currency: string;
  timezone_name: string;
}

export interface MetaAdAccountsResult {
  accounts: MetaAdAccount[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface MetaCampaign {
  id: string;
  name: string;
  /** "ACTIVE" | "PAUSED" | "DELETED" | "ARCHIVED" */
  status: string;
  objective: string;
  /** Remaining budget in account currency, as cents-string (null if not applicable). */
  budget_remaining: string | null;
  daily_budget: string | null;
  lifetime_budget: string | null;
}

export interface MetaCampaignsResult {
  campaigns: MetaCampaign[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface MetaInsightRow {
  campaign_id?:   string;
  campaign_name?: string;
  adset_id?:      string;
  adset_name?:    string;
  ad_id?:         string;
  ad_name?:       string;
  date_start:     string;
  date_stop:      string;
  impressions:    string;
  clicks:         string;
  spend:          string;
  reach?:         string;
  ctr?:           string;
  cpc?:           string;
  cpp?:           string;
  cpm?:           string;
}

export interface MetaInsightsResult {
  insights: MetaInsightRow[];
  has_more: boolean;
  next_cursor: string | null;
}

export type InsightLevel = "account" | "campaign" | "adset" | "ad";

export type DatePreset =
  | "today" | "yesterday"
  | "this_week_sun_today" | "this_week_mon_today"
  | "last_week_sun_sat"   | "last_week_mon_sun"
  | "this_month"          | "last_month"
  | "this_quarter"        | "last_quarter"
  | "this_year"           | "last_year"
  | "last_3d"  | "last_7d"  | "last_14d" | "last_28d"
  | "last_30d" | "last_90d";

export interface InsightsQuery {
  adAccountId: string;
  /** Aggregation level. Default: "campaign" */
  level?: InsightLevel;
  /** Use this OR dateStart/dateEnd. Default: "last_30d" */
  datePreset?: DatePreset;
  /** YYYY-MM-DD — used when datePreset is not provided */
  dateStart?: string;
  /** YYYY-MM-DD — defaults to dateStart if only dateStart is given */
  dateEnd?: string;
  /** Metrics fields to request. Defaults to a standard set. */
  fields?: string[];
  /** 1–100. Default: 25 */
  limit?: number;
}

const DEFAULT_INSIGHT_FIELDS: string[] = [
  "impressions",
  "clicks",
  "spend",
  "reach",
  "ctr",
  "cpc",
  "cpm",
  "date_start",
  "date_stop",
];

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Returns ad accounts accessible to the token owner.
 *
 * @param accessToken  Decrypted Meta OAuth access token (server-side only)
 * @param limit        Number of accounts to return (1–100, default 25)
 *
 * Throws MetaAdapterError on any API failure.
 */
export async function getAdAccounts(
  accessToken: string,
  limit = 25
): Promise<MetaAdAccountsResult> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  const raw = await metaFetch(accessToken, "/me/adaccounts", {
    fields: "id,name,account_status,currency,timezone_name",
    limit:  String(pageSize),
  }) as {
    data: Array<{
      id: string;
      name?: string;
      account_status?: number;
      currency?: string;
      timezone_name?: string;
    }>;
    paging?: { cursors?: { after?: string }; next?: string };
  };

  const accounts: MetaAdAccount[] = (raw.data ?? []).map((a) => ({
    id:            a.id,
    name:          a.name ?? "",
    status:        a.account_status ?? 0,
    currency:      a.currency ?? "",
    timezone_name: a.timezone_name ?? "",
  }));

  return {
    accounts,
    has_more:    Boolean(raw.paging?.next),
    next_cursor: raw.paging?.cursors?.after ?? null,
  };
}

/**
 * Returns campaigns for the given ad account.
 *
 * @param accessToken  Decrypted Meta OAuth access token (server-side only)
 * @param adAccountId  Ad account ID (with or without "act_" prefix)
 * @param limit        1–100. Default 25
 *
 * Throws MetaAdapterError on any API failure.
 */
export async function getCampaigns(
  accessToken: string,
  adAccountId: string,
  limit = 25
): Promise<MetaCampaignsResult> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);
  const actId    = normalizeActId(adAccountId);

  const raw = await metaFetch(accessToken, `/${actId}/campaigns`, {
    fields: "id,name,status,objective,budget_remaining,daily_budget,lifetime_budget",
    limit:  String(pageSize),
  }) as {
    data: Array<{
      id: string;
      name?: string;
      status?: string;
      objective?: string;
      budget_remaining?: string;
      daily_budget?: string;
      lifetime_budget?: string;
    }>;
    paging?: { cursors?: { after?: string }; next?: string };
  };

  const campaigns: MetaCampaign[] = (raw.data ?? []).map((c) => ({
    id:               c.id,
    name:             c.name ?? "",
    status:           c.status ?? "",
    objective:        c.objective ?? "",
    budget_remaining: c.budget_remaining ?? null,
    daily_budget:     c.daily_budget ?? null,
    lifetime_budget:  c.lifetime_budget ?? null,
  }));

  return {
    campaigns,
    has_more:    Boolean(raw.paging?.next),
    next_cursor: raw.paging?.cursors?.after ?? null,
  };
}

/**
 * Returns performance insights for the given ad account.
 *
 * @param accessToken  Decrypted Meta OAuth access token (server-side only)
 * @param query        InsightsQuery — see type definition above
 *
 * Throws MetaAdapterError on any API failure.
 */
export async function getInsights(
  accessToken: string,
  query: InsightsQuery
): Promise<MetaInsightsResult> {
  const actId    = normalizeActId(query.adAccountId);
  const level: InsightLevel = query.level ?? "campaign";
  const pageSize = Math.min(Math.max(1, query.limit ?? 25), MAX_PAGE_SIZE);

  // Build deduplicated field list: level-specific ID fields first, then metric fields
  const levelFieldsList  = getLevelFields(level);
  const metricFieldsList = query.fields && query.fields.length > 0
    ? query.fields.filter((f) => f.trim())
    : DEFAULT_INSIGHT_FIELDS;
  const allFieldsSet  = new Set([...levelFieldsList, ...metricFieldsList]);
  // Always include date boundaries
  allFieldsSet.add("date_start");
  allFieldsSet.add("date_stop");
  const allFields = Array.from(allFieldsSet).join(",");

  const params: Record<string, string> = {
    level,
    fields: allFields,
    limit:  String(pageSize),
  };

  if (query.datePreset) {
    params.date_preset = query.datePreset;
  } else if (query.dateStart) {
    params.time_range = JSON.stringify({
      since: query.dateStart,
      until: query.dateEnd ?? query.dateStart,
    });
  } else {
    params.date_preset = "last_30d";
  }

  const raw = await metaFetch(accessToken, `/${actId}/insights`, params) as {
    data: Array<Record<string, string>>;
    paging?: { cursors?: { after?: string }; next?: string };
  };

  const insights: MetaInsightRow[] = (raw.data ?? []).map((row) => ({
    campaign_id:   row.campaign_id,
    campaign_name: row.campaign_name,
    adset_id:      row.adset_id,
    adset_name:    row.adset_name,
    ad_id:         row.ad_id,
    ad_name:       row.ad_name,
    date_start:    row.date_start ?? "",
    date_stop:     row.date_stop  ?? "",
    impressions:   row.impressions ?? "0",
    clicks:        row.clicks      ?? "0",
    spend:         row.spend       ?? "0",
    reach:         row.reach,
    ctr:           row.ctr,
    cpc:           row.cpc,
    cpp:           row.cpp,
    cpm:           row.cpm,
  }));

  return {
    insights,
    has_more:    Boolean(raw.paging?.next),
    next_cursor: raw.paging?.cursors?.after ?? null,
  };
}
