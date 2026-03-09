/**
 * lib/departmentPolicies.ts
 * SQLite-backed department policy CRUD + per-agent effective-settings resolver.
 *
 * Department policies define default behaviour for all agents in that department.
 * Agents can optionally override individual settings via override_* flags.
 *
 * Locked defaults (trust-first):
 *   allow_web=true, allow_files=true, ask_before_tools=true,
 *   ask_before_web=true, ask_before_files=true, response_style="balanced"
 *
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs   from "fs";
import path from "path";
import { DEPARTMENTS }       from "./departments";
import type { ResponseStyle } from "./agents";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DepartmentPolicy {
  department_id:    string;
  allow_web:        boolean;
  allow_files:      boolean;
  ask_before_tools: boolean;
  ask_before_web:   boolean;
  ask_before_files: boolean;
  response_style:   ResponseStyle;
  updated_at:       string;
}

/**
 * Resolved settings that callers should use instead of reading agent fields directly.
 * `sources` tracks where each setting came from (department policy vs agent override).
 */
export interface EffectiveAgentSettings {
  allow_web:        boolean;
  allow_files:      boolean;
  ask_before_tools: boolean;
  ask_before_web:   boolean;
  ask_before_files: boolean;
  response_style:   ResponseStyle;
  /** "department" if no per-setting overrides are active, "agent_override" if any override is set. */
  policy_source:    "department" | "agent_override";
  sources: {
    allow_web:        "department" | "agent";
    allow_files:      "department" | "agent";
    ask_before_tools: "department" | "agent";
    ask_before_web:   "department" | "agent";
    ask_before_files: "department" | "agent";
    response_style:   "department" | "agent";
  };
}

/** Locked defaults — "trust-first, always ask". */
export const POLICY_DEFAULTS: Omit<DepartmentPolicy, "department_id" | "updated_at"> = {
  allow_web:        true,
  allow_files:      true,
  ask_before_tools: true,
  ask_before_web:   true,
  ask_before_files: true,
  response_style:   "balanced",
};

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
      CREATE TABLE IF NOT EXISTS department_policies (
        department_id    TEXT PRIMARY KEY,
        allow_web        INTEGER NOT NULL DEFAULT 1,
        allow_files      INTEGER NOT NULL DEFAULT 1,
        ask_before_tools INTEGER NOT NULL DEFAULT 1,
        ask_before_web   INTEGER NOT NULL DEFAULT 1,
        ask_before_files INTEGER NOT NULL DEFAULT 1,
        response_style   TEXT    NOT NULL DEFAULT 'balanced',
        updated_at       TEXT    NOT NULL
      );
    `);

    // Seed a default row for every known department (idempotent via INSERT OR IGNORE)
    const now    = new Date().toISOString();
    const upsert = db.prepare(`
      INSERT OR IGNORE INTO department_policies
        (department_id, allow_web, allow_files, ask_before_tools, ask_before_web, ask_before_files, response_style, updated_at)
      VALUES (?, 1, 1, 1, 1, 1, 'balanced', ?)
    `);
    for (const dept of DEPARTMENTS) {
      upsert.run(dept.id, now);
    }

    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── Row normaliser ───────────────────────────────────────────────────────────

function normalisePolicy(raw: Record<string, unknown>): DepartmentPolicy {
  return {
    department_id:    raw.department_id    as string,
    allow_web:        raw.allow_web        === 1 || raw.allow_web        === true,
    allow_files:      raw.allow_files      === 1 || raw.allow_files      === true,
    ask_before_tools: raw.ask_before_tools === 1 || raw.ask_before_tools === true,
    ask_before_web:   raw.ask_before_web   === 1 || raw.ask_before_web   === true,
    ask_before_files: raw.ask_before_files === 1 || raw.ask_before_files === true,
    response_style:   (raw.response_style  as ResponseStyle | undefined) ?? "balanced",
    updated_at:       raw.updated_at       as string,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

/**
 * Returns the policy for a department.
 * Auto-creates a default row if the department exists in DEPARTMENTS but has no row yet.
 * Returns null if DB is unavailable.
 */
export function getDepartmentPolicy(departmentId: string): DepartmentPolicy | null {
  if (!db) return null;
  try {
    const raw = db
      .prepare("SELECT * FROM department_policies WHERE department_id = ?")
      .get(departmentId) as Record<string, unknown> | undefined;
    if (raw) return normalisePolicy(raw);

    // Row missing — create default and return it
    const now = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO department_policies
        (department_id, allow_web, allow_files, ask_before_tools, ask_before_web, ask_before_files, response_style, updated_at)
      VALUES (?, 1, 1, 1, 1, 1, 'balanced', ?)
    `).run(departmentId, now);

    const created = db
      .prepare("SELECT * FROM department_policies WHERE department_id = ?")
      .get(departmentId) as Record<string, unknown> | undefined;
    return created ? normalisePolicy(created) : null;
  } catch {
    return null;
  }
}

/** Returns policies for all known departments (seeding missing rows). */
export function listDepartmentPolicies(): DepartmentPolicy[] {
  if (!db) return [];
  try {
    const now    = new Date().toISOString();
    const upsert = db.prepare(`
      INSERT OR IGNORE INTO department_policies
        (department_id, allow_web, allow_files, ask_before_tools, ask_before_web, ask_before_files, response_style, updated_at)
      VALUES (?, 1, 1, 1, 1, 1, 'balanced', ?)
    `);
    for (const dept of DEPARTMENTS) upsert.run(dept.id, now);

    return (
      db.prepare("SELECT * FROM department_policies").all() as Record<string, unknown>[]
    ).map(normalisePolicy);
  } catch {
    return [];
  }
}

