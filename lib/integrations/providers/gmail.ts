/**
 * lib/integrations/providers/gmail.ts
 * Read-only Gmail API adapter.
 *
 * Supported operations:
 *   searchMessages()  — users.messages.list filtered by a Gmail query string
 *   getMessage()      — users.messages.get (metadata format by default — no body content)
 *   listLabels()      — users.labels.list
 *
 * Error codes:
 *   GMAIL_UNAUTHORIZED    — token invalid, revoked, or invalid_grant (HTTP 401)
 *   GMAIL_FORBIDDEN       — insufficient permissions (HTTP 403, non-rate-limit)
 *   GMAIL_RATE_LIMITED    — API quota exceeded (HTTP 429 or 403 rateLimitExceeded)
 *   GMAIL_UPSTREAM_ERROR  — Google server error (HTTP 5xx)
 *   GMAIL_NETWORK_ERROR   — network / timeout failure
 *   GMAIL_INVALID_RESPONSE — non-JSON or unexpected shape
 *
 * All requests use "Authorization: Bearer <token>" — token is never appended
 * as a query parameter to avoid accidental logging.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

// ─── error types ──────────────────────────────────────────────────────────────

export type GmailErrorCode =
  | "GMAIL_UNAUTHORIZED"
  | "GMAIL_FORBIDDEN"
  | "GMAIL_RATE_LIMITED"
  | "GMAIL_UPSTREAM_ERROR"
  | "GMAIL_NETWORK_ERROR"
  | "GMAIL_INVALID_RESPONSE";

export class GmailAdapterError extends Error {
  constructor(
    public readonly code: GmailErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GmailAdapterError";
  }
}

// ─── constants ────────────────────────────────────────────────────────────────

const GMAIL_API      = "https://gmail.googleapis.com/gmail/v1/users/me";
const REQUEST_TIMEOUT_MS = 15_000;

/** Gmail API error reason strings that indicate rate limiting. */
const RATE_LIMIT_REASONS = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
]);

// ─── low-level fetch ──────────────────────────────────────────────────────────

/**
 * Makes a GET request to the Gmail REST API using Bearer auth.
 * Throws GmailAdapterError on any failure — never logs the token.
 */
async function gmailGet(
  accessToken: string,
  path:        string,
  params:      Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(`${GMAIL_API}${path}`);
  for (const [key, val] of Object.entries(params)) {
    url.searchParams.set(key, val);
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new GmailAdapterError(
        "GMAIL_NETWORK_ERROR",
        "Gmail API timed out — check your connection and try again.",
      );
    }
    throw new GmailAdapterError(
      "GMAIL_NETWORK_ERROR",
      "Could not reach the Gmail API. Check your network connection.",
    );
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GmailAdapterError(
      "GMAIL_INVALID_RESPONSE",
      "Gmail returned a non-JSON response.",
    );
  }

  // Google surfaces errors as { error: { code, message, errors: [{ reason }] } }
  const apiErr = (body as { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> } }).error;
  if (apiErr || !res.ok) {
    const httpStatus = res.status;
    const apiMsg     = apiErr?.message ?? `HTTP ${httpStatus}`;
    const reason     = apiErr?.errors?.[0]?.reason ?? "";

    if (httpStatus === 401) {
      throw new GmailAdapterError(
        "GMAIL_UNAUTHORIZED",
        `Gmail token is invalid or has been revoked. Reconnect the integration. (${apiMsg})`,
      );
    }

    if (httpStatus === 429 || (httpStatus === 403 && RATE_LIMIT_REASONS.has(reason))) {
      throw new GmailAdapterError(
        "GMAIL_RATE_LIMITED",
        "Gmail API rate limit exceeded. Try again in a moment.",
      );
    }

    if (httpStatus === 403) {
      throw new GmailAdapterError(
        "GMAIL_FORBIDDEN",
        `Insufficient permissions for this Gmail resource. ` +
        `Ensure the gmail.readonly scope was granted. (${apiMsg})`,
      );
    }

    if (httpStatus >= 500) {
      throw new GmailAdapterError(
        "GMAIL_UPSTREAM_ERROR",
        `Gmail API server error (HTTP ${httpStatus}). Try again shortly.`,
      );
    }

    throw new GmailAdapterError(
      "GMAIL_UPSTREAM_ERROR",
      `Unexpected Gmail API response (HTTP ${httpStatus}): ${apiMsg}`,
    );
  }

  return body;
}

// ─── result types ─────────────────────────────────────────────────────────────

export interface GmailMessageRef {
  /** Message ID — pass to getMessage() for full details. */
  id:       string;
  threadId: string;
}

