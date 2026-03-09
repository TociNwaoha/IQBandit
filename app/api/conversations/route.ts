/**
 * app/api/conversations/route.ts
 * GET  — list conversations, newest first
 * POST — create a new conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { createConversation, listConversations } from "@/lib/conversations";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json(listConversations());
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let model   = "openclaw:main";
  let agentId = "";
  try {
    const body = await request.json();
    if (typeof body.model    === "string" && body.model.trim())    model   = body.model.trim();
    if (typeof body.agent_id === "string" && body.agent_id.trim()) agentId = body.agent_id.trim();
  } catch {
    // body is optional
  }

  const conv = createConversation(model, agentId);
  if (!conv) {
    return NextResponse.json(
      { error: "Could not create conversation — database unavailable" },
      { status: 500 }
    );
  }
  return NextResponse.json(conv, { status: 201 });
}
