/**
 * lib/approvals.ts
 * Approval system — tables, policy evaluation, and CRUD.
 * Uses the same logs/requests.db as all other modules.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs   from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "denied" | "expired";

export interface Approval {
  id:            string;
  user_id:       string;
  created_at:    string;
  updated_at:    string;
  status:        ApprovalStatus;
  reason:        string;
  policy_key:    string;
  provider_id:   string;
  action:        string;
  input_json:    string;  // sanitized JSON string
  metadata_json: string;  // e.g. { estimated_cost, estimated_volume }
  expires_at:    string;  // ISO-8601 or empty string
}

export interface ApprovalPolicy {
  id:                 string;
  user_id:            string;
  created_at:         string;
  updated_at:         string;
  name:               string;
  enabled:            boolean;
  match_provider_id:  string;  // "*" = wildcard
  match_action:       string;  // "*" = wildcard
  threshold_type:     string;  // "count" | "estimated_cost" | ""
  threshold_value:    number;
  require_approval:   boolean;
  notes:              string;
}

export interface AgentApprovalPolicy {
  agent_id:  string;
  policy_id: string;
  user_id:   string;
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
      CREATE TABLE IF NOT EXISTS approvals (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        updated_at    TEXT NOT NULL,
        status        TEXT NOT NULL,
        reason        TEXT NOT NULL DEFAULT '',
        policy_key    TEXT NOT NULL,
        provider_id   TEXT NOT NULL,
        action        TEXT NOT NULL,
        input_json    TEXT NOT NULL DEFAULT '{}',
        metadata_json TEXT NOT NULL DEFAULT '{}',
        expires_at    TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_approvals_user ON approvals(user_id, status);

      CREATE TABLE IF NOT EXISTS approval_policies (
        id                TEXT PRIMARY KEY,
        user_id           TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL,
        name              TEXT NOT NULL,
        enabled           INTEGER NOT NULL DEFAULT 1,
        match_provider_id TEXT NOT NULL DEFAULT '*',
        match_action      TEXT NOT NULL DEFAULT '*',
        threshold_type    TEXT NOT NULL DEFAULT '',
        threshold_value   INTEGER NOT NULL DEFAULT 0,
        require_approval  INTEGER NOT NULL DEFAULT 1,
        notes             TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_ap_user ON approval_policies(user_id);

      CREATE TABLE IF NOT EXISTS agent_approval_policies (
        agent_id  TEXT NOT NULL,
        policy_id TEXT NOT NULL,
        user_id   TEXT NOT NULL,
        UNIQUE(user_id, agent_id, policy_id)
      );

      CREATE TABLE IF NOT EXISTS mission_tasks (
        id              TEXT PRIMARY KEY,
        user_id         TEXT NOT NULL,
        title           TEXT NOT NULL,
        description     TEXT NOT NULL DEFAULT '',
        status          TEXT NOT NULL DEFAULT 'backlog',
        priority        TEXT NOT NULL DEFAULT 'med',
        agent_id        TEXT NOT NULL DEFAULT '',
        conversation_id TEXT NOT NULL DEFAULT '',
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_mt_user ON mission_tasks(user_id, status);
    `);

    return db;
  } catch {
    return null;
  }
}

const db: BetterSQLiteDB | null = tryOpenDB();

// ─── Input sanitizer ──────────────────────────────────────────────────────────

const SENSITIVE_KEY_PATTERN = /token|secret|key|password|credential|auth/i;

/**
 * Sanitizes an input object for storage in approvals.input_json:
 * - Removes fields whose keys match sensitive patterns
 * - Truncates string values longer than 500 chars
 */
