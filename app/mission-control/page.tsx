/**
 * app/mission-control/page.tsx
 * Mission Control — Overview dashboard.
 * Server-rendered KPI cards with quick links.
 */

import Link from "next/link";
import { getSessionFromCookies } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { listApprovals } from "@/lib/approvals";
import path from "path";
import fs   from "fs";
import { GatewayStatusCard } from "./_components/GatewayStatusCard";

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

interface KpiCardProps {
  label: string;
  value: string | number;
  sub?:  string;
  accent?: "green" | "red" | "amber" | "violet";
  href?: string;
}

function KpiCard({ label, value, sub, accent, href }: KpiCardProps) {
  const accentClass = {
    green:  "text-emerald-600",
    red:    "text-red-500",
    amber:  "text-amber-600",
    violet: "text-violet-600",
  }[accent ?? "violet"] ?? "text-gray-900";

  const card = (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex flex-col gap-1 hover:border-gray-300 transition-colors">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${accentClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
  if (href) return <Link href={href}>{card}</Link>;
  return card;
}

function QuickLink({ label, href }: { label: string; href: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-600 bg-white border border-gray-200 hover:border-violet-300 hover:text-violet-700 hover:bg-violet-50 transition-all">
      {label} <span className="text-gray-400">↗</span>
    </Link>
  );
}

export default async function MissionControlOverview() {
  const session = await getSessionFromCookies();
  if (!session) return null;
  const userId  = getCurrentUserIdFromSession(session);
  const db      = getDB();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Chat requests
  let requests24h = 0, requestErrors = 0, topModel = "—";
  if (db) {
    try {
      const r = db.prepare(`SELECT COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`).get(since24h, userId) as { cnt: number };
      requests24h = r.cnt;
      const rE = db.prepare(`SELECT COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND success = 0 AND (user_id = ? OR user_id = 'default')`).get(since24h, userId) as { cnt: number };
      requestErrors = rE.cnt;
      const rM = db.prepare(`SELECT model, COUNT(*) as cnt FROM chat_requests WHERE timestamp > ? AND (user_id = ? OR user_id = 'default') GROUP BY model ORDER BY cnt DESC LIMIT 1`).get(since24h, userId) as { model: string } | undefined;
      topModel = rM?.model ?? "—";
    } catch { /* ignore */ }
  }

  // Tool calls
  let toolCalls24h = 0, toolErrors = 0, topAction = "—";
  if (db) {
    try {
      const t = db.prepare(`SELECT COUNT(*) as cnt FROM tool_calls WHERE timestamp > ? AND (user_id = ? OR user_id = 'default')`).get(since24h, userId) as { cnt: number };
      toolCalls24h = t.cnt;
      const tE = db.prepare(`SELECT COUNT(*) as cnt FROM tool_calls WHERE timestamp > ? AND success = 0 AND (user_id = ? OR user_id = 'default')`).get(since24h, userId) as { cnt: number };
      toolErrors = tE.cnt;
      const tA = db.prepare(`SELECT action, COUNT(*) as cnt FROM tool_calls WHERE timestamp > ? AND (user_id = ? OR user_id = 'default') GROUP BY action ORDER BY cnt DESC LIMIT 1`).get(since24h, userId) as { action: string } | undefined;
      topAction = tA?.action ?? "—";
    } catch { /* ignore */ }
  }

  // Integrations
  let connectedCount = 0, problemCount = 0;
  if (db) {
    try {
      const conns = db.prepare(`SELECT status FROM tool_connections WHERE user_id = ? OR user_id = 'default'`).all(userId) as { status: string }[];
      connectedCount = conns.filter((c) => c.status === "connected").length;
      problemCount   = conns.filter((c) => c.status === "expired" || c.status === "error").length;
    } catch { /* ignore */ }
  }

  if (db) { try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ } }

  // Pending approvals
  const pendingApprovals = listApprovals(userId, { status: "pending" }).length;

  const totalErrors = requestErrors + toolErrors;
  const totalCalls  = requests24h + toolCalls24h;
  const errorRate   = totalCalls > 0 ? `${Math.round((totalErrors / totalCalls) * 100)}%` : "0%";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mission Control</h1>
        <p className="text-sm text-gray-500 mt-1">Operator overview — last 24 hours</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GatewayStatusCard />
        <KpiCard label="Requests (24h)"  value={requests24h}   sub="Chat requests"           accent="violet" href="/logs" />
        <KpiCard label="Tool Calls (24h)" value={toolCalls24h} sub="Tool executions"          accent="violet" href="/tool-logs" />
        <KpiCard
          label="Error Rate (24h)"
          value={errorRate}
          sub={`${totalErrors} total errors`}
          accent={totalErrors > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Integrations"
          value={connectedCount}
          sub={problemCount > 0 ? `${problemCount} need attention` : "All healthy"}
          accent={problemCount > 0 ? "amber" : "green"}
          href="/mission-control/integrations"
        />
        <KpiCard
          label="Pending Approvals"
          value={pendingApprovals}
          sub={pendingApprovals > 0 ? "Action required" : "Queue clear"}
          accent={pendingApprovals > 0 ? "amber" : "green"}
          href="/mission-control/approvals"
        />
        <KpiCard label="Top Model"      value={topModel}    sub="Most used model"    accent="violet" />
        <KpiCard label="Top Tool Action" value={topAction}  sub="Most called action" accent="violet" />
      </div>

      {/* Quick links */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Quick Access</h2>
        <div className="flex flex-wrap gap-2">
          <QuickLink label="Analytics"         href="/analytics" />
          <QuickLink label="Request Logs"      href="/logs" />
          <QuickLink label="Tool Logs"         href="/tool-logs" />
          <QuickLink label="Integrations"      href="/integrations" />
          <QuickLink label="Agents"            href="/agents" />
          <QuickLink label="Live Feed"         href="/mission-control/live" />
          <QuickLink label="Approvals Queue"   href="/mission-control/approvals" />
          <QuickLink label="Tasks Board"       href="/mission-control/tasks" />
        </div>
      </div>

      {/* Mission Control sub-pages */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Mission Control Pages</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Live Feed",    href: "/mission-control/live",         desc: "Real-time activity stream" },
            { label: "Agents Fleet",  href: "/mission-control/agents",      desc: "Agent status and activity" },
            { label: "Tasks",         href: "/mission-control/tasks",        desc: "Kanban task board" },
            { label: "Approvals",     href: "/mission-control/approvals",    desc: "Governance queue" },
            { label: "Integrations",  href: "/mission-control/integrations", desc: "Health of connections" },
            { label: "Memory",        href: "/mission-control/memory",       desc: "Search conversation memory" },
            { label: "Costs",         href: "/mission-control/costs",        desc: "Volume and latency data" },
          ].map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="bg-white border border-gray-200 rounded-xl p-4 hover:border-violet-300 hover:bg-violet-50 transition-colors group"
            >
              <p className="text-sm font-semibold text-gray-900 group-hover:text-violet-700">{page.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{page.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
