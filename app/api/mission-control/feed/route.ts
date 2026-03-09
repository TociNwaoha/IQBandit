/**
 * GET /api/mission-control/feed
 * Returns unified chronological feed of chat_requests + tool_calls for the current user.
 * Query params: ?limit=50&errors_only=1&provider=&action=&model=&agent_id=&conversation_id=
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

interface FeedItem {
  type:       "chat" | "tool";
  id:         string;
  timestamp:  string;
  success:    boolean;
  // chat fields
  email?:     string;
  model?:     string;
  latency_ms?: number;
  error_message?: string;
  // tool fields
  provider_id?:  string;
  action?:       string;
  agent_id?:     string;
  conversation_id?: string;
  error_code?:   string;
  approval_id?:  string;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const sp     = request.nextUrl.searchParams;
  const limit       = Math.min(Number(sp.get("limit") ?? "50"), 200);
  const errorsOnly  = sp.get("errors_only") === "1";
  const provider    = sp.get("provider") ?? "";
  const action      = sp.get("action") ?? "";
  const model       = sp.get("model") ?? "";
  const agentId     = sp.get("agent_id") ?? "";
  const convId      = sp.get("conversation_id") ?? "";

  const db = getDB();
  if (!db) return NextResponse.json({ items: [] }, { headers: NO_STORE });

  const items: FeedItem[] = [];

  // Chat requests
  const chatConds:  string[]  = ["(user_id = ? OR user_id = 'default')"];
  const chatParams: unknown[] = [userId];
  if (errorsOnly) { chatConds.push("success = 0"); }
  if (model)      { chatConds.push("model = ?"); chatParams.push(model); }

  try {
    const rows = db.prepare(
      `SELECT id, timestamp, email, model, latency_ms, success, error_message
       FROM chat_requests WHERE ${chatConds.join(" AND ")} ORDER BY timestamp DESC LIMIT ?`
    ).all(...chatParams, limit) as Array<{ id: number; timestamp: string; email: string; model: string; latency_ms: number; success: number; error_message: string }>;

    for (const r of rows) {
      items.push({
        type: "chat",
        id:   String(r.id),
        timestamp:     r.timestamp,
        success:       r.success === 1,
        email:         r.email,
        model:         r.model,
        latency_ms:    r.latency_ms,
        error_message: r.error_message || undefined,
      });
    }
  } catch { /* ignore */ }

  // Tool calls
  const toolConds:  string[]  = ["(user_id = ? OR user_id = 'default')"];
  const toolParams: unknown[] = [userId];
  if (errorsOnly) { toolConds.push("success = 0"); }
  if (provider)   { toolConds.push("provider_id = ?"); toolParams.push(provider); }
  if (action)     { toolConds.push("action = ?");      toolParams.push(action); }
  if (agentId)    { toolConds.push("agent_id = ?");    toolParams.push(agentId); }
  if (convId)     { toolConds.push("conversation_id = ?"); toolParams.push(convId); }

  try {
    const toolRows = db.prepare(
      `SELECT id, timestamp, provider_id, action, agent_id, conversation_id,
              success, latency_ms, error_code, approval_id
       FROM tool_calls WHERE ${toolConds.join(" AND ")} ORDER BY timestamp DESC LIMIT ?`
    ).all(...toolParams, limit) as Array<{
      id: string; timestamp: string; provider_id: string; action: string;
      agent_id: string; conversation_id: string; success: number; latency_ms: number;
      error_code: string; approval_id: string;
    }>;

    for (const r of toolRows) {
      items.push({
        type: "tool",
        id:   r.id,
        timestamp:       r.timestamp,
        success:         r.success === 1,
        provider_id:     r.provider_id,
        action:          r.action,
        agent_id:        r.agent_id || undefined,
        conversation_id: r.conversation_id || undefined,
        latency_ms:      r.latency_ms,
        error_code:      r.error_code || undefined,
        approval_id:     r.approval_id || undefined,
      });
    }
  } catch { /* ignore */ }

  try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ }

  // Sort by timestamp desc, take limit
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const trimmed = items.slice(0, limit);

  return NextResponse.json({ items: trimmed }, { headers: NO_STORE });
}
