/**
 * lib/integrations/toolRouter.ts
 * Provider-agnostic tool execution router.
 *
 * Defines supported read-only actions for live providers, validates inputs
 * per-action, and dispatches to the correct adapter.
 *
 * Supported actions (read-only only):
 *   notion   → search_pages, get_workspace_info
 *   meta_ads → list_accounts, list_campaigns, get_insights
 *
 * Callers:
 *   - POST /api/integrations/execute (primary)
 *   - GET  /api/integrations/tools   (discovery)
 *   - app/integrations/page.tsx      (action count hint)
 *
 * Provider-specific endpoints (/api/integrations/notion/*, /api/integrations/meta/*)
 * remain unchanged and continue to call adapter functions directly.
 */

import { getProvider }              from "./providerRegistry";
import {
  getConnectionByProvider,
  getDecryptedAccessToken,
}                                   from "./connections";
import { isEncryptionConfigured }   from "./crypto";
import {
  searchPages,
  getWorkspaceInfo,
  NotionAdapterError,
}                                   from "./providers/notion";
import {
  getAdAccounts,
  getCampaigns,
  getInsights,
  MetaAdapterError,
  type InsightLevel,
  type DatePreset,
}                                   from "./providers/metaAds";
import {
  searchMessages,
  getMessage,
  listLabels,
  GmailAdapterError,
  type GmailMessageFormat,
}                                   from "./providers/gmail";
import { getValidGmailAccessToken } from "./providers/gmailAuth";

// ─── types ────────────────────────────────────────────────────────────────────

/**
 * Describes a single input field for an action, exported so the
 * /api/integrations/tools response can carry it to the frontend.
 *
 * ToolsPanel renders forms dynamically from this — no separate
 * ACTION_INPUT_DEFS needed in the client.
 */
export interface InputFieldSchema {
  key:          string;
  label:        string;
  /** "string" → text input · "number" → number input · "enum" → select */
  type:         "string" | "number" | "enum";
  required?:    boolean;
  placeholder?: string;
  /** Shown as helper text below the field. */
  help?:        string;
  /** number: inclusive lower bound */
  min?:         number;
  /** number: inclusive upper bound */
  max?:         number;
  /** string: max character limit */
  max_length?:  number;
  /** enum: exhaustive list of valid values (must match server validator) */
  options?:     { value: string; label: string }[];
}

export interface ToolActionDef {
  id:          string;
  displayName: string;
  description: string;
  /**
   * Input schema for this action — single source of truth consumed by both
   * the server-side validator (toolRouter.ts) and the client-side form
   * (ToolsPanel.tsx via /api/integrations/tools).
   *
   * Fields omitted here (e.g. date_start/date_end, fields[]) are still
   * accepted by the validator but not surfaced in the panel UI.
   */
  inputSchema: InputFieldSchema[];
  /**
   * When true, this action is omitted from the /api/integrations/tools
   * response so it never appears in the Tools panel. It can still be called
   * directly via /api/integrations/execute (backend / chat use only).
   */
  uiHidden?:   boolean;
}

export type ExecuteErrorCode =
  | "PROVIDER_NOT_FOUND"         // provider_id unknown to registry
  | "PROVIDER_NOT_LIVE"          // implementationStatus !== "adapter_live"
  | "ACTION_NOT_FOUND"           // action not supported for this provider
  | "PROVIDER_NOT_CONNECTED"     // no connection record or status === "disconnected"
  | "PROVIDER_TOKEN_EXPIRED"     // connection exists but status === "expired"
  | "PROVIDER_PERMISSION_ERROR"  // connection exists but status === "error"
  | "ENCRYPTION_NOT_CONFIGURED"  // INTEGRATIONS_ENCRYPTION_SECRET missing
  | "TOKEN_NOT_AVAILABLE"        // decrypted token could not be retrieved despite connected status
  | "VALIDATION_ERROR"           // action-specific input validation failed
  | "PROVIDER_API_ERROR";        // adapter threw (kept for type symmetry; callers handle separately)

