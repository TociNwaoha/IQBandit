/**
 * lib/connections.ts
 * CRUD for social media credentials stored in the user_connections table.
 * All credential fields are AES-256-CBC encrypted before storage.
 *
 * Tables created here:
 *   - user_connections  (Twitter/social media API keys)
 *   - notifications     (fallback notification queue)
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 */

import fs from "fs";
import path from "path";
import { encrypt, decrypt } from "@/lib/crypto";

// ─── types ────────────────────────────────────────────────────────────────────

export interface TwitterCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessSecret: string;
}

interface RawConnection {
  id: number;
  user_id: string;
  platform: string;
  api_key_enc: string;
  api_secret_enc: string;
  access_token_enc: string;
  access_secret_enc: string;
  account_handle: string | null;
  account_name: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS user_connections (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id         TEXT NOT NULL,
        platform        TEXT NOT NULL,
        api_key_enc     TEXT NOT NULL,
        api_secret_enc  TEXT NOT NULL,
        access_token_enc  TEXT NOT NULL,
        access_secret_enc TEXT NOT NULL,
        account_handle  TEXT,
        account_name    TEXT,
        status          TEXT NOT NULL DEFAULT 'active',
        created_at      TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (user_id, platform)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_connections_user
        ON user_connections (user_id, platform)
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    TEXT NOT NULL,
        type       TEXT NOT NULL,
        payload    TEXT NOT NULL,
        read       INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    return db;
  } catch (err) {
    console.warn(
      "[connections] DB unavailable — connection storage disabled.",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

const connectionsDb: BetterSQLiteDB | null = tryOpenDB();

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Saves (upserts) a social platform connection for a user.
 * Encrypts all credential fields before storing.
 * Throws if DB unavailable or encryption fails.
 */
export function saveConnection(
  userId: string,
  platform: string,
  credentials: TwitterCredentials,
  handle: string,
  name: string
): void {
  if (!connectionsDb) throw new Error("[connections] DB unavailable");

  const now = new Date().toISOString();
  const existing = connectionsDb
    .prepare(`SELECT id, created_at FROM user_connections WHERE user_id = ? AND platform = ?`)
    .get(userId, platform) as { id: number; created_at: string } | undefined;

  const createdAt = existing?.created_at ?? now;

  connectionsDb
    .prepare(`
      INSERT INTO user_connections
        (user_id, platform, api_key_enc, api_secret_enc,
         access_token_enc, access_secret_enc, account_handle, account_name,
         status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
      ON CONFLICT(user_id, platform) DO UPDATE SET
        api_key_enc       = excluded.api_key_enc,
        api_secret_enc    = excluded.api_secret_enc,
        access_token_enc  = excluded.access_token_enc,
        access_secret_enc = excluded.access_secret_enc,
        account_handle    = excluded.account_handle,
        account_name      = excluded.account_name,
        status            = 'active',
        updated_at        = excluded.updated_at
    `)
    .run(
      userId,
      platform,
      encrypt(credentials.apiKey),
      encrypt(credentials.apiSecret),
      encrypt(credentials.accessToken),
      encrypt(credentials.accessSecret),
      handle,
      name,
      createdAt,
      now
    );

  console.log(`[connections] Saved ${platform} connection for user ${userId}`);
}

/**
 * Returns decrypted credentials for the given user + platform.
 * Returns null if not connected or on any error.
 * SERVER-SIDE ONLY — never pass result to client.
 */
export function getConnection(
  userId: string,
  platform: string
): TwitterCredentials | null {
  if (!connectionsDb) return null;
  try {
    const row = connectionsDb
      .prepare(`
        SELECT api_key_enc, api_secret_enc, access_token_enc, access_secret_enc
        FROM user_connections
        WHERE user_id = ? AND platform = ? AND status = 'active'
      `)
      .get(userId, platform) as Pick<
        RawConnection,
        "api_key_enc" | "api_secret_enc" | "access_token_enc" | "access_secret_enc"
      > | undefined;

    if (!row) return null;

    return {
      apiKey:       decrypt(row.api_key_enc),
      apiSecret:    decrypt(row.api_secret_enc),
      accessToken:  decrypt(row.access_token_enc),
      accessSecret: decrypt(row.access_secret_enc),
    };
  } catch (err) {
    console.error("[connections] getConnection error:", err);
    return null;
  }
}

/**
 * Removes the connection for the given user + platform.
 * No-op if the connection doesn't exist.
 * Throws if DB unavailable.
 */
export function deleteConnection(userId: string, platform: string): void {
  if (!connectionsDb) throw new Error("[connections] DB unavailable");
  connectionsDb
    .prepare(`DELETE FROM user_connections WHERE user_id = ? AND platform = ?`)
    .run(userId, platform);
  console.log(`[connections] Deleted ${platform} connection for user ${userId}`);
}

/**
 * Returns the connection status without exposing credentials.
 */
export function getConnectionStatus(
  userId: string,
  platform: string
): { connected: boolean; handle?: string; name?: string } {
  if (!connectionsDb) return { connected: false };
  try {
    const row = connectionsDb
      .prepare(`
        SELECT account_handle, account_name
        FROM user_connections
        WHERE user_id = ? AND platform = ? AND status = 'active'
      `)
      .get(userId, platform) as Pick<RawConnection, "account_handle" | "account_name"> | undefined;

    if (!row) return { connected: false };
    return {
      connected: true,
      handle:    row.account_handle ?? undefined,
      name:      row.account_name ?? undefined,
    };
  } catch {
    return { connected: false };
  }
}
