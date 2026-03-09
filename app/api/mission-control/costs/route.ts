/**
 * GET /api/mission-control/costs
 * Returns request volume, latency distribution, and tool call volume for current user.
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
  const sp      = request.nextUrl.searchParams;
  const days    = Math.min(Number(sp.get("days") ?? "30"), 90);
  const sinceTs = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const db = getDB();
  if (!db) {
    return NextResponse.json({
      days,
      requestVolume:  0,
      toolCallVolume: 0,
      p50Latency:     null,
      p95Latency:     null,
      tokenUsage:     "not_available",
      byDay:          [],
    }, { headers: NO_STORE });
  }

  let requestVolume  = 0;
  let toolCallVolume = 0;
  let p50Latency: number | null = null;
  let p95Latency: number | null = null;
  let tokenUsage: "not_available" | "available" = "not_available";

  const byDay: { date: string; requests: number; tool_calls: number }[] = [];

  try {
    const r = db.prepare(
      `SELECT COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`
    ).get(sinceTs, userId) as { cnt: number };
    requestVolume = r.cnt;

    const t = db.prepare(
      `SELECT COUNT(*) as cnt FROM tool_calls WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`
    ).get(sinceTs, userId) as { cnt: number };
    toolCallVolume = t.cnt;

    // Latency distribution from chat_requests
    const latencies = (db.prepare(
      `SELECT latency_ms FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default') ORDER BY latency_ms ASC`
    ).all(sinceTs, userId) as { latency_ms: number }[]).map((r) => r.latency_ms);

    if (latencies.length > 0) {
      p50Latency = latencies[Math.floor(latencies.length * 0.50)] ?? null;
      p95Latency = latencies[Math.floor(latencies.length * 0.95)] ?? null;
    }

    // Check if token columns exist and have data
    try {
      const tok = db.prepare(
        `SELECT SUM(prompt_chars + response_chars) as total FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`
      ).get(sinceTs, userId) as { total: number | null };
      // prompt_chars/response_chars are chars not tokens, but non-zero = data available
      if (tok.total && tok.total > 0) tokenUsage = "available";
    } catch { /* no column */ }

    // Daily breakdown
    const byDayRows = db.prepare(
      `SELECT strftime('%Y-%m-%d', timestamp) as date, COUNT(*) as cnt
       FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')
       GROUP BY date ORDER BY date DESC LIMIT ?`
    ).all(sinceTs, userId, days) as { date: string; cnt: number }[];

    const toolByDayRows = db.prepare(
      `SELECT strftime('%Y-%m-%d', timestamp) as date, COUNT(*) as cnt
       FROM tool_calls WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')
       GROUP BY date ORDER BY date DESC LIMIT ?`
    ).all(sinceTs, userId, days) as { date: string; cnt: number }[];

    const toolByDay: Record<string, number> = {};
    for (const row of toolByDayRows) toolByDay[row.date] = row.cnt;

    for (const row of byDayRows) {
      byDay.push({ date: row.date, requests: row.cnt, tool_calls: toolByDay[row.date] ?? 0 });
    }
  } catch { /* ignore */ }

  try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ }

  return NextResponse.json({
    days, requestVolume, toolCallVolume,
    p50Latency, p95Latency, tokenUsage, byDay,
  }, { headers: NO_STORE });
}