export class ToolRouterError extends Error {
  constructor(
    public readonly code: ExecuteErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolRouterError";
  }
}

// ─── action registry ──────────────────────────────────────────────────────────

/**
 * Authoritative list of supported actions per live provider.
 * Only providers with implementationStatus === "adapter_live" appear here.
 *
 * Each action carries an inputSchema that is:
 *   1. Served by GET /api/integrations/tools so the frontend can render forms.
 *   2. Used directly by the per-action validator in dispatchNotion / dispatchMeta.
 *
 * Adding a new provider: add an entry here + a dispatcher below.
 * Adding a new field: add it to inputSchema AND update the corresponding
 *   dispatchX() validator — both live in this file, so they cannot diverge.
 */
const ACTION_REGISTRY: Record<string, ToolActionDef[]> = {
  notion: [
    {
      id:          "search_pages",
      displayName: "Search Pages",
      description: "Search Notion pages and databases visible to the bot",
      inputSchema: [
        {
          key:         "query",
          label:       "Search query",
          type:        "string",
          placeholder: "e.g. Q1 plan",
          max_length:  200,
        },
        {
          key:         "limit",
          label:       "Max results",
          type:        "number",
          placeholder: "10",
          min:         1,
          max:         100,
        },
      ],
    },
    {
      id:          "get_workspace_info",
      displayName: "Get Workspace Info",
      description: "Fetch workspace name, icon, and bot ID",
      inputSchema: [],
    },
  ],
  gmail: [
    {
      id:          "search_messages",
      displayName: "Search Messages",
      description: "Search Gmail messages using a Gmail query string (same syntax as the Gmail search bar)",
      inputSchema: [
        {
          key:         "q",
          label:       "Search query",
          type:        "string",
          required:    true,
          placeholder: "e.g. from:boss@company.com subject:report",
          help:        "Supports Gmail search operators: from:, to:, subject:, has:attachment, after:, before:, label:, etc.",
          max_length:  500,
        },
        {
          key:         "maxResults",
          label:       "Max results",
          type:        "number",
          placeholder: "10",
          min:         1,
          max:         50,
        },
      ],
    },
    {
      id:          "get_message",
      displayName: "Get Message",
      description: "Fetch a Gmail message by ID (returns metadata/headers by default — no body content)",
      uiHidden:    true, // backend / chat-context only — not useful as a manual panel action
      inputSchema: [
        {
          key:      "id",
          label:    "Message ID",
          type:     "string",
          required: true,
          help:     "Message ID from a search_messages result",
        },
        {
          key:     "format",
          label:   "Format",
          type:    "enum",
          help:    "metadata = headers only (compact). full = headers + body.",
          options: [
            { value: "metadata", label: "Metadata only (headers, no body)" },
            { value: "full",     label: "Full (includes body content)"     },
          ],
        },
      ],
    },
    {
      id:          "list_labels",
      displayName: "List Labels",
      description: "List all Gmail labels (system and user-created) for the connected account",
      inputSchema: [],
    },
  ],
  meta_ads: [
    {
      id:          "list_accounts",
      displayName: "List Ad Accounts",
      description: "List ad accounts accessible to the connected Meta user",
      inputSchema: [
        {
          key:         "limit",
          label:       "Max results",
          type:        "number",
          placeholder: "25",
          min:         1,
          max:         100,
        },
      ],
    },
    {
      id:          "list_campaigns",
      displayName: "List Campaigns",
      description: "List campaigns for a given Meta Ads ad account",
      inputSchema: [
        {
          key:         "ad_account_id",
          label:       "Ad Account ID",
          type:        "string",
          required:    true,
          placeholder: "act_123456789",
          help:        "Numeric ID with optional act_ prefix",
        },
        {
          key:         "limit",
          label:       "Max results",
          type:        "number",
          placeholder: "25",
          min:         1,
          max:         100,
        },
      ],
    },
    {
      id:          "get_insights",
      displayName: "Get Insights",
      description: "Fetch ad performance insights at account, campaign, adset, or ad level",
      inputSchema: [
        {
          key:         "ad_account_id",
          label:       "Ad Account ID",
          type:        "string",
          required:    true,
          placeholder: "act_123456789",
          help:        "Numeric ID with optional act_ prefix",
        },
        {
          key:     "level",
          label:   "Level",
          type:    "enum",
          options: [
            { value: "campaign", label: "Campaign" },
            { value: "adset",    label: "Ad Set"   },
            { value: "ad",       label: "Ad"        },
            { value: "account",  label: "Account"   },
          ],
        },
        {
          key:     "date_preset",
          label:   "Date range",
          type:    "enum",
          help:    "Use this OR date_start/date_end (not both). Pass date ranges directly to /execute.",
          options: [
            { value: "today",               label: "Today"                  },
            { value: "yesterday",           label: "Yesterday"              },
            { value: "last_3d",             label: "Last 3 days"            },
            { value: "last_7d",             label: "Last 7 days"            },
            { value: "last_14d",            label: "Last 14 days"           },
            { value: "last_28d",            label: "Last 28 days"           },
            { value: "last_30d",            label: "Last 30 days"           },
            { value: "last_90d",            label: "Last 90 days"           },
            { value: "this_week_sun_today", label: "This week (Sun–today)"  },
            { value: "this_week_mon_today", label: "This week (Mon–today)"  },
            { value: "last_week_sun_sat",   label: "Last week (Sun–Sat)"    },
            { value: "last_week_mon_sun",   label: "Last week (Mon–Sun)"    },
            { value: "this_month",          label: "This month"             },
            { value: "last_month",          label: "Last month"             },
            { value: "this_quarter",        label: "This quarter"           },
            { value: "last_quarter",        label: "Last quarter"           },
            { value: "this_year",           label: "This year"              },
            { value: "last_year",           label: "Last year"              },
          ],
        },
        {
          key:         "limit",
          label:       "Max results",
          type:        "number",
          placeholder: "25",
          min:         1,
          max:         100,
        },
      ],
    },
  ],
};