function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    if (typeof v === "string" && v.length > 500) {
      out[k] = v.slice(0, 500) + "…";
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Row normalisers ──────────────────────────────────────────────────────────

function normaliseApproval(raw: Record<string, unknown>): Approval {
  return {
    id:            raw.id            as string,
    user_id:       raw.user_id       as string,
    created_at:    raw.created_at    as string,
    updated_at:    raw.updated_at    as string,
    status:        raw.status        as ApprovalStatus,
    reason:        (raw.reason        as string) ?? "",
    policy_key:    raw.policy_key    as string,
    provider_id:   raw.provider_id   as string,
    action:        raw.action        as string,
    input_json:    (raw.input_json    as string) ?? "{}",
    metadata_json: (raw.metadata_json as string) ?? "{}",
    expires_at:    (raw.expires_at    as string) ?? "",
  };
}

function normalisePolicy(raw: Record<string, unknown>): ApprovalPolicy {
  return {
    id:                raw.id                as string,
    user_id:           raw.user_id           as string,
    created_at:        raw.created_at        as string,
    updated_at:        raw.updated_at        as string,
    name:              raw.name              as string,
    enabled:           raw.enabled === 1 || raw.enabled === true,
    match_provider_id: (raw.match_provider_id as string) ?? "*",
    match_action:      (raw.match_action      as string) ?? "*",
    threshold_type:    (raw.threshold_type    as string) ?? "",
    threshold_value:   (raw.threshold_value   as number) ?? 0,
    require_approval:  raw.require_approval === 1 || raw.require_approval === true,
    notes:             (raw.notes             as string) ?? "",
  };
}

// ─── Approval Policies ────────────────────────────────────────────────────────

/** Returns all enabled policies for a user, ordered by creation time. */
export function listApprovalPolicies(userId: string): ApprovalPolicy[] {
  if (!db) return [];
  try {
    return (
      db
        .prepare("SELECT * FROM approval_policies WHERE user_id = ? ORDER BY created_at ASC")
        .all(userId) as Record<string, unknown>[]
    ).map(normalisePolicy);
  } catch {
    return [];
  }
}

/** Creates or updates an approval policy. Uses id from input if provided, otherwise generates one. */
export function upsertApprovalPolicy(
  userId: string,
  policy: Omit<ApprovalPolicy, "id" | "user_id" | "created_at" | "updated_at"> & { id?: string }
): ApprovalPolicy | null {
  if (!db) return null;
  const now = new Date().toISOString();
  const id  = policy.id ?? randomUUID();

  try {
    const existing = db.prepare("SELECT id FROM approval_policies WHERE id = ?").get(id);
    if (existing) {
      db.prepare(`
        UPDATE approval_policies SET
          updated_at = ?, name = ?, enabled = ?, match_provider_id = ?,
          match_action = ?, threshold_type = ?, threshold_value = ?,
          require_approval = ?, notes = ?
        WHERE id = ? AND user_id = ?
      `).run(
        now, policy.name, policy.enabled ? 1 : 0,
        policy.match_provider_id, policy.match_action,
        policy.threshold_type, policy.threshold_value,
        policy.require_approval ? 1 : 0, policy.notes,
        id, userId,
      );
    } else {
      db.prepare(`
        INSERT INTO approval_policies
          (id, user_id, created_at, updated_at, name, enabled, match_provider_id,
           match_action, threshold_type, threshold_value, require_approval, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, userId, now, now, policy.name, policy.enabled ? 1 : 0,
        policy.match_provider_id, policy.match_action,
        policy.threshold_type, policy.threshold_value,
        policy.require_approval ? 1 : 0, policy.notes,
      );
    }
    const row = db.prepare("SELECT * FROM approval_policies WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    return row ? normalisePolicy(row) : null;
  } catch (err) {
    console.error("[approvals] upsertApprovalPolicy failed:", err);
    return null;
  }
}

/** Deletes a policy by id (must belong to userId). */
export function deleteApprovalPolicy(id: string, userId: string): boolean {
  if (!db) return false;
  try {
    const info = db.prepare("DELETE FROM approval_policies WHERE id = ? AND user_id = ?").run(id, userId);
    return info.changes > 0;
  } catch {
    return false;
  }
}

// ─── Policy evaluation ────────────────────────────────────────────────────────

function matchesWildcard(pattern: string, value: string): boolean {
  return pattern === "*" || pattern === value;
}

export interface EvaluateResult {
  required:   boolean;
  policy_key: string;
  metadata:   Record<string, unknown>;
}

/**
 * Evaluates whether an approval is required for the given tool call.
 * Iterates the user's enabled policies; returns the first matching policy.
 * If no policy matches, returns { required: false }.
 */
export function evaluateApprovalRequirement(opts: {
  userId:      string;
  agentId:     string;
  provider_id: string;
  action:      string;
  input:       Record<string, unknown>;
}): EvaluateResult {
  if (!db) return { required: false, policy_key: "", metadata: {} };

  try {
    const policies = (
      db
        .prepare("SELECT * FROM approval_policies WHERE user_id = ? AND enabled = 1 ORDER BY created_at ASC")
        .all(opts.userId) as Record<string, unknown>[]
    ).map(normalisePolicy);

    for (const policy of policies) {
      if (!matchesWildcard(policy.match_provider_id, opts.provider_id)) continue;
      if (!matchesWildcard(policy.match_action, opts.action)) continue;

      if (!policy.require_approval) continue;

      // Threshold check: if threshold_type is "count", check input count field
      if (policy.threshold_type === "count" && policy.threshold_value > 0) {
        const inputCount = (opts.input.count as number | undefined) ?? 0;
        if (typeof inputCount === "number" && inputCount <= policy.threshold_value) continue;
      }

      const metadata: Record<string, unknown> = {
        policy_name: policy.name,
        match_provider_id: policy.match_provider_id,
        match_action: policy.match_action,
      };
      if (policy.threshold_type) {
        metadata.threshold_type  = policy.threshold_type;
        metadata.threshold_value = policy.threshold_value;
      }

      return {
        required:   true,
        policy_key: policy.id,
        metadata,
      };
    }
  } catch (err) {
    console.error("[approvals] evaluateApprovalRequirement failed:", err);
  }

  return { required: false, policy_key: "", metadata: {} };
}

// ─── Approval CRUD ────────────────────────────────────────────────────────────

/** Creates a new pending approval request. Sanitizes input before storage. */
export function createApprovalRequest(opts: {
  userId:      string;
  policy_key:  string;
  provider_id: string;
  action:      string;
  input:       Record<string, unknown>;
  metadata:    Record<string, unknown>;
  expires_at?: string;
}): Approval | null {
  if (!db) return null;
  const now = new Date().toISOString();
  const approval: Approval = {
    id:            randomUUID(),
    user_id:       opts.userId,
    created_at:    now,
    updated_at:    now,
    status:        "pending",
    reason:        "",
    policy_key:    opts.policy_key,
    provider_id:   opts.provider_id,
    action:        opts.action,
    input_json:    JSON.stringify(sanitizeInput(opts.input)),
    metadata_json: JSON.stringify(opts.metadata),
    expires_at:    opts.expires_at ?? "",
  };

  try {
    db.prepare(`
      INSERT INTO approvals
        (id, user_id, created_at, updated_at, status, reason, policy_key,
         provider_id, action, input_json, metadata_json, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      approval.id, approval.user_id, approval.created_at, approval.updated_at,
      approval.status, approval.reason, approval.policy_key,
      approval.provider_id, approval.action,
      approval.input_json, approval.metadata_json, approval.expires_at,
    );
    return approval;
  } catch (err) {
    console.error("[approvals] createApprovalRequest failed:", err);
    return null;
  }
}

/** Returns an approval by id, only if it belongs to userId. */
export function getApprovalById(id: string, userId: string): Approval | null {
  if (!db) return null;
  try {
    const row = db
      .prepare("SELECT * FROM approvals WHERE id = ? AND user_id = ?")
      .get(id, userId) as Record<string, unknown> | undefined;
    return row ? normaliseApproval(row) : null;
  } catch {
    return null;
  }
}

/** Lists approvals for a user with optional filters. */
export function listApprovals(
  userId: string,
  filters: { status?: ApprovalStatus; provider_id?: string; action?: string } = {},
  limit = 100,
): Approval[] {
  if (!db) return [];
  const conds:  string[]  = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (filters.status) {
    conds.push("status = ?");
    params.push(filters.status);
  }
  if (filters.provider_id) {
    conds.push("provider_id = ?");
    params.push(filters.provider_id);
  }
  if (filters.action) {
    conds.push("action = ?");
    params.push(filters.action);
  }

  try {
    return (
      db
        .prepare(`SELECT * FROM approvals WHERE ${conds.join(" AND ")} ORDER BY created_at DESC LIMIT ?`)
        .all(...params, limit) as Record<string, unknown>[]
    ).map(normaliseApproval);
  } catch {
    return [];
  }
}

/**
 * Sets the status of an approval to "approved" or "denied" and records the reason.
 * Only the owning user can decide.
 * Returns the updated approval, or null on failure.
 */
export function decideApproval(
  id:       string,
  userId:   string,
  decision: "approved" | "denied",
  reason:   string,
): Approval | null {
  if (!db) return null;
  const now = new Date().toISOString();
  try {
    const info = db.prepare(`
      UPDATE approvals SET status = ?, reason = ?, updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'pending'
    `).run(decision, reason.trim().slice(0, 1000), now, id, userId);

    if (info.changes === 0) return null;
    return getApprovalById(id, userId);
  } catch (err) {
    console.error("[approvals] decideApproval failed:", err);
    return null;
  }
}

/** Updates the metadata_json of an approval (e.g. to record execution outcome). */
export function updateApprovalMetadata(id: string, userId: string, metadata: Record<string, unknown>): void {
  if (!db) return;
  try {
    db.prepare("UPDATE approvals SET metadata_json = ?, updated_at = ? WHERE id = ? AND user_id = ?")
      .run(JSON.stringify(metadata), new Date().toISOString(), id, userId);
  } catch (err) {
    console.error("[approvals] updateApprovalMetadata failed:", err);
  }
}

// ─── Mission Tasks ────────────────────────────────────────────────────────────

export type TaskStatus   = "backlog" | "planned" | "in_progress" | "blocked" | "done";
export type TaskPriority = "low" | "med" | "high";

export interface MissionTask {
  id:              string;
  user_id:         string;
  title:           string;
  description:     string;
  status:          TaskStatus;
  priority:        TaskPriority;
  agent_id:        string;
  conversation_id: string;
  created_at:      string;
  updated_at:      string;
}

function normaliseTask(raw: Record<string, unknown>): MissionTask {
  return {
    id:              raw.id              as string,
    user_id:         raw.user_id         as string,
    title:           raw.title           as string,
    description:     (raw.description     as string) ?? "",
    status:          (raw.status          as TaskStatus) ?? "backlog",
    priority:        (raw.priority        as TaskPriority) ?? "med",
    agent_id:        (raw.agent_id        as string) ?? "",
    conversation_id: (raw.conversation_id as string) ?? "",
    created_at:      raw.created_at      as string,
    updated_at:      raw.updated_at      as string,
  };
}

/** Creates a new task. */
export function createTask(
  userId: string,
  input: {
    title:           string;
    description?:    string;
    status?:         TaskStatus;
    priority?:       TaskPriority;
    agent_id?:       string;
    conversation_id?: string;
  }
): MissionTask | null {
  if (!db) return null;
  const now = new Date().toISOString();
  const task: MissionTask = {
    id:              randomUUID(),
    user_id:         userId,
    title:           input.title.trim().slice(0, 200),
    description:     (input.description ?? "").trim().slice(0, 2000),
    status:          input.status   ?? "backlog",
    priority:        input.priority ?? "med",
    agent_id:        input.agent_id        ?? "",
    conversation_id: input.conversation_id ?? "",
    created_at:      now,
    updated_at:      now,
  };
  try {
    db.prepare(`
      INSERT INTO mission_tasks
        (id, user_id, title, description, status, priority, agent_id, conversation_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.user_id, task.title, task.description, task.status, task.priority,
      task.agent_id, task.conversation_id, task.created_at, task.updated_at,
    );
    return task;
  } catch (err) {
    console.error("[approvals] createTask failed:", err);
    return null;
  }
}

/** Lists tasks for a user, optionally filtered by status. */
export function listTasks(userId: string, status?: TaskStatus): MissionTask[] {
  if (!db) return [];
  try {
    if (status) {
      return (
        db
          .prepare("SELECT * FROM mission_tasks WHERE user_id = ? AND status = ? ORDER BY updated_at DESC")
          .all(userId, status) as Record<string, unknown>[]
      ).map(normaliseTask);
    }
    return (
      db
        .prepare("SELECT * FROM mission_tasks WHERE user_id = ? ORDER BY updated_at DESC")
        .all(userId) as Record<string, unknown>[]
    ).map(normaliseTask);
  } catch {
    return [];
  }
}

/** Updates task fields. Returns updated task or null. */
export function updateTask(
  id:     string,
  userId: string,
  patch:  Partial<Pick<MissionTask, "title" | "description" | "status" | "priority" | "agent_id" | "conversation_id">>,
): MissionTask | null {
  if (!db) return null;
  const now = new Date().toISOString();
  try {
    const row = db.prepare("SELECT * FROM mission_tasks WHERE id = ? AND user_id = ?").get(id, userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    const current = normaliseTask(row);
    const updated: MissionTask = {
      ...current,
      title:           (patch.title           ?? current.title).trim().slice(0, 200),
      description:     (patch.description     ?? current.description).trim().slice(0, 2000),
      status:          patch.status   ?? current.status,
      priority:        patch.priority ?? current.priority,
      agent_id:        patch.agent_id        ?? current.agent_id,
      conversation_id: patch.conversation_id ?? current.conversation_id,
      updated_at:      now,
    };
    db.prepare(`
      UPDATE mission_tasks SET
        title = ?, description = ?, status = ?, priority = ?,
        agent_id = ?, conversation_id = ?, updated_at = ?
      WHERE id = ? AND user_id = ?
    `).run(
      updated.title, updated.description, updated.status, updated.priority,
      updated.agent_id, updated.conversation_id, updated.updated_at,
      id, userId,
    );
    return updated;
  } catch (err) {
    console.error("[approvals] updateTask failed:", err);
    return null;
  }
}

/** Deletes a task. Returns true if deleted. */
export function deleteTask(id: string, userId: string): boolean {
  if (!db) return false;
  try {
    const info = db.prepare("DELETE FROM mission_tasks WHERE id = ? AND user_id = ?").run(id, userId);
    return info.changes > 0;
  } catch {
    return false;
  }
}
