/**
 * lib/user-db.ts
 * Users table — SQLite persistence for multi-user auth.
 * Uses the same requests.db as lib/billing.ts and lib/instances.ts.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import fs from "fs";
import path from "path";

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
      CREATE TABLE IF NOT EXISTS users (
        id               TEXT PRIMARY KEY,
        email            TEXT UNIQUE NOT NULL,
        name             TEXT,
        password_hash    TEXT,
        google_id        TEXT UNIQUE,
        avatar_url       TEXT,
        plan             TEXT NOT NULL DEFAULT 'free',
        onboarding_done  INTEGER NOT NULL DEFAULT 0,
        agent_name       TEXT DEFAULT 'My Agent',
        use_case         TEXT,
        created_at       TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
    `);

    // Safe migrations — add columns that may be missing from older DBs
    const safeAlter = (sql: string) => {
      try { db.exec(sql); } catch { /* column already exists */ }
    };
    safeAlter(`ALTER TABLE users ADD COLUMN avatar_url TEXT`);
    safeAlter(`ALTER TABLE users ADD COLUMN agent_name TEXT DEFAULT 'My Agent'`);
    safeAlter(`ALTER TABLE users ADD COLUMN use_case TEXT`);

    return db;
  } catch (err) {
    console.error("[user-db] Failed to open DB:", err);
    return null;
  }
}

const db = tryOpenDB();

// ─── types ────────────────────────────────────────────────────────────────────

export interface User {
  id:              string;
  email:           string;
  name:            string | null;
  password_hash:   string | null;
  google_id:       string | null;
  avatar_url:      string | null;
  plan:            string;
  onboarding_done: number;
  agent_name:      string | null;
  use_case:        string | null;
  created_at:      string;
  updated_at:      string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export function createUser(data: {
  id:            string;
  email:         string;
  name:          string;
  passwordHash?: string;
  googleId?:     string;
  avatarUrl?:    string;
}): User {
  if (!db) throw new Error("[user-db] DB unavailable");
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, google_id, avatar_url)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    data.id,
    data.email,
    data.name,
    data.passwordHash ?? null,
    data.googleId     ?? null,
    data.avatarUrl    ?? null,
  );
  return getUserById(data.id)!;
}

export function getUserByEmail(email: string): User | null {
  if (!db) return null;
  return (db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as User | undefined) ?? null;
}

export function getUserById(userId: string): User | null {
  if (!db) return null;
  return (db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as User | undefined) ?? null;
}

export function getUserByGoogleId(googleId: string): User | null {
  if (!db) return null;
  return (db.prepare(`SELECT * FROM users WHERE google_id = ?`).get(googleId) as User | undefined) ?? null;
}

export function updateUser(
  userId: string,
  data: Partial<{
    name:           string;
    avatarUrl:      string;
    googleId:       string;
    plan:           string;
    onboardingDone: number;
    agentName:      string;
    useCase:        string;
    updatedAt:      string;
  }>
): User {
  if (!db) throw new Error("[user-db] DB unavailable");

  const fields: string[] = [];
  const values: unknown[] = [];

  if (data.name           !== undefined) { fields.push("name = ?");            values.push(data.name); }
  if (data.avatarUrl      !== undefined) { fields.push("avatar_url = ?");       values.push(data.avatarUrl); }
  if (data.googleId       !== undefined) { fields.push("google_id = ?");        values.push(data.googleId); }
  if (data.plan           !== undefined) { fields.push("plan = ?");             values.push(data.plan); }
  if (data.onboardingDone !== undefined) { fields.push("onboarding_done = ?");  values.push(data.onboardingDone); }
  if (data.agentName      !== undefined) { fields.push("agent_name = ?");       values.push(data.agentName); }
  if (data.useCase        !== undefined) { fields.push("use_case = ?");         values.push(data.useCase); }

  fields.push("updated_at = ?");
  values.push(data.updatedAt ?? new Date().toISOString());
  values.push(userId);

  db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getUserById(userId)!;
}

export function updateUserPassword(userId: string, passwordHash: string): void {
  if (!db) throw new Error("[user-db] DB unavailable");
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
    passwordHash,
    new Date().toISOString(),
    userId,
  );
}

export function userExists(email: string): boolean {
  if (!db) return false;
  const row = db.prepare(`SELECT 1 FROM users WHERE email = ?`).get(email);
  return row !== undefined;
}
