/**
 * app/api/conversations/new/route.ts
 * POST — create a fresh conversation pinned to a specific agent.
 *
 * Body: { agentId: string }
 * Response: { conversationId: string }
 *
 * Dedicated endpoint for the agent chat UI (vs the general POST /api/conversations
 * which is used by the office-building feature). Returns just the new conversation
 * ID so the client can navigate to ?c=<id> immediately.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession }               from "@/lib/auth";
import { createConversation }       from "@/lib/conversations";
import { getAgent }                 from "@/lib/agents";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let agentId = "";
  try {
    const body = await request.json();
    if (typeof body.agentId === "string") agentId = body.agentId.trim();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: NO_STORE });
  }

  if (!agentId) {
    return NextResponse.json({ error: "agentId is required" }, { status: 400, headers: NO_STORE });
  }

  // Validate the agent exists
  const agent = getAgent(agentId);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: NO_STORE });
  }

  const model = agent.default_model || "openclaw:main";
  const conv  = createConversation(model, agentId);

  if (!conv) {
    return NextResponse.json(
      { error: "Could not create conversation — database unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json(
    { conversationId: conv.id, title: conv.title, created_at: conv.created_at },
    { status: 201, headers: NO_STORE },
  );
}
