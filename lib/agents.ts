/**
 * lib/agents.ts
 * SQLite-backed Agent CRUD + tool allowlist.
 * Uses the same logs/requests.db as conversations, logger, toolLogger.
 * Tables are created idempotently on first import.
 * Also runs idempotent migrations on existing tables (conversations, tool_calls).
 *
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs   from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResponseStyle = "brief" | "balanced" | "detailed";

export interface Agent {
  id:               string;
  name:             string;
  description:      string;
  system_prompt:    string;
  default_model:    string;
  department:       string;  // "" = unassigned; one of the DEPT_IDS otherwise
  allow_web:        boolean; // default true
  allow_files:      boolean; // default true
  ask_before_tools: boolean; // default false
  ask_before_web:   boolean; // default true — prompt per-tool when ask_before_tools=true
  ask_before_files: boolean; // default true — prompt per-tool when ask_before_tools=true
  response_style:   ResponseStyle; // default "balanced"
  // v8 — per-setting override flags (default false = inherit from department policy)
  override_allow_web:        boolean;
  override_allow_files:      boolean;
  override_ask_before_tools: boolean;
  override_ask_before_web:   boolean;
  override_ask_before_files: boolean;
  override_response_style:   boolean;
  created_at:       string;
  updated_at:       string;
  /** Owning user. "default" for legacy rows (shared/admin-created agents). */
  user_id:          string;
}

/**
 * Returned by getAgentTools().
 * action_ids = "*"      → all actions for this provider are allowed
 * action_ids = string[] → only those specific action IDs are allowed
 */
export interface AgentToolEntry {
  provider_id: string;
  action_ids:  "*" | string[];
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

