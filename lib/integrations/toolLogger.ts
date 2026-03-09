/**
 * lib/integrations/toolLogger.ts
 * Audit logger for /api/integrations/execute — one row per tool call.
 *
 * Follows the same two-tier pattern as lib/logger.ts:
 *   1. SQLite via better-sqlite3 → ./logs/requests.db  (same file as chat logs)
 *   2. NDJSON fallback            → ./logs/tool-calls.ndjson
 *
 * The tool_calls table is created idempotently (CREATE TABLE IF NOT EXISTS)
 * so this module can be imported alongside lib/logger.ts without conflicts.
 *
 * SERVER-SIDE ONLY — never import this in a "use client" component.
 */

import fs   from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Entry shape
// ---------------------------------------------------------------------------

/** One record per tool execution attempt. Fields match the SQLite columns. */
export interface ToolCallEntry {
  /** UUID — unique per call */
  id:                   string;
  /** ISO-8601 UTC timestamp */
  timestamp:            string;
  /** User who triggered the call (currently always "default") */
  user_id:              string;
  /** Agent that was active when the call was made ("" if no agent) */
  agent_id:             string;
  /** Conversation the call originated from ("" if called outside a conversation) */
  conversation_id:      string;
  /** Provider identifier, e.g. "notion" | "meta_ads" */
  provider_id:          string;
  /** Action identifier, e.g. "search_pages" | "get_insights" */
  action:               string;
  /** true = execution succeeded, false = any error */
  success:              boolean;
  /** Wall-clock time from request start to response, in milliseconds */
  latency_ms:           number;
  /** ToolRouterError code when applicable, e.g. "PROVIDER_NOT_CONNECTED" */
  error_code:           string;
  /** Provider-level error code forwarded from adapter, e.g. "NOTION_API_ERROR" */
  provider_error_code:  string;
  /** Human-readable error message, empty on success */
  message:              string;
  /** Any extra structured data (JSON string). Default: '{}' */
  metadata_json:        string;
  /** Approval id if this call was gated by an approval (or empty string) */
  approval_id:          string;
}

// ---------------------------------------------------------------------------
// Paths — match lib/logger.ts exactly so we write to the same DB file
// ---------------------------------------------------------------------------

const LOGS_DIR    = path.resolve(process.cwd(), "logs");
const DB_PATH     = path.join(LOGS_DIR, "requests.db");
const NDJSON_PATH = path.join(LOGS_DIR, "tool-calls.ndjson");

