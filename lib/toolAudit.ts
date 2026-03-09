/**
 * lib/toolAudit.ts
 * SQLite-backed audit trail for tool consent decisions.
 *
 * Table: tool_audit
 *   Rows written whenever a user makes a consent decision (allow_once,
 *   always_allow, deny) for a tool intent.
 *
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs   from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToolConsentDecision = "allow_once" | "always_allow" | "deny";
export type ConsentTool         = "web" | "files" | "gmail";

export interface ToolAuditEntry {
  id:              string;
  conversation_id: string;
  agent_id:        string;
  tool:            ConsentTool;
  decision:        ToolConsentDecision;
  reason:          string;
  query:           string | null;
  policy_source:   "department" | "agent_override";
  created_at:      string;
}

export interface LogToolAuditInput {
  conversation_id: string;
  agent_id:        string;
  tool:            ConsentTool;
  decision:        ToolConsentDecision;
  reason:          string;
  query?:          string | null;
  /** Whether the decision came from a department policy or an agent-level override. */
  policy_source?:  "department" | "agent_override";
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH  = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_audit (
        id              TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL DEFAULT '',
        agent_id        TEXT NOT NULL DEFAULT '',
        tool            TEXT NOT NULL,
        decision        TEXT NOT NULL,
        reason          TEXT NOT NULL DEFAULT '',
        query           TEXT,
        policy_source   TEXT NOT NULL DEFAULT 'department',
        created_at      TEXT NOT NULL
      );
    `);

    // Migration: add policy_source to existing tables (no-op if already present)
    try { db.exec(`ALTER TABLE tool_audit ADD COLUMN policy_source TEXT NOT NULL DEFAULT 'department'`); } catch {}

    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Write a consent decision to the audit log.
 * Non-throwing — DB errors are swallowed.
 */
export function logToolAudit(input: LogToolAuditInput): void {
  if (!db) return;
  try {
    db.prepare(
      `INSERT INTO tool_audit (id, conversation_id, agent_id, tool, decision, reason, query, policy_source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      randomUUID(),
      input.conversation_id,
      input.agent_id,
      input.tool,
      input.decision,
      input.reason,
      input.query ?? null,
      input.policy_source ?? "department",
      new Date().toISOString(),
    );
  } catch (err) {
    console.error("[toolAudit] logToolAudit failed:", err);
  }
}

/**
 * Returns the most recent audit entries, newest first.
 * Returns [] if DB is unavailable.
 */
export function listToolAudit(limit = 100): ToolAuditEntry[] {
  if (!db) return [];
  try {
    return db
      .prepare("SELECT * FROM tool_audit ORDER BY created_at DESC LIMIT ?")
      .all(limit) as ToolAuditEntry[];
  } catch {
    return [];
  }
}

export interface ToolAuditFilter {
  conversation_id?: string;
  agent_id?:        string;
  tool?:            string;
  decision?:        string;
  limit?:           number;
}

/**
 * Returns audit entries filtered by any combination of fields.
 * Sorted newest first. Returns [] if DB is unavailable.
 */
export function listToolAuditFiltered(filter: ToolAuditFilter = {}): ToolAuditEntry[] {
  if (!db) return [];
  const conditions: string[] = [];
  const params: unknown[]    = [];

  if (filter.conversation_id) { conditions.push("conversation_id = ?"); params.push(filter.conversation_id); }
  if (filter.agent_id)        { conditions.push("agent_id = ?");        params.push(filter.agent_id); }
  if (filter.tool)            { conditions.push("tool = ?");             params.push(filter.tool); }
  if (filter.decision)        { conditions.push("decision = ?");         params.push(filter.decision); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(filter.limit ?? 100, 500);

  try {
    return db
      .prepare(`SELECT * FROM tool_audit ${where} ORDER BY created_at DESC LIMIT ?`)
      .all(...params, limit) as ToolAuditEntry[];
  } catch {
    return [];
  }
}
