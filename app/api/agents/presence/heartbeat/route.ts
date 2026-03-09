/**
 * app/api/agents/presence/heartbeat/route.ts
 * POST — upsert a presence heartbeat for an agent.
 *
 * Called by AgentChatClient while streaming a response:
 *   { agentId, isWorking: true,  note: "Responding..." }   — on send start
 *   { agentId, isWorking: true,  note: "Generating reply..." } — every 5 s
 *   { agentId, isWorking: false, note: "" }                 — on stream end
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession }               from "@/lib/auth";
import { upsertPresence }           from "@/lib/presence";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

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

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400, headers: NO_STORE });
  }

  const raw       = body as Record<string, unknown>;
  const agentId   = typeof raw.agentId   === "string"  ? raw.agentId.trim()            : "";
  const isWorking = typeof raw.isWorking === "boolean" ? raw.isWorking                 : false;
  const note      = typeof raw.note      === "string"  ? raw.note.trim().slice(0, 128) : "";
  // activity: semantic enum ("responding" | "tooling" | "idle" | "")
  const activity  = typeof raw.activity  === "string"  ? raw.activity.trim().slice(0, 64) : "";
  // detail: optional free-text context, e.g. "Web Search"
  const detail    = typeof raw.detail    === "string"  ? raw.detail.trim().slice(0, 128)  : "";

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400, headers: NO_STORE });
  }

  upsertPresence(agentId, { isWorking, note, activity, detail });

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
