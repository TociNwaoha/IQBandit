/**
 * GET /api/mission-control/memory/search
 * Searches conversation messages for current user.
 * Query: ?q=...&agent_id=...&conversation_id=...
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

/** Escapes LIKE metacharacters for safe parameterized LIKE queries. */
function escapeLike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const sp     = request.nextUrl.searchParams;
  const q      = (sp.get("q") ?? "").trim();
  const agentFilter = sp.get("agent_id") ?? "";
  const convFilter  = sp.get("conversation_id") ?? "";

  if (!q || q.length < 2) {
    return NextResponse.json({ results: [], query: q }, { headers: NO_STORE });
  }

  const db = getDB();
  if (!db) return NextResponse.json({ results: [], query: q }, { headers: NO_STORE });

  const likePat  = `%${escapeLike(q)}%`;
  const conds:   string[]  = ["(c.user_id = ? OR c.user_id = 'default')", "m.content LIKE ? ESCAPE '\\'"];
  const params:  unknown[] = [userId, likePat];

  if (agentFilter) { conds.push("c.agent_id = ?"); params.push(agentFilter); }
  if (convFilter)  { conds.push("c.id = ?");        params.push(convFilter); }

  interface MatchRow {
    msg_id:          string;
    content:         string;
    role:            string;
    created_at:      string;
    conversation_id: string;
    conv_title:      string;
    conv_agent_id:   string;
  }

  let results: Array<MatchRow & { prev?: string; next?: string }> = [];

  try {
    const rows = db.prepare(`
      SELECT m.id as msg_id, m.content, m.role, m.created_at,
             c.id as conversation_id, c.title as conv_title, c.agent_id as conv_agent_id
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE ${conds.join(" AND ")}
      ORDER BY m.created_at DESC LIMIT 50
    `).all(...params) as MatchRow[];

    // Fetch prev/next message for context
    const prevStmt = db.prepare(
      `SELECT content FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1`
    );
    const nextStmt = db.prepare(
      `SELECT content FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1`
    );

    results = rows.map((row) => {
      const prev = prevStmt.get(row.conversation_id, row.created_at) as { content: string } | undefined;
      const next = nextStmt.get(row.conversation_id, row.created_at) as { content: string } | undefined;
      return {
        ...row,
        prev: prev?.content?.slice(0, 100),
        next: next?.content?.slice(0, 100),
      };
    });
  } catch { /* ignore */ }

  try { (db as unknown as { close(): void }).close(); } catch { /* ignore */ }

  return NextResponse.json({ results, query: q }, { headers: NO_STORE });
}