    // ── Create tables ─────────────────────────────────────────────────────────
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        description   TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        default_model TEXT NOT NULL DEFAULT '',
        department    TEXT NOT NULL DEFAULT '',
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agent_tools (
        agent_id    TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        action_id   TEXT NOT NULL DEFAULT '*',
        created_at  TEXT NOT NULL,
        UNIQUE(agent_id, provider_id, action_id)
      );
    `);

    // ── Idempotent migrations on shared tables ────────────────────────────────
    // Add agent_id to conversations (no-op if column already exists)
    try {
      db.exec(`ALTER TABLE conversations ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — ignore
    }
    // Add agent_id to tool_calls
    try {
      db.exec(`ALTER TABLE tool_calls ADD COLUMN agent_id TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — ignore
    }
    // Add department to agents
    try {
      db.exec(`ALTER TABLE agents ADD COLUMN department TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Column already exists — ignore
    }
    // Add capability/style settings (v5 migrations)
    try { db.exec(`ALTER TABLE agents ADD COLUMN allow_web        INTEGER NOT NULL DEFAULT 1`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN allow_files      INTEGER NOT NULL DEFAULT 1`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN ask_before_tools INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN response_style   TEXT    NOT NULL DEFAULT 'balanced'`); } catch {}
    // Add per-tool consent flags (v6 migrations)
    try { db.exec(`ALTER TABLE agents ADD COLUMN ask_before_web   INTEGER NOT NULL DEFAULT 1`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN ask_before_files INTEGER NOT NULL DEFAULT 1`); } catch {}
    // Add per-setting override flags (v8 migrations)
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_allow_web        INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_allow_files      INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_ask_before_tools INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_ask_before_web   INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_ask_before_files INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`ALTER TABLE agents ADD COLUMN override_response_style   INTEGER NOT NULL DEFAULT 0`); } catch {}
    // Add user_id for multi-user support (v9 migration)
    try { db.exec(`ALTER TABLE agents ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default'`); } catch {}

    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── Row normaliser ───────────────────────────────────────────────────────────

/** SQLite stores booleans as 0/1 integers. Convert them to actual booleans. */
function normaliseAgent(raw: Record<string, unknown>): Agent {
  return {
    id:               raw.id               as string,
    name:             raw.name             as string,
    description:      raw.description      as string,
    system_prompt:    raw.system_prompt    as string,
    default_model:    raw.default_model    as string,
    department:       raw.department       as string,
    allow_web:        raw.allow_web        === 1 || raw.allow_web        === true,
    allow_files:      raw.allow_files      === 1 || raw.allow_files      === true,
    ask_before_tools: raw.ask_before_tools === 1 || raw.ask_before_tools === true,
    // Per-tool consent flags — default to true if column is missing (old row)
    ask_before_web:   raw.ask_before_web   === undefined ? true : (raw.ask_before_web   === 1 || raw.ask_before_web   === true),
    ask_before_files: raw.ask_before_files === undefined ? true : (raw.ask_before_files === 1 || raw.ask_before_files === true),
    response_style:   (raw.response_style as ResponseStyle | undefined) ?? "balanced",
    // v8 override flags — default false if column missing (old rows before v8)
    override_allow_web:        raw.override_allow_web        === 1 || raw.override_allow_web        === true,
    override_allow_files:      raw.override_allow_files      === 1 || raw.override_allow_files      === true,
    override_ask_before_tools: raw.override_ask_before_tools === 1 || raw.override_ask_before_tools === true,
    override_ask_before_web:   raw.override_ask_before_web   === 1 || raw.override_ask_before_web   === true,
    override_ask_before_files: raw.override_ask_before_files === 1 || raw.override_ask_before_files === true,
    override_response_style:   raw.override_response_style   === 1 || raw.override_response_style   === true,
    created_at:       raw.created_at       as string,
    updated_at:       raw.updated_at       as string,
    user_id:          (raw.user_id as string | undefined) ?? "default",
  };
}

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

/** Creates a new agent. Returns null if the DB is unavailable. */
export function createAgent(input: {
  name:                      string;
  description?:              string;
  system_prompt?:            string;
  default_model?:            string;
  department?:               string;
  allow_web?:                boolean;
  allow_files?:              boolean;
  ask_before_tools?:         boolean;
  ask_before_web?:           boolean;
  ask_before_files?:         boolean;
  response_style?:           ResponseStyle;
  override_allow_web?:       boolean;
  override_allow_files?:     boolean;
  override_ask_before_tools?: boolean;
  override_ask_before_web?:  boolean;
  override_ask_before_files?: boolean;
  override_response_style?:  boolean;
  /** Owning user. Defaults to 'default' (backward compatible). */
  user_id?:                  string;
}): Agent | null {
  if (!db) return null;
  const now   = new Date().toISOString();
  const agent: Agent = {
    id:               randomUUID(),
    name:             input.name.trim(),
    description:      (input.description   ?? "").trim(),
    system_prompt:    (input.system_prompt ?? "").trim(),
    default_model:    (input.default_model ?? "").trim(),
    department:       (input.department    ?? "").trim(),
    allow_web:        input.allow_web        ?? true,
    allow_files:      input.allow_files      ?? true,
    ask_before_tools: input.ask_before_tools ?? false,
    ask_before_web:   input.ask_before_web   ?? true,
    ask_before_files: input.ask_before_files ?? true,
    response_style:   input.response_style   ?? "balanced",
    override_allow_web:        input.override_allow_web        ?? false,
    override_allow_files:      input.override_allow_files      ?? false,
    override_ask_before_tools: input.override_ask_before_tools ?? false,
    override_ask_before_web:   input.override_ask_before_web   ?? false,
    override_ask_before_files: input.override_ask_before_files ?? false,
    override_response_style:   input.override_response_style   ?? false,
    created_at:       now,
    updated_at:       now,
    user_id:          input.user_id ?? "default",
  };
  try {
    db.prepare(
      `INSERT INTO agents
         (id, name, description, system_prompt, default_model, department,
          allow_web, allow_files, ask_before_tools, ask_before_web, ask_before_files,
          response_style,
          override_allow_web, override_allow_files, override_ask_before_tools,
          override_ask_before_web, override_ask_before_files, override_response_style,
          created_at, updated_at, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      agent.id, agent.name, agent.description,
      agent.system_prompt, agent.default_model, agent.department,
      agent.allow_web ? 1 : 0, agent.allow_files ? 1 : 0,
      agent.ask_before_tools ? 1 : 0,
      agent.ask_before_web ? 1 : 0, agent.ask_before_files ? 1 : 0,
      agent.response_style,
      agent.override_allow_web        ? 1 : 0,
      agent.override_allow_files      ? 1 : 0,
      agent.override_ask_before_tools ? 1 : 0,
      agent.override_ask_before_web   ? 1 : 0,
      agent.override_ask_before_files ? 1 : 0,
      agent.override_response_style   ? 1 : 0,
      agent.created_at, agent.updated_at,
      agent.user_id,
    );
    return agent;
  } catch {
    return null;
  }
}

/** Returns all agents ordered alphabetically. Returns [] if DB is unavailable. */
export function listAgents(): Agent[] {
  if (!db) return [];
  try {
    return (db.prepare("SELECT * FROM agents ORDER BY name ASC").all() as Record<string, unknown>[])
      .map(normaliseAgent);
  } catch {
    return [];
  }
}

/**
 * Returns agents owned by the given user plus legacy "default" agents, alphabetically.
 * Used by Mission Control for per-user isolation.
 */
export function listAgentsForUser(userId: string): Agent[] {
  if (!db) return [];
  try {
    return (
      db
        .prepare("SELECT * FROM agents WHERE user_id = ? OR user_id = 'default' ORDER BY name ASC")
        .all(userId) as Record<string, unknown>[]
    ).map(normaliseAgent);
  } catch {
    return [];
  }
}

/** Returns a single agent by ID, or null if not found or DB unavailable. */
export function getAgent(id: string): Agent | null {
  if (!db) return null;
  try {
    const raw = db.prepare("SELECT * FROM agents WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return raw ? normaliseAgent(raw) : null;
  } catch {
    return null;
  }
}

/** Updates an agent's mutable fields. Returns the updated agent, or null on failure. */
export function updateAgent(
  id:    string,
  patch: Partial<{
    name:                      string;
    description:               string;
    system_prompt:             string;
    default_model:             string;
    department:                string;
    allow_web:                 boolean;
    allow_files:               boolean;
    ask_before_tools:          boolean;
    ask_before_web:            boolean;
    ask_before_files:          boolean;
    response_style:            ResponseStyle;
    override_allow_web:        boolean;
    override_allow_files:      boolean;
    override_ask_before_tools: boolean;
    override_ask_before_web:   boolean;
    override_ask_before_files: boolean;
    override_response_style:   boolean;
  }>,
): Agent | null {
  if (!db) return null;
  const agent = getAgent(id);
  if (!agent) return null;

  const now     = new Date().toISOString();
  const updated = {
    name:                      (patch.name          ?? agent.name).trim(),
    description:               (patch.description   ?? agent.description).trim(),
    system_prompt:             (patch.system_prompt ?? agent.system_prompt).trim(),
    default_model:             (patch.default_model ?? agent.default_model).trim(),
    department:                (patch.department    ?? agent.department).trim(),
    allow_web:                 patch.allow_web        ?? agent.allow_web,
    allow_files:               patch.allow_files      ?? agent.allow_files,
    ask_before_tools:          patch.ask_before_tools ?? agent.ask_before_tools,
    ask_before_web:            patch.ask_before_web   ?? agent.ask_before_web,
    ask_before_files:          patch.ask_before_files ?? agent.ask_before_files,
    response_style:            patch.response_style   ?? agent.response_style,
    override_allow_web:        patch.override_allow_web        ?? agent.override_allow_web,
    override_allow_files:      patch.override_allow_files      ?? agent.override_allow_files,
    override_ask_before_tools: patch.override_ask_before_tools ?? agent.override_ask_before_tools,
    override_ask_before_web:   patch.override_ask_before_web   ?? agent.override_ask_before_web,
    override_ask_before_files: patch.override_ask_before_files ?? agent.override_ask_before_files,
    override_response_style:   patch.override_response_style   ?? agent.override_response_style,
  };

  try {
    db.prepare(
      `UPDATE agents
       SET name=?, description=?, system_prompt=?, default_model=?, department=?,
           allow_web=?, allow_files=?, ask_before_tools=?,
           ask_before_web=?, ask_before_files=?,
           response_style=?,
           override_allow_web=?, override_allow_files=?, override_ask_before_tools=?,
           override_ask_before_web=?, override_ask_before_files=?, override_response_style=?,
           updated_at=?
       WHERE id=?`
    ).run(
      updated.name, updated.description, updated.system_prompt,
      updated.default_model, updated.department,
      updated.allow_web ? 1 : 0, updated.allow_files ? 1 : 0,
      updated.ask_before_tools ? 1 : 0,
      updated.ask_before_web ? 1 : 0, updated.ask_before_files ? 1 : 0,
      updated.response_style,
      updated.override_allow_web        ? 1 : 0,
      updated.override_allow_files      ? 1 : 0,
      updated.override_ask_before_tools ? 1 : 0,
      updated.override_ask_before_web   ? 1 : 0,
      updated.override_ask_before_files ? 1 : 0,
      updated.override_response_style   ? 1 : 0,
      now, id,
    );
    return getAgent(id);
  } catch {
    return null;
  }
}

/** Returns all agents for a given department, ordered by name. */
export function listAgentsByDepartment(department: string): Agent[] {
  if (!db) return [];
  try {
    return (db
      .prepare("SELECT * FROM agents WHERE department = ? ORDER BY name ASC")
      .all(department) as Record<string, unknown>[]).map(normaliseAgent);
  } catch {
    return [];
  }
}

/** Returns a map of department → agent count for all departments. */
export function getAgentCountsByDepartment(): Record<string, number> {
  if (!db) return {};
  try {
    const rows = db
      .prepare("SELECT department, COUNT(*) as cnt FROM agents WHERE department != '' GROUP BY department")
      .all() as { department: string; cnt: number }[];
    const result: Record<string, number> = {};
    for (const row of rows) result[row.department] = row.cnt;
    return result;
  } catch {
    return {};
  }
}

/** Deletes an agent and its tool allowlist. No-op if not found. */
export function deleteAgent(id: string): void {
  if (!db) return;
  try {
    db.transaction(() => {
      db!.prepare("DELETE FROM agent_tools WHERE agent_id = ?").run(id);
      db!.prepare("DELETE FROM agents WHERE id = ?").run(id);
    })();
  } catch {
    // Non-fatal
  }
}

// ─── Tool allowlist ───────────────────────────────────────────────────────────

/**
 * Replaces the complete tool allowlist for an agent.
 *
 * Each rule specifies a (provider_id, action_id) pair.
 * action_id = '*' means all actions for that provider are allowed.
 *
 * Runs as a transaction (DELETE then INSERT). Never throws.
 */
export function setAgentTools(
  agentId: string,
  rules:   { provider_id: string; action_id: string }[],
): void {
  if (!db) return;
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      db!.prepare("DELETE FROM agent_tools WHERE agent_id = ?").run(agentId);
      const insert = db!.prepare(
        "INSERT OR IGNORE INTO agent_tools (agent_id, provider_id, action_id, created_at) VALUES (?, ?, ?, ?)"
      );
      for (const r of rules) {
        insert.run(agentId, r.provider_id, r.action_id, now);
      }
    })();
  } catch (err) {
    console.error("[agents] setAgentTools failed:", err);
  }
}

/**
 * Returns the tool allowlist for an agent, grouped by provider.
 * Returns [] if the agent has no tools configured or DB is unavailable.
 */
export function getAgentTools(agentId: string): AgentToolEntry[] {
  if (!db) return [];
  try {
    const rows = db
      .prepare("SELECT provider_id, action_id FROM agent_tools WHERE agent_id = ? ORDER BY provider_id, action_id")
      .all(agentId) as { provider_id: string; action_id: string }[];

    // Group by provider_id
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const existing = map.get(row.provider_id) ?? [];
      existing.push(row.action_id);
      map.set(row.provider_id, existing);
    }

    return Array.from(map.entries()).map(([provider_id, action_ids]) => {
      // If there's a '*' among the action_ids, treat the whole provider as wildcard
      if (action_ids.includes("*")) {
        return { provider_id, action_ids: "*" };
      }
      return { provider_id, action_ids };
    });
  } catch {
    return [];
  }
}

/**
 * Returns true if the given agent is allowed to call provider/action.
 *
 * - agentId = "" → always allow (admin / no-agent mode)
 * - DB unavailable → fail-open (allow)
 * - Agent not found → deny (unknown agent ID)
 * - No tools configured for agent → deny
 * - Match on (agent_id, provider_id, action_id='*') or (agent_id, provider_id, action_id=action) → allow
 */
export function isToolAllowed(
  agentId:    string,
  providerId: string,
  action:     string,
): boolean {
  if (!agentId) return true; // admin / no-agent mode
  if (!db)     return true;  // fail-open when DB unavailable

  try {
    const row = db
      .prepare(
        `SELECT 1 FROM agent_tools
         WHERE agent_id = ? AND provider_id = ? AND (action_id = '*' OR action_id = ?)
         LIMIT 1`,
      )
      .get(agentId, providerId, action);
    return row !== undefined;
  } catch {
    return true; // fail-open on unexpected DB errors
  }
}
