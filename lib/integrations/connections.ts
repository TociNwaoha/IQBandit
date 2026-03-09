/**
 * lib/integrations/connections.ts
 * Read/write layer for the `tool_connections` table in logs/requests.db.
 * Handles token encryption/decryption and masks secrets before returning data.
 *
 * SERVER-SIDE ONLY — never import in "use client" files.
 *
 * Design notes:
 * - Opens a dedicated DB connection (same WAL file as logger/analytics).
 * - All exported functions return ProviderConnection (no raw tokens in public API).
 * - Tokens are always encrypted with lib/integrations/crypto.ts before storage.
 * - Validation: provider_id checked against registry; auth_type checked against
 *   provider.authTypes; status checked against VALID_STATUSES.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getProvider } from "@/lib/integrations/providerRegistry";
import { encryptSecret, decryptSecret } from "@/lib/integrations/crypto";

// ─── types ────────────────────────────────────────────────────────────────────

export type ConnectionStatus = "connected" | "expired" | "error" | "disconnected";

const VALID_STATUSES: ConnectionStatus[] = [
  "connected",
  "expired",
  "error",
  "disconnected",
];

/** All fields stored in the DB row (never returned directly to callers). */
interface RawConnection {
  id: string;
  user_id: string;
  provider_id: string;
  status: string;
  account_label: string;
  auth_type: string;
  scopes_json: string;
  access_token_enc: string;
  refresh_token_enc: string;
  expires_at: string;
  metadata_json: string;
  created_at: string;
  updated_at: string;
}

/**
 * Public connection shape returned by all exported functions.
 * Never contains raw or encrypted tokens.
 */
export interface ProviderConnection {
  id: string;
  user_id: string;
  provider_id: string;
  status: ConnectionStatus;
  account_label: string;
  auth_type: string;
  /** Parsed scopes array from scopes_json. */
  scopes: string[];
  /** True when an access token is stored (encrypted). */
  has_access_token: boolean;
  /** True when a refresh token is stored (encrypted). */
  has_refresh_token: boolean;
  expires_at: string;
  /** Parsed metadata object from metadata_json. */
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Input for creating or updating a connection. */
export interface UpsertConnectionInput {
  provider_id: string;
  /** Must be one of the provider's authTypes. Defaults to provider's preferredAuthType. */
  auth_type?: string;
  /** Plaintext access token — encrypted before storage. */
  access_token?: string;
  /** Plaintext refresh token — encrypted before storage. */
  refresh_token?: string;
  account_label?: string;
  scopes?: string[];
  /** ISO-8601 datetime when the access token expires, if applicable. */
  expires_at?: string;
  metadata?: Record<string, unknown>;
  /** Defaults to "connected". */
  status?: ConnectionStatus;
}

// ─── DB setup ─────────────────────────────────────────────────────────────────

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenConnectionsDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");

