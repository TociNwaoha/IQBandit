/**
 * lib/logger.ts
 * Request logger for the /api/openclaw/chat endpoint.
 *
 * What it does:
 *   Writes one row to SQLite (or a JSON file) every time a chat request
 *   completes — whether it succeeded or failed. This gives you a record of
 *   who used the chat, which models they used, how fast the gateway responded,
 *   and how much data was exchanged.
 *
 * Storage strategy (two-tier fallback):
 *   1. SQLite via better-sqlite3 → ./logs/requests.db
 *      Fast, queryable, survives restarts. Best choice.
 *   2. NDJSON (newline-delimited JSON) → ./logs/requests.ndjson
 *      Plain text, one JSON object per line. Used only if SQLite fails to load.
 *      (e.g. better-sqlite3 not installed, native build failed, wrong arch)
 *
 * SERVER-SIDE ONLY — never import this in a "use client" component.
 */

import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Log entry shape
// ---------------------------------------------------------------------------

/** One record per chat request. Fields match the SQLite table columns exactly. */
export interface ChatLogEntry {
  /** ISO-8601 timestamp of when the request was received */
  timestamp: string;
  /** Email from the session JWT — identifies who made the request */
  email: string;
  /** Model name sent by the client, e.g. "gpt-4o" */
  model: string;
  /** How long the full request took in milliseconds, including gateway round-trip */
  latency_ms: number;
  /** true if the gateway returned a 2xx response; false on any error */
  success: boolean;
  /** Error message for debugging. Empty string ("") on success. */
  error_message: string;
  /** Total character count of all messages sent to the gateway */
  prompt_chars: number;
  /**
   * Total character count of the response received from the gateway.
   * For streaming responses this is a byte count approximation (close enough for logging).
   */
  response_chars: number;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

// process.cwd() always points to the project root during `next dev` and `next start`.
// Do NOT use __dirname here — in Next.js App Router, __dirname points to
// .next/server/chunks/ which is inside the build output directory.
const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");
const NDJSON_PATH = path.join(LOGS_DIR, "requests.ndjson");

/** Creates the ./logs/ directory if it doesn't exist. Safe to call repeatedly. */
function ensureLogsDir(): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// SQLite backend
// ---------------------------------------------------------------------------

// We use the import() type only for TypeScript's type checker — this never
// runs as actual code. The real load happens in tryOpenSQLite() below.
type BetterSQLiteDB = import("better-sqlite3").Database;
type BetterSQLiteStatement = import("better-sqlite3").Statement;

/**
 * Tries to open (or create) the SQLite database and set up the table.
 * Returns the database instance on success, or null if anything goes wrong.
 *
 * We catch all errors here so that if better-sqlite3 isn't installed —
 * or the native binary doesn't match the current Node version —
 * the app still starts and falls back to NDJSON logging.
 */
function tryOpenSQLite(): BetterSQLiteDB | null {
  try {
    ensureLogsDir();

    // Dynamic require (not a static import) so TypeScript compiles even when
    // the package is absent. The cast gives us proper types in the happy path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");

    const db: BetterSQLiteDB = new Database(DB_PATH);

    // WAL (Write-Ahead Logging) mode: allows concurrent reads while a write
    // is happening. Recommended for any SQLite used with multiple requests.
    db.pragma("journal_mode = WAL");

    // Create the table if it doesn't already exist.
    // INTEGER for success (SQLite has no BOOLEAN type — we store 0 or 1).
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_requests (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp      TEXT    NOT NULL,
        email          TEXT    NOT NULL,
        model          TEXT    NOT NULL,
        latency_ms     INTEGER NOT NULL,
        success        INTEGER NOT NULL,
        error_message  TEXT    NOT NULL,
        prompt_chars   INTEGER NOT NULL,
        response_chars INTEGER NOT NULL
      )
    `);

    console.log(`[logger] SQLite ready → ${DB_PATH}`);
    return db;
  } catch (err) {
    // Warn but do NOT throw — the app will use NDJSON instead
    console.warn(
      "[logger] SQLite unavailable, falling back to NDJSON.",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

// `db` and `insertStmt` are set once when this module first loads.
// In Next.js (Node runtime), modules are cached for the life of the process,
// so these are effectively "module-level globals" — safe and intentional.
const db: BetterSQLiteDB | null = tryOpenSQLite();

/**
 * Prepared statement for inserting log rows.
 * Preparing once at startup (not on every insert) is faster and the
 * recommended pattern for better-sqlite3.
 */
const insertStmt: BetterSQLiteStatement | null = db
  ? db.prepare(`
      INSERT INTO chat_requests
        (timestamp, email, model, latency_ms, success, error_message, prompt_chars, response_chars)
      VALUES
        (@timestamp, @email, @model, @latency_ms, @success, @error_message, @prompt_chars, @response_chars)
    `)
  : null;

// ---------------------------------------------------------------------------
// NDJSON fallback
// ---------------------------------------------------------------------------

/** Appends a single JSON line to the NDJSON file. Used when SQLite is not available. */
function logToNDJSON(entry: ChatLogEntry): void {
  try {
    ensureLogsDir();
    // JSON.stringify gives a single-line string; \n makes it newline-delimited (NDJSON format)
    fs.appendFileSync(NDJSON_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    // If the file write fails (permissions, disk full), log to stderr only.
    // We deliberately do NOT rethrow — a logging failure must never crash a chat request.
    console.error("[logger] NDJSON write failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Logs one completed chat request.
 *
 * Call this after the request finishes (whether it succeeded or failed):
 *
 *   logChatRequest({
 *     timestamp:      new Date().toISOString(),
 *     email:          session.email,
 *     model:          "gpt-4o",
 *     latency_ms:     Date.now() - startTime,
 *     success:        true,
 *     error_message:  "",
 *     prompt_chars:   420,
 *     response_chars: 1200,
 *   });
 *
 * This function is intentionally synchronous. Both backends use sync I/O
 * (better-sqlite3 is a sync library; fs.appendFileSync is sync), so there
 * is no benefit to making this async and it simplifies the call sites.
 *
 * This function never throws. A logging failure is printed to stderr and
 * swallowed — it must never propagate and crash a chat response.
 */
export function logChatRequest(entry: ChatLogEntry): void {
  if (db && insertStmt) {
    // SQLite path — convert boolean to integer (SQLite stores 0/1 for booleans)
    try {
      insertStmt.run({ ...entry, success: entry.success ? 1 : 0 });
    } catch (err) {
      // SQLite write failed (e.g. disk full). Try NDJSON as a last resort.
      console.error("[logger] SQLite insert failed, retrying with NDJSON:", err);
      logToNDJSON(entry);
    }
  } else {
    // NDJSON path (SQLite not available)
    logToNDJSON(entry);
  }
}

/**
 * Returns the most recent `limit` log entries, newest first.
 * Never throws — returns [] on any read failure.
 */
export function getRecentLogs(limit = 50): ChatLogEntry[] {
  if (db) {
    try {
      const stmt = db.prepare(
        `SELECT timestamp, email, model, latency_ms, success, error_message, prompt_chars, response_chars
         FROM chat_requests ORDER BY id DESC LIMIT ?`
      );
      const rows = stmt.all(limit) as Array<ChatLogEntry & { success: number }>;
      return rows.map((r) => ({ ...r, success: r.success === 1 }));
    } catch (err) {
      console.error("[logger] SQLite read failed:", err);
    }
  }
  // NDJSON fallback: read last N lines from the file
  try {
    if (!fs.existsSync(NDJSON_PATH)) return [];
    const lines = fs
      .readFileSync(NDJSON_PATH, "utf8")
      .split("\n")
      .filter(Boolean);
    return lines
      .slice(-limit)
      .reverse()
      .map((l) => JSON.parse(l) as ChatLogEntry);
  } catch (err) {
    console.error("[logger] NDJSON read failed:", err);
    return [];
  }
}
