/**
 * lib/integrations/providers/notion.ts
 * Read-only Notion API adapter.
 *
 * Supported operations:
 *   searchPages()       — search pages and databases visible to the bot
 *   getWorkspaceInfo()  — validate token and return workspace metadata
 *
 * Error codes:
 *   NOTION_UNAUTHORIZED   — token invalid or revoked (HTTP 401)
 *   NOTION_FORBIDDEN      — token lacks permission for the resource (HTTP 403)
 *   NOTION_RATE_LIMITED   — hit Notion's rate limit (HTTP 429)
 *   NOTION_UNAVAILABLE    — Notion server error (HTTP 5xx)
 *   NOTION_NETWORK_ERROR  — network/timeout failure
 *   NOTION_INVALID_RESPONSE — non-JSON or unexpected shape
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

// ─── error types ──────────────────────────────────────────────────────────────

export type NotionErrorCode =
  | "NOTION_UNAUTHORIZED"
  | "NOTION_FORBIDDEN"
  | "NOTION_RATE_LIMITED"
  | "NOTION_UNAVAILABLE"
  | "NOTION_NETWORK_ERROR"
  | "NOTION_INVALID_RESPONSE";

export class NotionAdapterError extends Error {
  constructor(
    public readonly code: NotionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "NotionAdapterError";
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

const NOTION_API = "https://api.notion.com/v1";
/** Pin to a stable version. Upgrade intentionally when needed. */
const NOTION_VERSION = "2022-06-28";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGE_SIZE = 100;

// ─── low-level fetch ──────────────────────────────────────────────────────────

function buildHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(
  accessToken: string,
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown
): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${NOTION_API}${path}`, {
      method,
      headers: buildHeaders(accessToken),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new NotionAdapterError(
        "NOTION_NETWORK_ERROR",
        "Notion API timed out — check your connection and try again."
      );
    }
    throw new NotionAdapterError(
      "NOTION_NETWORK_ERROR",
      "Could not reach the Notion API. Check your network connection."
    );
  }

  if (res.ok) {
    try {
      return await res.json();
    } catch {
      throw new NotionAdapterError(
        "NOTION_INVALID_RESPONSE",
        "Notion returned a non-JSON response."
      );
    }
  }

  // Map HTTP status codes to typed errors
  switch (res.status) {
    case 401:
      throw new NotionAdapterError(
        "NOTION_UNAUTHORIZED",
        "Notion token is invalid or has been revoked. Reconnect the integration."
      );
    case 403:
      throw new NotionAdapterError(
        "NOTION_FORBIDDEN",
        "The Notion integration does not have permission for this resource. " +
          "Make sure the page or database is shared with your integration."
      );
    case 429:
      throw new NotionAdapterError(
        "NOTION_RATE_LIMITED",
        "Notion rate limit exceeded. Try again in a moment."
      );
    default:
      if (res.status >= 500) {
        throw new NotionAdapterError(
          "NOTION_UNAVAILABLE",
          `Notion API server error (HTTP ${res.status}). Try again shortly.`
        );
      }
      throw new NotionAdapterError(
        "NOTION_UNAVAILABLE",
        `Unexpected Notion API response (HTTP ${res.status}).`
      );
  }
}

// ─── result types ─────────────────────────────────────────────────────────────

/** Normalized page or database returned by this adapter. */
export interface NotionPageResult {
  id: string;
  object: "page" | "database";
  title: string;
  url: string;
  last_edited_time: string;
  created_time: string;
}

export interface NotionSearchResults {
  results: NotionPageResult[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionWorkspaceInfo {
  bot_id: string;
  workspace_name: string;
  workspace_icon: string | null;
}

// ─── normalization helpers ────────────────────────────────────────────────────

/**
 * Extracts a plain-text title from a raw Notion page or database object.
 * Notion page titles live inside `properties[key].title[]`.
 * Notion database titles live directly in `title[]`.
 */
function extractTitle(raw: Record<string, unknown>): string {
  // Database objects: top-level `title` array
  if (raw.object === "database" && Array.isArray(raw.title)) {
    const text = (raw.title as Array<{ plain_text?: string }>)
      .map((t) => t.plain_text ?? "")
      .join("")
      .trim();
    return text || "Untitled Database";
  }

  // Page objects: search `properties` for a "title" typed property
  if (raw.object === "page" && raw.properties && typeof raw.properties === "object") {
    for (const prop of Object.values(raw.properties as Record<string, unknown>)) {
      const p = prop as Record<string, unknown>;
      if (p.type === "title" && Array.isArray(p.title)) {
        const text = (p.title as Array<{ plain_text?: string }>)
          .map((t) => t.plain_text ?? "")
          .join("")
          .trim();
        return text || "Untitled Page";
      }
    }
  }

  return "Untitled";
}

function normalizeResult(raw: Record<string, unknown>): NotionPageResult {
  return {
    id: String(raw.id ?? ""),
    object: raw.object === "database" ? "database" : "page",
    title: extractTitle(raw),
    url: String(raw.url ?? ""),
    last_edited_time: String(raw.last_edited_time ?? ""),
    created_time: String(raw.created_time ?? ""),
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Searches Notion pages and databases visible to the connected bot.
 *
 * @param accessToken  Decrypted Notion OAuth access token (server-side only)
 * @param query        Optional freetext query; empty = return recent pages
 * @param limit        Number of results to return (1–100, default 10)
 *
 * Throws NotionAdapterError on any API failure.
 */
export async function searchPages(
  accessToken: string,
  query = "",
  limit = 10
): Promise<NotionSearchResults> {
  const pageSize = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  const body: Record<string, unknown> = {
    page_size: pageSize,
    sort: { direction: "descending", timestamp: "last_edited_time" },
  };
  if (query.trim()) {
    body.query = query.trim();
  }

  const raw = await notionFetch(accessToken, "/search", "POST", body) as {
    results: Array<Record<string, unknown>>;
    has_more: boolean;
    next_cursor: string | null;
  };

  return {
    results: (raw.results ?? []).map(normalizeResult),
    has_more: Boolean(raw.has_more),
    next_cursor: raw.next_cursor ?? null,
  };
}

/**
 * Fetches workspace/bot metadata using the Notion /users/me endpoint.
 * Useful for confirming a token is still valid and for displaying workspace info.
 *
 * Throws NotionAdapterError on any API failure.
 */
export async function getWorkspaceInfo(
  accessToken: string
): Promise<NotionWorkspaceInfo> {
  const raw = await notionFetch(accessToken, "/users/me") as {
    id: string;
    bot?: { workspace_name?: string; workspace_icon?: string };
  };

  return {
    bot_id: raw.id,
    workspace_name: raw.bot?.workspace_name ?? "Notion Workspace",
    workspace_icon: raw.bot?.workspace_icon ?? null,
  };
}