// ─── public helpers ───────────────────────────────────────────────────────────

/** All provider IDs handled by the tool router. */
export function listSupportedProviderIds(): string[] {
  return Object.keys(ACTION_REGISTRY);
}

/**
 * Returns action definitions for a provider, or null if the provider is
 * not in the tool router (e.g., planned providers with no live adapter).
 */
export function getActionsForProvider(providerId: string): ToolActionDef[] | null {
  return ACTION_REGISTRY[providerId] ?? null;
}

// ─── main entry point ─────────────────────────────────────────────────────────

/**
 * Execute a tool action for a connected provider.
 *
 * Throws ToolRouterError for routing / validation / connection errors.
 * Throws NotionAdapterError or MetaAdapterError on provider API failures.
 * Callers that need the typed provider error code should catch those separately.
 */
export async function executeAction(
  providerId: string,
  action:     string,
  input:      Record<string, unknown>,
  userId = "default",
): Promise<unknown> {

  // 1. Provider must exist in the registry
  const provider = getProvider(providerId);
  if (!provider) {
    throw new ToolRouterError(
      "PROVIDER_NOT_FOUND",
      `Unknown provider: "${providerId}"`,
    );
  }

  // 2. Provider must have a live adapter
  if (provider.implementationStatus !== "adapter_live") {
    throw new ToolRouterError(
      "PROVIDER_NOT_LIVE",
      `Provider "${providerId}" does not have a live adapter (implementation status: ${provider.implementationStatus})`,
    );
  }

  // 3. Action must be supported for this provider
  const actions = ACTION_REGISTRY[providerId];
  if (!actions || !actions.some((a) => a.id === action)) {
    const supported = (actions ?? []).map((a) => `"${a.id}"`).join(", ") || "none";
    throw new ToolRouterError(
      "ACTION_NOT_FOUND",
      `Action "${action}" is not supported for provider "${providerId}". Supported: ${supported}`,
    );
  }

  // 4. Encryption must be configured before any token retrieval
  if (!isEncryptionConfigured()) {
    throw new ToolRouterError(
      "ENCRYPTION_NOT_CONFIGURED",
      "INTEGRATIONS_ENCRYPTION_SECRET is not configured",
    );
  }

  // 5. Connection must exist and be in "connected" state.
  //    Each non-connected status gets its own error code so callers (and the UI)
  //    can distinguish "never set up" from "token revoked" from "permission issue".
  const connection = getConnectionByProvider(providerId, userId);
  if (!connection || connection.status === "disconnected") {
    throw new ToolRouterError(
      "PROVIDER_NOT_CONNECTED",
      `${provider.displayName} is not connected. Go to /integrations to connect it.`,
    );
  }
  if (connection.status === "expired") {
    throw new ToolRouterError(
      "PROVIDER_TOKEN_EXPIRED",
      `${provider.displayName} token has expired — reconnect at /integrations to restore access.`,
    );
  }
  if (connection.status === "error") {
    throw new ToolRouterError(
      "PROVIDER_PERMISSION_ERROR",
      `${provider.displayName} integration has a permission error — check access or reconnect at /integrations.`,
    );
  }
  // status === "connected" — fall through to token retrieval

  // 6. Retrieve the decrypted access token (server-side only — never passed to clients)
  const accessToken = getDecryptedAccessToken(providerId, userId);
  if (!accessToken) {
    throw new ToolRouterError(
      "TOKEN_NOT_AVAILABLE",
      `Could not retrieve ${provider.displayName} access token. Try reconnecting the integration.`,
    );
  }

  // 7. Dispatch to provider handler.
  //    Adapter errors (NotionAdapterError, MetaAdapterError) bubble to the caller.
  if (providerId === "notion") {
    return dispatchNotion(action, input, accessToken);
  }
  if (providerId === "meta_ads") {
    return dispatchMeta(action, input, accessToken);
  }
  if (providerId === "gmail") {
    // Gmail uses getValidGmailAccessToken() internally to handle refresh;
    // the accessToken from toolRouter is passed but ignored by the dispatcher.
    return dispatchGmail(action, input);
  }

  // Guard — should never reach here; ACTION_REGISTRY only contains handled providers.
  throw new ToolRouterError(
    "ACTION_NOT_FOUND",
    `No dispatcher registered for provider "${providerId}"`,
  );
}