function ensureLogsDir(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

type BetterSQLiteDB        = import("better-sqlite3").Database;
type BetterSQLiteStatement = import("better-sqlite3").Statement;

function tryOpenSQLite(): { db: BetterSQLiteDB; stmt: BetterSQLiteStatement } | null {
  try {
    ensureLogsDir();

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);

    db.pragma("journal_mode = WAL");

    // Idempotent — safe to run even if other tables already exist in this DB.
    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id                  TEXT    PRIMARY KEY,
        timestamp           TEXT    NOT NULL,
        user_id             TEXT    NOT NULL,
        agent_id            TEXT    NOT NULL DEFAULT '',
        conversation_id     TEXT    NOT NULL DEFAULT '',
        provider_id         TEXT    NOT NULL,
        action              TEXT    NOT NULL,
        success             INTEGER NOT NULL,
        latency_ms          INTEGER NOT NULL DEFAULT 0,
        error_code          TEXT    NOT NULL DEFAULT '',
        provider_error_code TEXT    NOT NULL DEFAULT '',
        message             TEXT    NOT NULL DEFAULT '',
        metadata_json       TEXT    NOT NULL DEFAULT '{}'
      )
    `);

    // Idempotent migrations — no-op if column already exists
    try {
      db.exec(`ALTER TABLE tool_calls ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''`);
    } catch { /* already present */ }
    try {
      db.exec(`ALTER TABLE tool_calls ADD COLUMN conversation_id TEXT NOT NULL DEFAULT ''`);
    } catch { /* already present */ }
    try {
      db.exec(`ALTER TABLE tool_calls ADD COLUMN approval_id TEXT NOT NULL DEFAULT ''`);
    } catch { /* already present */ }

    // Prepare INSERT after migrations so it includes all new columns.
    const stmt = db.prepare(`
      INSERT INTO tool_calls
        (id, timestamp, user_id, agent_id, conversation_id, provider_id, action, success,
         latency_ms, error_code, provider_error_code, message, metadata_json, approval_id)
      VALUES
        (@id, @timestamp, @user_id, @agent_id, @conversation_id, @provider_id, @action, @success,
         @latency_ms, @error_code, @provider_error_code, @message, @metadata_json, @approval_id)
    `);

    console.log(`[toolLogger] SQLite ready → ${DB_PATH}`);
    return { db, stmt };
  } catch (err) {
    console.warn(
      "[toolLogger] SQLite unavailable, falling back to NDJSON.",
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

const sqlite = tryOpenSQLite();
const db     = sqlite?.db   ?? null;
const insertStmt = sqlite?.stmt ?? null;

// ---------------------------------------------------------------------------
// NDJSON fallback
// ---------------------------------------------------------------------------

function logToNDJSON(entry: ToolCallEntry): void {
  try {
    ensureLogsDir();
    fs.appendFileSync(NDJSON_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[toolLogger] NDJSON write failed:", err);
  }
}

// ---------------------------------------------------------------------------
// logToolCall — input type (id and timestamp are auto-generated)
// ---------------------------------------------------------------------------

export interface LogToolCallInput {
  provider_id:          string;
  action:               string;
  success:              boolean;
  latency_ms:           number;
  error_code?:          string;
  provider_error_code?: string;
  message?:             string;
  user_id?:             string;
  agent_id?:            string;
  conversation_id?:     string;
  approval_id?:         string;
  metadata?:            Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Records one tool call execution.
 *
 * Synchronous, never throws. Failures print to stderr only.
 *
 * Usage:
 *   logToolCall({
 *     provider_id: "notion",
 *     action:      "search_pages",
 *     success:     true,
 *     latency_ms:  312,
 *     agent_id:    "abc-123",
 *   });
 */
export function logToolCall(input: LogToolCallInput): void {
  const entry: ToolCallEntry = {
    id:                  crypto.randomUUID(),
    timestamp:           new Date().toISOString(),
    user_id:             input.user_id             ?? "default",
    agent_id:            input.agent_id            ?? "",
    conversation_id:     input.conversation_id     ?? "",
    provider_id:         input.provider_id,
    action:              input.action,
    success:             input.success,
    latency_ms:          input.latency_ms,
    error_code:          input.error_code          ?? "",
    provider_error_code: input.provider_error_code ?? "",
    message:             input.message             ?? "",
    metadata_json:       input.metadata ? JSON.stringify(input.metadata) : "{}",
    approval_id:         input.approval_id         ?? "",
  };

  if (db && insertStmt) {
    try {
      insertStmt.run({ ...entry, success: entry.success ? 1 : 0, approval_id: entry.approval_id });
    } catch (err) {
      console.error("[toolLogger] SQLite insert failed, retrying with NDJSON:", err);
      logToNDJSON(entry);
    }
  } else {
    logToNDJSON(entry);
  }
}

// ---------------------------------------------------------------------------
// Filters + query
// ---------------------------------------------------------------------------

export interface ToolCallFilters {
  /** Exact provider_id match, e.g. "notion". */
  provider_id?: string;
  /** Exact action match, e.g. "search_pages". */
  action?: string;
  /** 1 = successes only, 0 = errors only. Omit for both. */
  success?: 0 | 1;
  /** UTC calendar day in YYYY-MM-DD format. */
  date?: string;
}

/**
 * Returns up to `limit` tool call entries matching the filters, newest first.
 * All SQL values are parameterized. Never throws — returns [] on failure.
 */
export function listToolCalls(
  filters: ToolCallFilters = {},
  limit = 200,
): ToolCallEntry[] {
  const conds:  string[]  = [];
  const params: unknown[] = [];

  if (filters.date) {
    conds.push("strftime('%Y-%m-%d', timestamp) = ?");
    params.push(filters.date);
  }
  if (filters.provider_id) {
    conds.push("provider_id = ?");
    params.push(filters.provider_id);
  }
  if (filters.action) {
    conds.push("action = ?");
    params.push(filters.action);
  }
  if (filters.success !== undefined) {
    conds.push("success = ?");
    params.push(filters.success);
  }

  const where = conds.length ? "WHERE " + conds.join(" AND ") : "";

  if (db) {
    try {
      const rows = db
        .prepare(
          `SELECT id, timestamp, user_id, agent_id, conversation_id, provider_id, action, success,
                  latency_ms, error_code, provider_error_code, message, metadata_json
           FROM tool_calls ${where} ORDER BY timestamp DESC LIMIT ?`,
        )
        .all(...params, limit) as Array<Omit<ToolCallEntry, "success"> & { success: number }>;

      return rows.map((r) => ({ ...r, success: r.success === 1 }));
    } catch (err) {
      console.error("[toolLogger] listToolCalls SQLite read failed:", err);
    }
  }

  // NDJSON fallback
  try {
    if (!fs.existsSync(NDJSON_PATH)) return [];
    const lines = fs.readFileSync(NDJSON_PATH, "utf8").split("\n").filter(Boolean);
    let entries = lines.reverse().map((l) => JSON.parse(l) as ToolCallEntry);

    if (filters.date) {
      entries = entries.filter((e) => e.timestamp.startsWith(filters.date!));
    }
    if (filters.provider_id) {
      entries = entries.filter((e) => e.provider_id === filters.provider_id);
    }
    if (filters.action) {
      entries = entries.filter((e) => e.action === filters.action);
    }
    if (filters.success !== undefined) {
      entries = entries.filter((e) => (e.success ? 1 : 0) === filters.success);
    }
    return entries.slice(0, limit);
  } catch (err) {
    console.error("[toolLogger] listToolCalls NDJSON read failed:", err);
    return [];
  }
}

/**
 * Returns the distinct set of provider_ids that have at least one log entry.
 * Used to populate the filter dropdown. Never throws — returns [] on failure.
 */
export function listLoggedProviders(): string[] {
  if (db) {
    try {
      const rows = db
        .prepare("SELECT DISTINCT provider_id FROM tool_calls ORDER BY provider_id ASC")
        .all() as { provider_id: string }[];
      return rows.map((r) => r.provider_id);
    } catch (err) {
      console.error("[toolLogger] listLoggedProviders failed:", err);
    }
  }
  return [];
}