export interface GmailSearchResult {
  messages:          GmailMessageRef[];
  resultSizeEstimate: number;
  /** True when more pages exist (nextPageToken was present). */
  has_more:          boolean;
}

export type GmailMessageFormat = "metadata" | "full";

export interface GmailHeader {
  name:  string;
  value: string;
}

export interface GmailMessagePart {
  partId:   string;
  mimeType: string;
  headers:  GmailHeader[];
  /** Omitted when format=metadata to avoid returning email body content. */
  body?: { size: number; data?: string };
}

export interface GmailMessage {
  id:           string;
  threadId:     string;
  labelIds:     string[];
  snippet:      string;
  /** Unix epoch milliseconds */
  internalDate: string;
  /** Only populated when format="metadata" or "full" */
  payload?: {
    headers:  GmailHeader[];
    mimeType: string;
    parts?:   GmailMessagePart[];
  };
  /** Byte size of the entire message */
  sizeEstimate: number;
}

export interface GmailLabel {
  id:                  string;
  name:                string;
  /** "system" | "user" */
  type:                string;
  messageListVisibility?: string;
  labelListVisibility?:   string;
}

export interface GmailLabelsResult {
  labels: GmailLabel[];
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Searches Gmail messages using a Gmail query string.
 * Returns message IDs and thread IDs — not full message content.
 * Use getMessage() to fetch individual message details.
 *
 * @param accessToken  Decrypted (and validated/refreshed) Gmail access token
 * @param query        Gmail search query (same syntax as the Gmail search bar)
 * @param maxResults   Number of results to return (1–50, default 10)
 *
 * Throws GmailAdapterError on any API failure.
 */
export async function searchMessages(
  accessToken: string,
  query: { q: string; maxResults?: number },
): Promise<GmailSearchResult> {
  const max = Math.min(Math.max(1, query.maxResults ?? 10), 50);

  const raw = await gmailGet(accessToken, "/messages", {
    q:          query.q,
    maxResults: String(max),
  }) as {
    messages?:           Array<{ id: string; threadId: string }>;
    resultSizeEstimate?: number;
    nextPageToken?:      string;
  };

  return {
    messages:           (raw.messages ?? []).map((m) => ({ id: m.id, threadId: m.threadId })),
    resultSizeEstimate: raw.resultSizeEstimate ?? 0,
    has_more:           Boolean(raw.nextPageToken),
  };
}

/**
 * Fetches a single Gmail message by ID.
 * Defaults to format="metadata" which returns headers only (no message body),
 * keeping tool results compact and avoiding unintended content exposure.
 *
 * @param accessToken  Decrypted Gmail access token
 * @param params       { id: string; format?: "metadata" | "full" }
 *
 * Throws GmailAdapterError on any API failure.
 */
export async function getMessage(
  accessToken: string,
  params: { id: string; format?: GmailMessageFormat },
): Promise<GmailMessage> {
  const format = params.format ?? "metadata";

  const raw = await gmailGet(accessToken, `/messages/${params.id}`, { format }) as {
    id?:           string;
    threadId?:     string;
    labelIds?:     string[];
    snippet?:      string;
    internalDate?: string;
    sizeEstimate?: number;
    payload?: {
      headers?:  GmailHeader[];
      mimeType?: string;
      parts?:    GmailMessagePart[];
    };
  };

  return {
    id:           raw.id            ?? params.id,
    threadId:     raw.threadId      ?? "",
    labelIds:     raw.labelIds      ?? [],
    snippet:      raw.snippet       ?? "",
    internalDate: raw.internalDate  ?? "",
    sizeEstimate: raw.sizeEstimate  ?? 0,
    payload:      raw.payload
      ? {
          headers:  raw.payload.headers  ?? [],
          mimeType: raw.payload.mimeType ?? "",
          parts:    raw.payload.parts,
        }
      : undefined,
  };
}

/**
 * Lists all Gmail labels for the authenticated user.
 *
 * @param accessToken  Decrypted Gmail access token
 *
 * Throws GmailAdapterError on any API failure.
 */
export async function listLabels(
  accessToken: string,
): Promise<GmailLabelsResult> {
  const raw = await gmailGet(accessToken, "/labels") as {
    labels?: Array<{
      id?:                    string;
      name?:                  string;
      type?:                  string;
      messageListVisibility?: string;
      labelListVisibility?:   string;
    }>;
  };

  return {
    labels: (raw.labels ?? []).map((l) => ({
      id:                    l.id   ?? "",
      name:                  l.name ?? "",
      type:                  l.type ?? "",
      messageListVisibility: l.messageListVisibility,
      labelListVisibility:   l.labelListVisibility,
    })),
  };
}