// ─── notion dispatcher ────────────────────────────────────────────────────────

async function dispatchNotion(
  action:      string,
  input:       Record<string, unknown>,
  accessToken: string,
): Promise<unknown> {
  switch (action) {

    case "search_pages": {
      rejectUnknown(input, new Set(["query", "limit"]), action);

      let query = "";
      if (input.query !== undefined) {
        if (typeof input.query !== "string") {
          throw new ToolRouterError("VALIDATION_ERROR", `"query" must be a string`);
        }
        query = input.query.trim().slice(0, 200);
      }

      const limit = input.limit !== undefined ? validateLimit(input.limit, 1, 100) : 10;
      return searchPages(accessToken, query, limit);
    }

    case "get_workspace_info": {
      rejectUnknown(input, new Set(), action);
      return getWorkspaceInfo(accessToken);
    }

    default:
      throw new ToolRouterError("ACTION_NOT_FOUND", `Unknown Notion action: "${action}"`);
  }
}

// ─── meta_ads dispatcher ──────────────────────────────────────────────────────

const VALID_INSIGHT_LEVELS = new Set<InsightLevel>(["account", "campaign", "adset", "ad"]);

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

async function dispatchMeta(
  action:      string,
  input:       Record<string, unknown>,
  accessToken: string,
): Promise<unknown> {
  switch (action) {

    case "list_accounts": {
      rejectUnknown(input, new Set(["limit"]), action);
      const limit = input.limit !== undefined ? validateLimit(input.limit, 1, 100) : 25;
      return getAdAccounts(accessToken, limit);
    }

    case "list_campaigns": {
      rejectUnknown(input, new Set(["ad_account_id", "limit"]), action);
      const adAccountId = requireAdAccountId(input.ad_account_id);
      const limit = input.limit !== undefined ? validateLimit(input.limit, 1, 100) : 25;
      return getCampaigns(accessToken, adAccountId, limit);
    }

    case "get_insights": {
      rejectUnknown(input, new Set([
        "ad_account_id", "level", "date_preset", "date_start", "date_end", "fields", "limit",
      ]), action);

      const adAccountId = requireAdAccountId(input.ad_account_id);

      // level
      let level: InsightLevel = "campaign";
      if (input.level !== undefined) {
        if (typeof input.level !== "string" || !VALID_INSIGHT_LEVELS.has(input.level as InsightLevel)) {
          throw new ToolRouterError(
            "VALIDATION_ERROR",
            `"level" must be one of: ${Array.from(VALID_INSIGHT_LEVELS).join(", ")}`,
          );
        }
        level = input.level as InsightLevel;
      }

      // date_preset and date_start/date_end are mutually exclusive
      if (input.date_preset !== undefined && (input.date_start !== undefined || input.date_end !== undefined)) {
        throw new ToolRouterError(
          "VALIDATION_ERROR",
          '"date_preset" and "date_start"/"date_end" are mutually exclusive — use one or the other',
        );
      }

      let datePreset: DatePreset | undefined;
      if (input.date_preset !== undefined) {
        if (typeof input.date_preset !== "string" || !VALID_DATE_PRESETS.has(input.date_preset as DatePreset)) {
          throw new ToolRouterError(
            "VALIDATION_ERROR",
            `"date_preset" must be one of: ${Array.from(VALID_DATE_PRESETS).join(", ")}`,
          );
        }
        datePreset = input.date_preset as DatePreset;
      }

      let dateStart: string | undefined;
      if (input.date_start !== undefined) {
        if (typeof input.date_start !== "string" || !DATE_RE.test(input.date_start)) {
          throw new ToolRouterError("VALIDATION_ERROR", `"date_start" must be YYYY-MM-DD`);
        }
        dateStart = input.date_start;
      }

      let dateEnd: string | undefined;
      if (input.date_end !== undefined) {
        if (typeof input.date_end !== "string" || !DATE_RE.test(input.date_end)) {
          throw new ToolRouterError("VALIDATION_ERROR", `"date_end" must be YYYY-MM-DD`);
        }
        dateEnd = input.date_end;
      }

      if (dateEnd && !dateStart) {
        throw new ToolRouterError(
          "VALIDATION_ERROR",
          '"date_end" requires "date_start" to also be provided',
        );
      }

      // fields
      let fields: string[] | undefined;
      if (input.fields !== undefined) {
        if (!Array.isArray(input.fields) || !input.fields.every((f) => typeof f === "string")) {
          throw new ToolRouterError("VALIDATION_ERROR", `"fields" must be an array of strings`);
        }
        const cleaned = (input.fields as string[]).map((f) => f.trim()).filter(Boolean);
        if (cleaned.length > 0) fields = cleaned;
      }

      const limit = input.limit !== undefined ? validateLimit(input.limit, 1, 100) : 25;

      return getInsights(accessToken, {
        adAccountId,
        level,
        datePreset,
        dateStart,
        dateEnd,
        fields,
        limit,
      });
    }

    default:
      throw new ToolRouterError("ACTION_NOT_FOUND", `Unknown Meta Ads action: "${action}"`);
  }
}