/** Creates or updates a department policy. Returns the updated policy or null on failure. */
export function upsertDepartmentPolicy(
  departmentId: string,
  patch: Partial<Omit<DepartmentPolicy, "department_id" | "updated_at">>,
): DepartmentPolicy | null {
  if (!db) return null;
  const existing = getDepartmentPolicy(departmentId);
  const base     = existing ?? { ...POLICY_DEFAULTS };

  const updated = {
    allow_web:        patch.allow_web        ?? base.allow_web,
    allow_files:      patch.allow_files      ?? base.allow_files,
    ask_before_tools: patch.ask_before_tools ?? base.ask_before_tools,
    ask_before_web:   patch.ask_before_web   ?? base.ask_before_web,
    ask_before_files: patch.ask_before_files ?? base.ask_before_files,
    response_style:   patch.response_style   ?? base.response_style,
  };

  try {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO department_policies
        (department_id, allow_web, allow_files, ask_before_tools, ask_before_web, ask_before_files, response_style, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(department_id) DO UPDATE SET
        allow_web        = excluded.allow_web,
        allow_files      = excluded.allow_files,
        ask_before_tools = excluded.ask_before_tools,
        ask_before_web   = excluded.ask_before_web,
        ask_before_files = excluded.ask_before_files,
        response_style   = excluded.response_style,
        updated_at       = excluded.updated_at
    `).run(
      departmentId,
      updated.allow_web        ? 1 : 0,
      updated.allow_files      ? 1 : 0,
      updated.ask_before_tools ? 1 : 0,
      updated.ask_before_web   ? 1 : 0,
      updated.ask_before_files ? 1 : 0,
      updated.response_style,
      now,
    );
    return getDepartmentPolicy(departmentId);
  } catch {
    return null;
  }
}

/** Resets a department policy to the locked defaults. */
export function resetDepartmentPolicy(departmentId: string): DepartmentPolicy | null {
  return upsertDepartmentPolicy(departmentId, POLICY_DEFAULTS);
}

// ─── Policy resolver ──────────────────────────────────────────────────────────

type AgentSettingsInput = {
  allow_web:                boolean;
  allow_files:              boolean;
  ask_before_tools:         boolean;
  ask_before_web:           boolean;
  ask_before_files:         boolean;
  response_style:           ResponseStyle;
  override_allow_web:       boolean;
  override_allow_files:     boolean;
  override_ask_before_tools: boolean;
  override_ask_before_web:  boolean;
  override_ask_before_files: boolean;
  override_response_style:  boolean;
};

/**
 * Resolves effective settings for an agent given its department's policy.
 *
 * Rules:
 *  - If override_X is true → use agent.X
 *  - Else                  → use departmentPolicy.X
 *  - If policy is null (no dept / DB unavailable) → agent settings used as-is
 */
export function resolveEffectiveAgentSettings(
  agent:  AgentSettingsInput,
  policy: DepartmentPolicy | null,
): EffectiveAgentSettings {
  const srcOf = (flag: boolean): "department" | "agent" => flag ? "agent" : "department";

  if (!policy) {
    // No department assigned or DB unavailable — use agent settings directly
    return {
      allow_web:        agent.allow_web,
      allow_files:      agent.allow_files,
      ask_before_tools: agent.ask_before_tools,
      ask_before_web:   agent.ask_before_web,
      ask_before_files: agent.ask_before_files,
      response_style:   agent.response_style,
      policy_source:    "agent_override",
      sources: {
        allow_web:        "agent",
        allow_files:      "agent",
        ask_before_tools: "agent",
        ask_before_web:   "agent",
        ask_before_files: "agent",
        response_style:   "agent",
      },
    };
  }

  const hasAnyOverride =
    agent.override_allow_web        ||
    agent.override_allow_files      ||
    agent.override_ask_before_tools ||
    agent.override_ask_before_web   ||
    agent.override_ask_before_files ||
    agent.override_response_style;

  return {
    allow_web:        agent.override_allow_web        ? agent.allow_web        : policy.allow_web,
    allow_files:      agent.override_allow_files      ? agent.allow_files      : policy.allow_files,
    ask_before_tools: agent.override_ask_before_tools ? agent.ask_before_tools : policy.ask_before_tools,
    ask_before_web:   agent.override_ask_before_web   ? agent.ask_before_web   : policy.ask_before_web,
    ask_before_files: agent.override_ask_before_files ? agent.ask_before_files : policy.ask_before_files,
    response_style:   agent.override_response_style   ? agent.response_style   : policy.response_style,
    policy_source:    hasAnyOverride ? "agent_override" : "department",
    sources: {
      allow_web:        srcOf(agent.override_allow_web),
      allow_files:      srcOf(agent.override_allow_files),
      ask_before_tools: srcOf(agent.override_ask_before_tools),
      ask_before_web:   srcOf(agent.override_ask_before_web),
      ask_before_files: srcOf(agent.override_ask_before_files),
      response_style:   srcOf(agent.override_response_style),
    },
  };
}
