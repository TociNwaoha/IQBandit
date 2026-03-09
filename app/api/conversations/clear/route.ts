/**
 * app/api/conversations/clear/route.ts
 * DELETE — clear all messages for a conversation (conversation row is kept).
 *
 * Body: { conversationId: string }
 * Auth: session required.
 */

import { NextRequest, NextResponse }                    from "next/server";
import { getSession }                                   from "@/lib/auth";
import { getConversation, clearConversationMessages }   from "@/lib/conversations";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function DELETE(request: NextRequest) {
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

  const raw            = body as Record<string, unknown>;
  const conversationId = typeof raw.conversationId === "string" ? raw.conversationId.trim() : "";

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400, headers: NO_STORE });
  }

  const conv = getConversation(conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404, headers: NO_STORE });
  }

  clearConversationMessages(conversationId);

  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