// ─── gmail dispatcher ─────────────────────────────────────────────────────────

/**
 * Gmail dispatches through getValidGmailAccessToken() rather than the token
 * passed by executeAction() so that time-based token refresh is handled
 * transparently without requiring the caller to know about it.
 *
 * GmailAdapterError bubbles to the execute route which handles status flips.
 */
async function dispatchGmail(
  action: string,
  input:  Record<string, unknown>,
): Promise<unknown> {
  // getValidGmailAccessToken() handles refresh and throws GmailAdapterError on failure.
  const token = await getValidGmailAccessToken();

  switch (action) {

    case "search_messages": {
      rejectUnknown(input, new Set(["q", "maxResults"]), action);

      if (!input.q || typeof input.q !== "string" || !input.q.trim()) {
        throw new ToolRouterError("VALIDATION_ERROR", `"q" is required and must be a non-empty string`);
      }
      const q = input.q.trim().slice(0, 500);

      const maxResults = input.maxResults !== undefined
        ? validateLimit(input.maxResults, 1, 50)
        : 10;

      return searchMessages(token, { q, maxResults });
    }

    case "get_message": {
      rejectUnknown(input, new Set(["id", "format"]), action);

      if (!input.id || typeof input.id !== "string" || !input.id.trim()) {
        throw new ToolRouterError("VALIDATION_ERROR", `"id" is required and must be a non-empty string`);
      }
      const id = input.id.trim();

      const VALID_FORMATS = new Set<GmailMessageFormat>(["metadata", "full"]);
      let format: GmailMessageFormat = "metadata";
      if (input.format !== undefined) {
        if (typeof input.format !== "string" || !VALID_FORMATS.has(input.format as GmailMessageFormat)) {
          throw new ToolRouterError("VALIDATION_ERROR", `"format" must be "metadata" or "full"`);
        }
        format = input.format as GmailMessageFormat;
      }

      return getMessage(token, { id, format });
    }

    case "list_labels": {
      rejectUnknown(input, new Set(), action);
      return listLabels(token);
    }

    default:
      throw new ToolRouterError("ACTION_NOT_FOUND", `Unknown Gmail action: "${action}"`);
  }
}

