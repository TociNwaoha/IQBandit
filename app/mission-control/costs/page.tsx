/**
 * app/mission-control/costs/page.tsx
 * Costs dashboard — volume, latency, token availability.
 * Server-rendered.
 */

import { getSessionFromCookies } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import path from "path";
import fs   from "fs";

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

interface StatCardProps { label: string; value: string; sub?: string; note?: string; }
function StatCard({ label, value, sub, note }: StatCardProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">{label}</p>
      <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">{value}</p>
      {sub  && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      {note && <p className="text-xs text-amber-600 mt-1 italic">{note}</p>}
    </div>
  );
}

export default async function CostsPage() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const userId   = getCurrentUserIdFromSession(session);
  const db       = getDB();
  const days     = 30;
  const sinceTs  = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let requestVolume  = 0;
  let toolCallVolume = 0;
  let p50Latency: number | null = null;
  let p95Latency: number | null = null;
  let tokenUsage: "not_available" | "available" = "not_available";
  const byDay: { date: string; requests: number }[] = [];

  if (db) {
    try {
      const r = db.prepare(`SELECT COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`).get(sinceTs, userId) as { cnt: number };
      requestVolume = r.cnt;

      const t = db.prepare(`SELECT COUNT(*) as cnt FROM tool_calls WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`).get(sinceTs, userId) as { cnt: number };
      toolCallVolume = t.cnt;

      const latencies = (db.prepare(`SELECT latency_ms FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default') ORDER BY latency_ms ASC`).all(sinceTs, userId) as { latency_ms: number }[]).map((r) => r.latency_ms);
      if (latencies.length > 0) {
        p50Latency = latencies[Math.floor(latencies.length * 0.50)] ?? null;
        p95Latency = latencies[Math.floor(latencies.length * 0.95)] ?? null;
      }

      try {
        const tok = db.prepare(`SELECT SUM(prompt_chars + response_chars) as total FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`).get(sinceTs, userId) as { total: number | null };
        if (tok.total && tok.total > 0) tokenUsage = "available";
      } catch { /* ignore */ }

      const days30Rows = db.prepare(`SELECT strftime('%Y-%m-%d', timestamp) as date, COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default') GROUP BY date ORDER BY date ASC`).all(sinceTs, userId) as { date: string; cnt: number }[];
      byDay.push(...days30Rows.map((r) => ({ date: r.date, requests: r.cnt })));
    } catch { /* ignore */ }

    try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Costs</h1>
        <p className="text-sm text-gray-500 mt-1">Volume, latency, and cost estimates — last 30 days</p>
      </div>

      {/* Cost disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
        <p className="text-sm font-medium text-amber-800">Cost estimation note</p>
        <p className="text-xs text-amber-700 mt-1">
          {tokenUsage === "not_available"
            ? "Token usage data is not available from OpenClaw — actual LLM cost cannot be computed. Showing request and tool call volumes instead."
            : "Token usage is available (prompt_chars + response_chars). Exact cost depends on your model pricing — configure model cost map for precise estimates."}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Requests (30d)"    value={String(requestVolume)}  sub="Chat requests" />
        <StatCard label="Tool Calls (30d)"  value={String(toolCallVolume)} sub="Tool executions" />
        <StatCard
          label="p50 Latency"
          value={p50Latency !== null ? `${p50Latency}ms` : "—"}
          sub="Median chat latency"
          note={p50Latency === null ? "No data" : undefined}
        />
        <StatCard
          label="p95 Latency"
          value={p95Latency !== null ? `${p95Latency}ms` : "—"}
          sub="95th percentile chat latency"
          note={p95Latency === null ? "No data" : undefined}
        />
      </div>

      {/* Volume chart (simple table) */}
      {byDay.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Daily Request Volume</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Date</th>
                  <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Requests</th>
                  <th className="px-5 py-2 text-xs text-gray-500 font-medium text-left">Volume</th>
                </tr>
              </thead>
              <tbody>
                {byDay.slice().reverse().map((d) => {
                  const maxReqs = Math.max(...byDay.map((r) => r.requests), 1);
                  const pct     = Math.round((d.requests / maxReqs) * 100);
                  return (
                    <tr key={d.date} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-5 py-2 text-xs text-gray-600 font-mono">{d.date}</td>
                      <td className="px-5 py-2 text-xs text-gray-900 font-semibold tabular-nums text-right">{d.requests}</td>
                      <td className="px-5 py-2">
                        <div className="h-2 bg-violet-100 rounded-full overflow-hidden w-48">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {byDay.length === 0 && requestVolume === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No request data yet in the last 30 days.</p>
        </div>
      )}
    </div>
  );
}
