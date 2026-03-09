/**
 * app/api/tool-audit/route.ts
 * GET  — query tool audit entries (with optional filters).
 * POST — write a tool consent audit entry (deny / always_allow decisions from client).
 *
 * GET query params (all optional):
 *   conversationId, agentId, tool, decision, limit
 *
 * POST body: {
 *   conversation_id: string;
 *   agent_id:        string;
 *   tool:            "web" | "files";
 *   decision:        "allow_once" | "always_allow" | "deny";
 *   reason:          string;
 *   query?:          string | null;
 * }
 *
 * Auth: session required.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession }                from "@/lib/auth";
import {
  logToolAudit, listToolAuditFiltered,
  type ConsentTool, type ToolConsentDecision,
} from "@/lib/toolAudit";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

const VALID_TOOLS:     Set<ConsentTool>         = new Set(["web", "files", "gmail"]);
const VALID_DECISIONS: Set<ToolConsentDecision> = new Set(["allow_once", "always_allow", "deny"]);

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const conversationId = searchParams.get("conversationId") ?? undefined;
  const agentId        = searchParams.get("agentId")        ?? undefined;
  const tool           = searchParams.get("tool")           ?? undefined;
  const decision       = searchParams.get("decision")       ?? undefined;
  const limitStr       = searchParams.get("limit");
  const limit          = limitStr ? Math.min(parseInt(limitStr, 10) || 100, 500) : 100;

  const entries = listToolAuditFiltered({
    conversation_id: conversationId,
    agent_id:        agentId,
    tool,
    decision,
    limit,
  });

  return NextResponse.json({ entries }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;

  const conversationId = typeof raw.conversation_id === "string" ? raw.conversation_id.trim() : "";
  const agentId        = typeof raw.agent_id        === "string" ? raw.agent_id.trim()        : "";
  const tool           = typeof raw.tool            === "string" ? raw.tool.trim()            : "";
  const decision       = typeof raw.decision        === "string" ? raw.decision.trim()        : "";
  const reason         = typeof raw.reason          === "string" ? raw.reason.trim()          : "";
  const query          = typeof raw.query           === "string" ? raw.query.trim()           : null;

  if (!VALID_TOOLS.has(tool as ConsentTool)) {
    return NextResponse.json(
      { error: `tool must be one of: ${[...VALID_TOOLS].join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }

  if (!VALID_DECISIONS.has(decision as ToolConsentDecision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${[...VALID_DECISIONS].join(", ")}` },
      { status: 400, headers: NO_STORE },
    );
  }

  logToolAudit({
    conversation_id: conversationId,
    agent_id:        agentId,
    tool:            tool as ConsentTool,
    decision:        decision as ToolConsentDecision,
    reason,
    query,
  });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
