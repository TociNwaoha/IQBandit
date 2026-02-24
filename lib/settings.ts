/**
 * lib/settings.ts
 * Persisted key-value settings store backed by the same SQLite DB as logs.
 * Falls back to env vars when no stored value exists.
 * SERVER-SIDE ONLY.
 */

import fs from "fs";
import path from "path";

export interface GatewaySettings {
  OPENCLAW_GATEWAY_URL: string;
  OPENCLAW_GATEWAY_TOKEN: string;
  OPENCLAW_CHAT_PATH: string;
  STARTCLAW_CHAT_MODE: "openclaw" | "disabled";
  DEFAULT_MODEL: string;
}

const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function tryOpenSettingsDB(): BetterSQLiteDB | null {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    const db: BetterSQLiteDB = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
    return db;
  } catch {
    return null;
  }
}

const settingsDb: BetterSQLiteDB | null = tryOpenSettingsDB();

function envDefaults(): GatewaySettings {
  return {
    OPENCLAW_GATEWAY_URL:   process.env.OPENCLAW_GATEWAY_URL   ?? "http://127.0.0.1:19001",
    OPENCLAW_GATEWAY_TOKEN: process.env.OPENCLAW_GATEWAY_TOKEN ?? "",
    OPENCLAW_CHAT_PATH:     process.env.OPENCLAW_CHAT_PATH     ?? "/v1/chat/completions",
    STARTCLAW_CHAT_MODE:   (process.env.STARTCLAW_CHAT_MODE as "openclaw" | "disabled") ?? "openclaw",
    DEFAULT_MODEL:          "openclaw:main",
  };
}

/** Returns effective settings: SQLite stored values take precedence over env defaults. */
export function getSettings(): GatewaySettings {
  const d = envDefaults();
  if (!settingsDb) return d;
  try {
    const rows = settingsDb
      .prepare("SELECT key, value FROM settings")
      .all() as { key: string; value: string }[];
    const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      OPENCLAW_GATEWAY_URL:   stored.OPENCLAW_GATEWAY_URL   ?? d.OPENCLAW_GATEWAY_URL,
      OPENCLAW_GATEWAY_TOKEN: stored.OPENCLAW_GATEWAY_TOKEN ?? d.OPENCLAW_GATEWAY_TOKEN,
      OPENCLAW_CHAT_PATH:     stored.OPENCLAW_CHAT_PATH     ?? d.OPENCLAW_CHAT_PATH,
      STARTCLAW_CHAT_MODE:   (stored.STARTCLAW_CHAT_MODE as "openclaw" | "disabled") ?? d.STARTCLAW_CHAT_MODE,
      DEFAULT_MODEL:          stored.DEFAULT_MODEL          ?? d.DEFAULT_MODEL,
    };
  } catch {
    return d;
  }
}

/** Upserts only the provided keys — unmentioned keys are unchanged. */
export function saveSettings(patch: Partial<GatewaySettings>): void {
  if (!settingsDb) return;
  const upsert = settingsDb.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  );
  const tx = settingsDb.transaction((entries: [string, string][]) => {
    for (const [k, v] of entries) upsert.run(k, v);
  });
  tx(Object.entries(patch).map(([k, v]) => [k, String(v ?? "")]));
}
