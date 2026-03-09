/**
 * lib/presence.ts
 * Lightweight agent presence model — "is this agent running right now?"
 *
 * Uses the same logs/requests.db as agents, conversations, etc.
 * Creates the agent_presence table idempotently on first import.
 *
 * Heartbeat freshness tiers:
 *   live    — last heartbeat ≤ LIVE_MS  (10 s)  → genuinely real-time
 *   stale   — last heartbeat ≤ STALE_MS (20 s)  → still plausibly working
 *   offline — older or never seen               → treat as idle
 *
 * is_working is forced to false for offline rows.
 *
 * activity / detail fields allow richer semantic presence beyond chat:
 *   activity — semantic enum: "responding" | "tooling" | "idle" | ""
 *   detail   — free text context, e.g. "Searching web" (shown in office UI)
 *
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs   from "fs";
import path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PresenceStatus = "live" | "stale" | "offline";

export interface AgentPresence {
  agent_id:          string;
  is_working:        boolean;       // false when heartbeat is stale/offline
  last_heartbeat_at: string;        // ISO timestamp of last upsert
  note:              string;        // short human-readable label
  activity:          string;        // semantic: "responding" | "tooling" | "idle" | ""
  detail:            string;        // optional extra context, e.g. "Web Search"
  presenceStatus:    PresenceStatus; // freshness tier
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Heartbeat within LIVE_MS → "live" (drives LIVE badge on client). */
const LIVE_MS  = 10_000; // 10 seconds

/** Heartbeat within STALE_MS → "stale" (still counts as WORKING, no badge). */
const STALE_MS = 20_000; // 20 seconds

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
      CREATE TABLE IF NOT EXISTS agent_presence (
        agent_id          TEXT PRIMARY KEY,
        is_working        INTEGER NOT NULL DEFAULT 0,
        last_heartbeat_at TEXT    NOT NULL,
        note              TEXT    NOT NULL DEFAULT '',
        activity          TEXT    NOT NULL DEFAULT '',
        detail            TEXT    NOT NULL DEFAULT ''
      );
    `);

    // Migrations — add new columns to existing tables (no-op if already present)
    try { db.exec(`ALTER TABLE agent_presence ADD COLUMN activity TEXT NOT NULL DEFAULT ''`); } catch {}
    try { db.exec(`ALTER TABLE agent_presence ADD COLUMN detail   TEXT NOT NULL DEFAULT ''`); } catch {}

    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upserts a heartbeat for the given agent.
 *
 * isWorking = true  → agent is actively processing (chat reply, tool call, etc.)
 * isWorking = false → agent has finished; presence expires naturally within STALE_MS
 *
 * activity  — semantic label ("responding" | "tooling" | "idle" | "")
 * detail    — optional extra context e.g. "Web Search", shown in office UI
 * note      — short human-readable label displayed in the Workstation card
 *
 * Never throws — logs to stderr on failure.
 */
export function upsertPresence(
  agentId: string,
  opts:    { isWorking: boolean; note?: string; activity?: string; detail?: string },
): void {
  if (!db) return;
  const now = new Date().toISOString();
  try {
    db.prepare(`
      INSERT INTO agent_presence (agent_id, is_working, last_heartbeat_at, note, activity, detail)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        is_working        = excluded.is_working,
        last_heartbeat_at = excluded.last_heartbeat_at,
        note              = excluded.note,
        activity          = excluded.activity,
        detail            = excluded.detail
    `).run(
      agentId,
      opts.isWorking ? 1 : 0,
      now,
      opts.note     ?? "",
      opts.activity ?? "",
      opts.detail   ?? "",
    );
  } catch (err) {
    console.error("[presence] upsertPresence failed:", err);
  }
}

/**
 * Returns presence states for the given agent IDs.
 *
 * Freshness tiers applied per row:
 *   age ≤ LIVE_MS  → presenceStatus "live",    is_working honours DB value
 *   age ≤ STALE_MS → presenceStatus "stale",   is_working honours DB value
 *   age > STALE_MS → presenceStatus "offline",  is_working forced false
 *
 * Agents not found in the DB are absent from the returned map.
 * Returns {} if DB is unavailable or agentIds is empty.
 */
export function getPresenceForAgents(
  agentIds: string[],
): Record<string, AgentPresence> {
  if (!db || agentIds.length === 0) return {};
  try {
    const placeholders = agentIds.map(() => "?").join(",");
    const rows = db
      .prepare(
        `SELECT agent_id, is_working, last_heartbeat_at, note, activity, detail
         FROM agent_presence
         WHERE agent_id IN (${placeholders})`,
      )
      .all(...agentIds) as {
        agent_id:          string;
        is_working:        number;
        last_heartbeat_at: string;
        note:              string;
        activity:          string;
        detail:            string;
      }[];

    const now    = Date.now();
    const result: Record<string, AgentPresence> = {};

    for (const row of rows) {
      const age = now - new Date(row.last_heartbeat_at).getTime();

      const presenceStatus: PresenceStatus =
        age <= LIVE_MS  ? "live"  :
        age <= STALE_MS ? "stale" :
                          "offline";

      // is_working is meaningful only within the stale window
      const is_working = row.is_working === 1 && presenceStatus !== "offline";

      result[row.agent_id] = {
        agent_id:          row.agent_id,
        is_working,
        last_heartbeat_at: row.last_heartbeat_at,
        note:              row.note,
        activity:          row.activity,
        detail:            row.detail,
        presenceStatus,
      };
    }

    return result;
  } catch {
    return {};
  }
}