// ─── validation helpers ───────────────────────────────────────────────────────

/** Throws VALIDATION_ERROR if input contains keys not in the allowed set. */
function rejectUnknown(
  input:   Record<string, unknown>,
  allowed: Set<string>,
  action:  string,
): void {
  const unknown = Object.keys(input).filter((k) => !allowed.has(k));
  if (unknown.length > 0) {
    throw new ToolRouterError(
      "VALIDATION_ERROR",
      `Unknown input field(s) for action "${action}": ${unknown.map((k) => `"${k}"`).join(", ")}`,
    );
  }
}

/** Validates that raw is an integer in [min, max] and returns it. */
function validateLimit(raw: unknown, min: number, max: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    throw new ToolRouterError("VALIDATION_ERROR", `"limit" must be an integer`);
  }
  if (raw < min || raw > max) {
    throw new ToolRouterError("VALIDATION_ERROR", `"limit" must be between ${min} and ${max}`);
  }
  return raw;
}

/** Validates and returns a Meta ad account ID (accepts with or without "act_" prefix). */
function requireAdAccountId(raw: unknown): string {
  if (!raw || typeof raw !== "string") {
    throw new ToolRouterError("VALIDATION_ERROR", `"ad_account_id" is required and must be a string`);
  }
  const trimmed = raw.trim();
  const numeric = trimmed.startsWith("act_") ? trimmed.slice(4) : trimmed;
  if (!/^\d+$/.test(numeric) || numeric.length === 0) {
    throw new ToolRouterError(
      "VALIDATION_ERROR",
      `"ad_account_id" must be a numeric ID (e.g. "123456789" or "act_123456789")`,
    );
  }
  return trimmed;
}

// ─── re-exports for callers that need to distinguish adapter errors ────────────

export { NotionAdapterError, MetaAdapterError, GmailAdapterError };
