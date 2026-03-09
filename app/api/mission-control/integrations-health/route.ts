/**
 * GET /api/mission-control/integrations-health
 * Returns connection statuses + top failing provider for current user.
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import path from "path";
import fs   from "fs";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;
type BetterSQLiteDB = import("better-sqlite3").Database;

function getDB(): BetterSQLiteDB | null {
  try {
    const DB_PATH = path.join(path.resolve(process.cwd(), "logs"), "requests.db");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    if (!fs.existsSync(DB_PATH)) return null;
    return new Database(DB_PATH, { readonly: true });
  } catch { return null; }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId  = getCurrentUserIdFromSession(session);
  const db      = getDB();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const connections: { id: string; provider_id: string; status: string; account_label: string; updated_at: string }[] = [];
  let topFailingProvider: string | null = null;

  if (db) {
    try {
      const rows = db.prepare(
        `SELECT id, provider_id, status, account_label, updated_at
         FROM tool_connections WHERE user_id = ? OR user_id = 'default'
         ORDER BY updated_at DESC`
      ).all(userId) as typeof connections;
      connections.push(...rows);
    } catch { /* ignore */ }

    try {
      const fail = db.prepare(
        `SELECT provider_id, COUNT(*) as cnt FROM tool_calls
         WHERE (user_id = ? OR user_id = 'default') AND success = 0 AND timestamp > ?
         GROUP BY provider_id ORDER BY cnt DESC LIMIT 1`
      ).get(userId, since24h) as { provider_id: string } | undefined;
      topFailingProvider = fail?.provider_id ?? null;
    } catch { /* ignore */ }

    try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ }
  }

  const summary = {
    connected:    connections.filter((c) => c.status === "connected").length,
    expired:      connections.filter((c) => c.status === "expired").length,
    error:        connections.filter((c) => c.status === "error").length,
    disconnected: connections.filter((c) => c.status === "disconnected").length,
  };

  return NextResponse.json({ connections, summary, topFailingProvider }, { headers: NO_STORE });
}
