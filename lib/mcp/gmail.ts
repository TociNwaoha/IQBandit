/**
 * lib/mcp/gmail.ts
 *
 * Typed wrappers around the local MCP Gmail server tools.
 *
 * Each function:
 *  1. Gets (or spawns) the singleton MCP Gmail process
 *  2. Calls the appropriate tool via JSON-RPC
 *  3. Parses the MCP content block and returns a typed result
 *
 * Tools exposed by the mcp-gmail server:
 *  - gmail_search({ q, maxResults? })   → McpGmailSearchResult[]
 *  - gmail_read({ id })                 → McpGmailReadResult
 *  - gmail_list_labels()                → McpGmailLabel[]
 *
 * All errors (auth, network, MCP protocol) propagate as plain Error instances.
 * Callers decide whether to surface them to users.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import { getOrCreateMcpGmailClient } from "./stdioClient";

// ── Result types (mirrors mcp-gmail/src/gmail/gmailClient.ts) ─────────────────

export interface McpGmailSearchResult {
  id:      string;
  from:    string;
  subject: string;
  date:    string;
  snippet: string;
}

export interface McpGmailReadResult {
  id:       string;
  from:     string;
  to:       string;
  subject:  string;
  date:     string;
  /** Plain-text body, truncated to 2000 chars by the MCP server */
  bodyText: string;
}

export interface McpGmailLabel {
  id:   string;
  name: string;
  type: string;
}

// ── MCP content-block parsing ─────────────────────────────────────────────────

interface McpToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/**
 * Extract the text payload from an MCP `tools/call` response.
 * Throws if the server signalled an error (isError: true).
 */
function extractText(raw: unknown): string {
  const result = raw as McpToolResult | null;
  const text   = result?.content?.find((c) => c.type === "text")?.text ?? "";

  if (result?.isError) {
    throw new Error(`Gmail MCP tool error: ${text || "(no detail)"}`);
  }

  return text;
}

/**
 * Extract text and parse it as JSON of type T.
 */
function parseJson<T>(raw: unknown): T {
  const text = extractText(raw);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Gmail MCP returned non-JSON: ${text.slice(0, 200)}`,
    );
  }
}

// ── Tool wrappers ─────────────────────────────────────────────────────────────

/**
 * Search Gmail using a Gmail query string.
 *
 * Returns an empty array when no messages match.
 * Throws on auth / network / MCP errors.
 */
export async function gmailSearch(params: {
  q:           string;
  maxResults?: number;
}): Promise<McpGmailSearchResult[]> {
  const client = getOrCreateMcpGmailClient();

  const raw = await client.callTool("gmail_search", {
    q:          params.q,
    maxResults: params.maxResults ?? 5,
  });

  // MCP server returns "No messages found." (plain text, not JSON) for empty results
  const text = extractText(raw);
  if (!text || text === "No messages found.") return [];

  return JSON.parse(text) as McpGmailSearchResult[];
}

/**
 * Fetch a full Gmail message by its ID.
 *
 * Returns headers + body text (truncated to 2000 chars by the MCP server).
 * Throws on auth / network / MCP errors.
 */
export async function gmailRead(params: { id: string }): Promise<McpGmailReadResult> {
  const client = getOrCreateMcpGmailClient();
  const raw    = await client.callTool("gmail_read", { id: params.id });
  return parseJson<McpGmailReadResult>(raw);
}

/**
 * List all Gmail labels (system + user-created).
 *
 * Primarily used as a connectivity / health check — if this succeeds, the
 * MCP server is running and Gmail tokens are valid.
 * Throws on auth / network / MCP errors.
 */
export async function gmailListLabels(): Promise<McpGmailLabel[]> {
  const client = getOrCreateMcpGmailClient();
  const raw    = await client.callTool("gmail_list_labels", {});
  return parseJson<McpGmailLabel[]>(raw);
}
