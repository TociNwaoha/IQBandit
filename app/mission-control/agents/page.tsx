/**
 * app/mission-control/agents/page.tsx
 * Agents Fleet — server-rendered list of agents for current user + recent activity.
 */

import Link from "next/link";
import { getSessionFromCookies } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { listAgentsForUser } from "@/lib/agents";
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

export default async function AgentsFleetPage() {
  const session = await getSessionFromCookies();
  if (!session) return null;

  const userId = getCurrentUserIdFromSession(session);
  const agents = listAgentsForUser(userId);
  const db     = getDB();

  // Recent tool calls per agent (last 5)
  const recentToolCalls: Record<string, { action: string; provider_id: string; success: boolean; timestamp: string }[]> = {};
  // Last conversation per agent
  const lastConv: Record<string, { title: string; id: string; updated_at: string }> = {};
  // Tool allowlist counts
  const toolCounts: Record<string, number> = {};

  for (const agent of agents) {
    if (db) {
      try {
        const calls = db.prepare(
          `SELECT action, provider_id, success, timestamp FROM tool_calls
           WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 5`
        ).all(agent.id) as { action: string; provider_id: string; success: number; timestamp: string }[];
        recentToolCalls[agent.id] = calls.map((c) => ({ ...c, success: c.success === 1 }));
      } catch { recentToolCalls[agent.id] = []; }

      try {
        const conv = db.prepare(
          `SELECT id, title, updated_at FROM conversations
           WHERE agent_id = ? ORDER BY updated_at DESC LIMIT 1`
        ).get(agent.id) as { id: string; title: string; updated_at: string } | undefined;
        if (conv) lastConv[agent.id] = conv;
      } catch { /* ignore */ }

      try {
        const cnt = db.prepare(
          `SELECT COUNT(*) as cnt FROM agent_tools WHERE agent_id = ?`
        ).get(agent.id) as { cnt: number };
        toolCounts[agent.id] = cnt.cnt;
      } catch { toolCounts[agent.id] = 0; }
    }
  }

  if (db) { try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ } }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Agents Fleet</h1>
        <p className="text-sm text-gray-500 mt-1">{agents.length} agent{agents.length !== 1 ? "s" : ""} in your fleet</p>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
          <p className="text-gray-400">No agents yet.</p>
          <Link href="/agents" className="text-sm text-violet-600 hover:underline mt-2 inline-block">
            Create your first agent →
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {agents.map((agent) => {
            const dept = agent.department || "unassigned";
            const agentHref = agent.department
              ? `/agents/${agent.department}/${agent.id}`
              : `/agents/list`;
            const calls = recentToolCalls[agent.id] ?? [];
            const conv  = lastConv[agent.id];
            const toolCount = toolCounts[agent.id] ?? 0;

            return (
              <div key={agent.id} className="bg-white border border-gray-200 rounded-xl p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <Link href={agentHref} className="text-base font-semibold text-gray-900 hover:text-violet-700 hover:underline">
                      {agent.name}
                    </Link>
                    <div className="flex items-center gap-2 flex-wrap mt-1">
                      <span className="text-xs text-gray-400 capitalize">{dept}</span>
                      <span className="text-gray-300 text-xs">·</span>
                      <span className="text-xs text-gray-400">{toolCount} tool{toolCount !== 1 ? "s" : ""} allowed</span>
                      {agent.user_id === "default" && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">shared</span>
                      )}
                    </div>
                    {agent.description && (
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{agent.description}</p>
                    )}
                  </div>
                  <Link href={agentHref}
                    className="shrink-0 text-xs text-violet-600 hover:text-violet-800 border border-violet-200 px-3 py-1.5 rounded-lg hover:bg-violet-50">
                    Open Agent →
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Recent tool calls */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Recent Tool Calls</p>
                    {calls.length === 0 ? (
                      <p className="text-xs text-gray-300 italic">No calls yet</p>
                    ) : (
                      <div className="space-y-1">
                        {calls.map((c, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.success ? "bg-emerald-400" : "bg-red-400"}`} />
                            <span className="text-xs font-mono text-gray-600">{c.provider_id}/{c.action}</span>
                            <span className="text-xs text-gray-400">{new Date(c.timestamp).toLocaleTimeString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Last conversation */}
                  <div>
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Last Conversation</p>
                    {conv ? (
                      <div>
                        <p className="text-xs text-gray-700 font-medium line-clamp-1">{conv.title}</p>
                        <p className="text-xs text-gray-400">{new Date(conv.updated_at).toLocaleString()}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-300 italic">No conversations yet</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
