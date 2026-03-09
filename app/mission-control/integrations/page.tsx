/**
 * app/mission-control/integrations/page.tsx
 * Integrations Health — shows connection statuses for current user.
 */

import Link from "next/link";
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

const STATUS_COLORS: Record<string, string> = {
  connected:    "bg-emerald-100 text-emerald-700 border-emerald-200",
  expired:      "bg-amber-100 text-amber-700 border-amber-200",
  error:        "bg-red-100 text-red-600 border-red-200",
  disconnected: "bg-gray-100 text-gray-500 border-gray-200",
};

export default async function IntegrationsHealthPage() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const userId   = getCurrentUserIdFromSession(session);
  const db       = getDB();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const connections: { id: string; provider_id: string; status: string; account_label: string; updated_at: string }[] = [];
  let topFailingProvider: string | null = null;

  if (db) {
    try {
      const rows = db.prepare(
        `SELECT id, provider_id, status, account_label, updated_at
         FROM tool_connections WHERE user_id = ? OR user_id = 'default'
         ORDER BY provider_id ASC`
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

  const connected    = connections.filter((c) => c.status === "connected").length;
  const expired      = connections.filter((c) => c.status === "expired").length;
  const errored      = connections.filter((c) => c.status === "error").length;
  const disconnected = connections.filter((c) => c.status === "disconnected").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Integrations Health</h1>
          <p className="text-sm text-gray-500 mt-1">Connection status for your tool integrations</p>
        </div>
        <Link href="/integrations" className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:border-violet-300 hover:text-violet-700">
          Manage Integrations →
        </Link>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Connected",    count: connected,    color: "text-emerald-600" },
          { label: "Expired",      count: expired,      color: "text-amber-600" },
          { label: "Error",        count: errored,      color: "text-red-500" },
          { label: "Disconnected", count: disconnected, color: "text-gray-500" },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.count}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Top failing provider */}
      {topFailingProvider && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800">
            Top failing provider (last 24h): <span className="font-mono font-bold">{topFailingProvider}</span>
          </p>
          <p className="text-xs text-amber-600 mt-0.5">Check the provider&apos;s tool log for details.</p>
        </div>
      )}

      {/* Connection list */}
      {connections.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">No integrations connected yet.</p>
          <Link href="/integrations" className="text-sm text-violet-600 hover:underline mt-2 inline-block">
            Connect your first integration →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => (
            <div key={conn.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-semibold text-sm text-gray-900 font-mono">{conn.provider_id}</p>
                {conn.account_label && <p className="text-xs text-gray-500 mt-0.5">{conn.account_label}</p>}
                <p className="text-xs text-gray-400 mt-0.5">Last updated: {new Date(conn.updated_at).toLocaleString()}</p>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${STATUS_COLORS[conn.status] ?? STATUS_COLORS.disconnected}`}>
                {conn.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