    db.exec(`
      CREATE TABLE IF NOT EXISTS tool_connections (
        id               TEXT NOT NULL,
        user_id          TEXT NOT NULL,
        provider_id      TEXT NOT NULL,
        status           TEXT NOT NULL,
        account_label    TEXT NOT NULL DEFAULT '',
        auth_type        TEXT NOT NULL DEFAULT '',
        scopes_json      TEXT NOT NULL DEFAULT '[]',
        access_token_enc TEXT NOT NULL DEFAULT '',
        refresh_token_enc TEXT NOT NULL DEFAULT '',
        expires_at       TEXT NOT NULL DEFAULT '',
        metadata_json    TEXT NOT NULL DEFAULT '{}',
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL,
        PRIMARY KEY (id),
        UNIQUE (user_id, provider_id)
      )
    `);

    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tc_user_id ON tool_connections (user_id)
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

const connectionsDb: BetterSQLiteDB | null = tryOpenConnectionsDB();

// ─── internal helpers ─────────────────────────────────────────────────────────

function parseJsonSafe<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function maskConnection(raw: RawConnection): ProviderConnection {
  return {
    id: raw.id,
    user_id: raw.user_id,
    provider_id: raw.provider_id,
    status: (VALID_STATUSES.includes(raw.status as ConnectionStatus)
      ? raw.status
      : "error") as ConnectionStatus,
    account_label: raw.account_label,
    auth_type: raw.auth_type,
    scopes: parseJsonSafe<string[]>(raw.scopes_json, []),
    has_access_token: Boolean(raw.access_token_enc),
    has_refresh_token: Boolean(raw.refresh_token_enc),
    expires_at: raw.expires_at,
    metadata: parseJsonSafe<Record<string, unknown>>(raw.metadata_json, {}),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

/**
 * Returns all connections for a user, newest first.
 * Never throws — returns [] on any failure.
 */
export function listConnections(userId = "default"): ProviderConnection[] {
  if (!connectionsDb) return [];
  try {
    const rows = connectionsDb
      .prepare(
        `SELECT * FROM tool_connections WHERE user_id = ? ORDER BY created_at DESC`
      )
      .all(userId) as RawConnection[];
    return rows.map(maskConnection);
  } catch {
    return [];
  }
}

/**
 * Returns the connection for a specific provider, or null if none exists.
 * Never throws — returns null on any failure.
 */
export function getConnectionByProvider(
  providerId: string,
  userId = "default"
): ProviderConnection | null {
  if (!connectionsDb) return null;
  try {
    const row = connectionsDb
      .prepare(
        `SELECT * FROM tool_connections WHERE user_id = ? AND provider_id = ?`
      )
      .get(userId, providerId) as RawConnection | undefined;
    return row ? maskConnection(row) : null;
  } catch {
    return null;
  }
}

/**
 * Creates or updates a connection for the given provider.
 * - Validates provider_id against the registry.
 * - Validates auth_type against provider.authTypes (if provided).
 * - Encrypts access_token and refresh_token before storage.
 * - Throws if DB is unavailable, provider unknown, or validation fails.
 */
export function upsertConnection(
  input: UpsertConnectionInput,
  userId = "default"
): ProviderConnection {
  if (!connectionsDb) throw new Error("Connections DB is unavailable");

  const provider = getProvider(input.provider_id);
  if (!provider) {
    throw new Error(`Unknown provider: "${input.provider_id}"`);
  }

  const authType = input.auth_type ?? provider.preferredAuthType;
  if (!provider.authTypes.includes(authType as never)) {
    throw new Error(
      `auth_type "${authType}" is not supported by provider "${input.provider_id}". ` +
        `Allowed: [${provider.authTypes.join(", ")}]`
    );
  }

  // Webhook providers receive inbound events — they never store outbound credentials.
  if (
    provider.connectionMethod === "webhook_inbound" &&
    (input.access_token || input.refresh_token)
  ) {
    throw new Error(
      `Provider "${input.provider_id}" uses webhook_inbound and does not accept access or refresh tokens`
    );
  }

  // auth_type "none" means no credentials are exchanged at all.
  if (authType === "none" && (input.access_token || input.refresh_token)) {
    throw new Error(
      `auth_type "none" does not accept access or refresh tokens for provider "${input.provider_id}"`
    );
  }

  const status = input.status ?? "connected";
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: "${status}". Must be one of: ${VALID_STATUSES.join(", ")}`);
  }

  const now = new Date().toISOString();

  // Encrypt tokens — throws if INTEGRATIONS_ENCRYPTION_SECRET is missing
  const accessTokenEnc = encryptSecret(input.access_token ?? "");
  const refreshTokenEnc = encryptSecret(input.refresh_token ?? "");

  // Check if an existing row exists so we can preserve its id and created_at
  const existing = connectionsDb
    .prepare(`SELECT id, created_at FROM tool_connections WHERE user_id = ? AND provider_id = ?`)
    .get(userId, input.provider_id) as { id: string; created_at: string } | undefined;

  const id = existing?.id ?? crypto.randomUUID();
  const createdAt = existing?.created_at ?? now;

  connectionsDb
    .prepare(
      `INSERT INTO tool_connections
         (id, user_id, provider_id, status, account_label, auth_type,
          scopes_json, access_token_enc, refresh_token_enc, expires_at,
          metadata_json, created_at, updated_at)
       VALUES
         (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, provider_id) DO UPDATE SET
         status            = excluded.status,
         account_label     = excluded.account_label,
         auth_type         = excluded.auth_type,
         scopes_json       = excluded.scopes_json,
         access_token_enc  = excluded.access_token_enc,
         refresh_token_enc = excluded.refresh_token_enc,
         expires_at        = excluded.expires_at,
         metadata_json     = excluded.metadata_json,
         updated_at        = excluded.updated_at`
    )
    .run(
      id,
      userId,
      input.provider_id,
      status,
      input.account_label ?? "",
      authType,
      JSON.stringify(input.scopes ?? []),
      accessTokenEnc,
      refreshTokenEnc,
      input.expires_at ?? "",
      JSON.stringify(input.metadata ?? {}),
      createdAt,
      now
    );

  const row = connectionsDb
    .prepare(`SELECT * FROM tool_connections WHERE id = ?`)
    .get(id) as RawConnection;
  return maskConnection(row);
}

/**
 * Disconnect contract — atomically:
 *   1. Sets status = "disconnected"
 *   2. Wipes access_token_enc and refresh_token_enc (no token orphans)
 *   3. Clears expires_at (stale expiry is meaningless once tokens are wiped)
 *
 * No-op if no connection exists for the provider.
 * Throws if DB unavailable.
 */
export function disconnectConnection(
  providerId: string,
  userId = "default"
): void {
  if (!connectionsDb) throw new Error("Connections DB is unavailable");
  const now = new Date().toISOString();
  connectionsDb
    .prepare(
      `UPDATE tool_connections
       SET status = 'disconnected',
           access_token_enc  = '',
           refresh_token_enc = '',
           expires_at        = '',
           updated_at        = ?
       WHERE user_id = ? AND provider_id = ?`
    )
    .run(now, userId, providerId);
}

/**
 * Returns the decrypted plaintext access token for a connected provider.
 * Returns null if the provider is not connected, no token is stored,
 * or any error occurs during decryption.
 *
 * SERVER-SIDE ONLY — never pass the return value to client components or API responses.
 */
export function getDecryptedAccessToken(
  providerId: string,
  userId = "default"
): string | null {
  if (!connectionsDb) return null;
  try {
    const row = connectionsDb
      .prepare(
        `SELECT access_token_enc FROM tool_connections
         WHERE user_id = ? AND provider_id = ? AND status = 'connected'`
      )
      .get(userId, providerId) as { access_token_enc: string } | undefined;
    if (!row?.access_token_enc) return null;
    return decryptSecret(row.access_token_enc);
  } catch {
    return null;
  }
}

/**
 * Updates only the status of a connection, identified by its id.
 * Throws if DB unavailable.
 */
export function updateConnectionStatus(
  connectionId: string,
  status: ConnectionStatus
): void {
  if (!connectionsDb) throw new Error("Connections DB is unavailable");
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: "${status}"`);
  }
  const now = new Date().toISOString();
  connectionsDb
    .prepare(`UPDATE tool_connections SET status = ?, updated_at = ? WHERE id = ?`)
    .run(status, now, connectionId);
}

/**
 * Returns the decrypted plaintext refresh token for a connected provider.
 * Returns null if the provider is not connected, no refresh token is stored,
 * or any error occurs during decryption.
 *
 * SERVER-SIDE ONLY — never pass the return value to client components or API responses.
 */
export function getDecryptedRefreshToken(
  providerId: string,
  userId = "default"
): string | null {
  if (!connectionsDb) return null;
  try {
    const row = connectionsDb
      .prepare(
        `SELECT refresh_token_enc FROM tool_connections
         WHERE user_id = ? AND provider_id = ? AND status = 'connected'`
      )
      .get(userId, providerId) as { refresh_token_enc: string } | undefined;
    if (!row?.refresh_token_enc) return null;
    return decryptSecret(row.refresh_token_enc);
  } catch {
    return null;
  }
}

/**
 * Updates only the token-related columns of an existing connection.
 * Unlike upsertConnection(), this does NOT touch account_label, scopes_json,
 * auth_type, or metadata_json — safe to call after a token refresh.
 *
 * Pass refresh_token only when the provider issued a new one; omit it to
 * preserve the existing refresh token in the DB.
 *
 * Never throws — logs errors to stderr and swallows so callers are safe.
 */
export function updateConnectionTokens(
  providerId: string,
  tokens: {
    access_token:   string;
    refresh_token?: string;
    expires_at?:    string;
  },
  userId = "default"
): void {
  if (!connectionsDb) {
    console.error("[connections] updateConnectionTokens: DB unavailable");
    return;
  }
  try {
    const accessTokenEnc = encryptSecret(tokens.access_token);
    const now            = new Date().toISOString();
    const expiresAt      = tokens.expires_at ?? "";

    if (tokens.refresh_token !== undefined) {
      const refreshTokenEnc = encryptSecret(tokens.refresh_token);
      connectionsDb
        .prepare(
          `UPDATE tool_connections
           SET access_token_enc  = ?,
               refresh_token_enc = ?,
               expires_at        = ?,
               updated_at        = ?
           WHERE user_id = ? AND provider_id = ?`
        )
        .run(accessTokenEnc, refreshTokenEnc, expiresAt, now, userId, providerId);
    } else {
      connectionsDb
        .prepare(
          `UPDATE tool_connections
           SET access_token_enc = ?,
               expires_at       = ?,
               updated_at       = ?
           WHERE user_id = ? AND provider_id = ?`
        )
        .run(accessTokenEnc, expiresAt, now, userId, providerId);
    }
  } catch (err) {
    console.error("[connections] updateConnectionTokens failed:", err);
  }
}

/**
 * Marks a provider's connection as "expired" or "error" after a definitive
 * auth failure detected during tool execution.
 *
 * Safety properties:
 *   - Only flips when the current status is "connected" — prevents double-flips
 *     and noisy updates on connections that are already degraded.
 *   - Never throws — failures are printed to stderr and swallowed so this is
 *     safe to call from catch blocks without disrupting the response.
 *
 * Returns true if the status was actually written, false if skipped or failed.
 */
export function markConnectionStatus(
  providerId: string,
  newStatus:  "expired" | "error",
  userId      = "default",
): boolean {
  try {
    const conn = getConnectionByProvider(providerId, userId);
    if (!conn || conn.status !== "connected") return false;
    updateConnectionStatus(conn.id, newStatus);
    return true;
  } catch (err) {
    console.error("[connections] markConnectionStatus failed:", err);
    return false;
  }
}
