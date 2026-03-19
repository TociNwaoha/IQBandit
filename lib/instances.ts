/**
 * lib/instances.ts
 * SQLite-backed instance (container) persistence for IQBandit SaaS provisioning.
 * Uses the same requests.db as the rest of the app.
 * Tables are created on first import (idempotent).
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

// ─── types ────────────────────────────────────────────────────────────────────

export type InstanceTier   = "starter" | "pro";
export type InstanceStatus =
  | "provisioning"
  | "running"
  | "paused"
  | "cancelled"
  | "deleted"
  | "error";

export interface Instance {
  id: string;
  user_id: string;
  tier: InstanceTier;
  status: InstanceStatus;
  container_name: string | null;
  host_port: number | null;
  gateway_token: string | null;
  subdomain: string | null;
  openclaw_url: string | null;
  contabo_instance_id: string | null;
  ip_address: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// ─── db setup ─────────────────────────────────────────────────────────────────

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
      CREATE TABLE IF NOT EXISTS instances (
        id                  TEXT PRIMARY KEY,
        user_id             TEXT NOT NULL,
        tier                TEXT NOT NULL DEFAULT 'starter',
        status              TEXT NOT NULL DEFAULT 'provisioning',
        container_name      TEXT,
        host_port           INTEGER,
        gateway_token       TEXT,
        subdomain           TEXT,
        openclaw_url        TEXT,
        contabo_instance_id TEXT,
        ip_address          TEXT,
        cancelled_at        TEXT,
        created_at          TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_instances_user_id
        ON instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_instances_container_name
        ON instances(container_name);
    `);
    return db;
  } catch (err) {
    console.error("[instances] Failed to open DB:", err);
    return null;
  }
}

const db = tryOpenDB();

// ─── queries ──────────────────────────────────────────────────────────────────

/** Returns the active (non-deleted, non-cancelled) instance for a user, or null. */
export function getInstanceByUserId(userId: string): Instance | null {
  if (!db) return null;
  return (
    db
      .prepare(
        `SELECT * FROM instances
         WHERE user_id = ?
           AND status NOT IN ('deleted', 'cancelled')
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId) as Instance | undefined
  ) ?? null;
}

/** Returns any instance for a user regardless of status. */
export function getAnyInstanceByUserId(userId: string): Instance | null {
  if (!db) return null;
  return (
    db
      .prepare(
        `SELECT * FROM instances
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT 1`
      )
      .get(userId) as Instance | undefined
  ) ?? null;
}

/** Returns all host_ports that are currently in use (not deleted/cancelled). */
export function getPortsInUse(): number[] {
  if (!db) return [];
  const rows = db
    .prepare(
      `SELECT host_port FROM instances
       WHERE host_port IS NOT NULL
         AND status NOT IN ('deleted', 'cancelled')`
    )
    .all() as { host_port: number }[];
  return rows.map((r) => r.host_port);
}

/** Inserts a new instance row. Returns the created instance or null on failure. */
export function createInstance(
  data: Omit<Instance, "id" | "created_at" | "updated_at">
): Instance | null {
  if (!db) return null;
  const id = randomUUID();
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO instances
         (id, user_id, tier, status, container_name, host_port, gateway_token,
          subdomain, openclaw_url, contabo_instance_id, ip_address, cancelled_at,
          created_at, updated_at)
       VALUES
         (@id, @user_id, @tier, @status, @container_name, @host_port, @gateway_token,
          @subdomain, @openclaw_url, @contabo_instance_id, @ip_address, @cancelled_at,
          @created_at, @updated_at)`
    ).run({
      id,
      user_id:             data.user_id,
      tier:                data.tier,
      status:              data.status,
      container_name:      data.container_name ?? null,
      host_port:           data.host_port ?? null,
      gateway_token:       data.gateway_token ?? null,
      subdomain:           data.subdomain ?? null,
      openclaw_url:        data.openclaw_url ?? null,
      contabo_instance_id: data.contabo_instance_id ?? null,
      ip_address:          data.ip_address ?? null,
      cancelled_at:        data.cancelled_at ?? null,
      created_at:          now,
      updated_at:          now,
    });
    return db.prepare(`SELECT * FROM instances WHERE id = ?`).get(id) as Instance;
  } catch (err) {
    console.error("[instances] createInstance error:", err);
    return null;
  }
}

/** Updates the status (and optionally other fields) for an instance. */
export function updateInstance(
  id: string,
  fields: Partial<Omit<Instance, "id" | "created_at">>
): void {
  if (!db) return;
  const updates = Object.entries({ ...fields, updated_at: new Date().toISOString() })
    .map(([k]) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE instances SET ${updates} WHERE id = @id`).run({
    id,
    ...fields,
    updated_at: new Date().toISOString(),
  });
}
