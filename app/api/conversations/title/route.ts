/**
 * app/api/conversations/title/route.ts
 * PATCH — rename a conversation thread.
 *
 * Body: { conversationId: string; title: string }
 * Auth: session required.
 * Validates conversation exists (no per-user ownership needed — single-admin MVP).
 */

import { NextRequest, NextResponse }             from "next/server";
import { getSession }                            from "@/lib/auth";
import { getConversation, setConversationTitle } from "@/lib/conversations";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function PATCH(request: NextRequest) {
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
  const title          = typeof raw.title          === "string" ? raw.title.trim()          : "";

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400, headers: NO_STORE });
  }
  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400, headers: NO_STORE });
  }

  const conv = getConversation(conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404, headers: NO_STORE });
  }

  setConversationTitle(conversationId, title);

  return NextResponse.json({ ok: true, conversationId, title: title.slice(0, 120) }, { headers: NO_STORE });
}
