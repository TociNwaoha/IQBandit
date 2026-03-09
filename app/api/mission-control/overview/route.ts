/**
 * GET /api/mission-control/overview
 * Returns KPI summary for the Mission Control Overview page.
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import path from "path";
import fs   from "fs";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;
const LOGS_DIR = path.resolve(process.cwd(), "logs");
const DB_PATH  = path.join(LOGS_DIR, "requests.db");

type BetterSQLiteDB = import("better-sqlite3").Database;

function getDB(): BetterSQLiteDB | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3") as typeof import("better-sqlite3");
    if (!fs.existsSync(DB_PATH)) return null;
    const db = new Database(DB_PATH, { readonly: true });
    return db;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const db     = getDB();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ── chat_requests stats ───────────────────────────────────────────────────
  let requests24h  = 0;
  let requestErrors24h = 0;
  let topModel: string | null = null;

  if (db) {
    try {
      const r = db.prepare(
        `SELECT COUNT(*) as cnt FROM chat_requests
         WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`
      ).get(since24h, userId) as { cnt: number };
      requests24h = r.cnt;

      const rErr = db.prepare(
        `SELECT COUNT(*) as cnt FROM chat_requests
         WHERE timestamp > ? AND success = 0 AND (user_id = ? OR user_id = 'default')`
      ).get(since24h, userId) as { cnt: number };
      requestErrors24h = rErr.cnt;

      const rModel = db.prepare(
        `SELECT model, COUNT(*) as cnt FROM chat_requests
         WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')
         GROUP BY model ORDER BY cnt DESC LIMIT 1`
      ).get(since24h, userId) as { model: string; cnt: number } | undefined;
      topModel = rModel?.model ?? null;
    } catch { /* ignore */ }
  }

  // ── tool_calls stats ──────────────────────────────────────────────────────
  let toolCalls24h  = 0;
  let toolErrors24h = 0;
  let topAction: string | null = null;

  if (db) {
    try {
      const t = db.prepare(
        `SELECT COUNT(*) as cnt FROM tool_calls
         WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`
      ).get(since24h, userId) as { cnt: number };
      toolCalls24h = t.cnt;

      const tErr = db.prepare(
        `SELECT COUNT(*) as cnt FROM tool_calls
         WHERE timestamp > ? AND success = 0 AND (user_id = ? OR user_id = 'default')`
      ).get(since24h, userId) as { cnt: number };
      toolErrors24h = tErr.cnt;

      const tAction = db.prepare(
        `SELECT action, COUNT(*) as cnt FROM tool_calls
         WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')
         GROUP BY action ORDER BY cnt DESC LIMIT 1`
      ).get(since24h, userId) as { action: string; cnt: number } | undefined;
      topAction = tAction?.action ?? null;
    } catch { /* ignore */ }
  }

  // ── integrations stats ────────────────────────────────────────────────────
  let connectedCount   = 0;
  let problemCount     = 0;

  if (db) {
    try {
      const conns = db.prepare(
        `SELECT status FROM tool_connections WHERE user_id = ? OR user_id = 'default'`
      ).all(userId) as { status: string }[];
      connectedCount = conns.filter((c) => c.status === "connected").length;
      problemCount   = conns.filter((c) => c.status === "expired" || c.status === "error").length;
    } catch { /* ignore */ }
  }

  // ── pending approvals ─────────────────────────────────────────────────────
  let pendingApprovals = 0;
  if (db) {
    try {
      const a = db.prepare(
        `SELECT COUNT(*) as cnt FROM approvals WHERE user_id = ? AND status = 'pending'`
      ).get(userId) as { cnt: number } | undefined;
      pendingApprovals = a?.cnt ?? 0;
    } catch { /* ignore */ }
  }

  if (db) { try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ } }

  const totalErrors24h = requestErrors24h + toolErrors24h;
  const totalCalls24h  = requests24h + toolCalls24h;
  const errorRate24h   = totalCalls24h > 0 ? Math.round((totalErrors24h / totalCalls24h) * 100) : 0;

  return NextResponse.json({
    requests24h,
    toolCalls24h,
    totalErrors24h,
    errorRate24h,
    connectedCount,
    problemCount,
    pendingApprovals,
    topModel,
    topAction,
  }, { headers: NO_STORE });
}
