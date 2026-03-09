/**
 * app/api/conversations/export/route.ts
 * GET — export a conversation as a Markdown file download.
 *
 * Query param: ?conversationId=<id>
 * Also requires ?agentName=<name> (for the markdown header).
 * Auth: session required.
 *
 * Returns: Content-Disposition: attachment; filename="<title>.md"
 */

import { NextRequest, NextResponse }              from "next/server";
import { getSession }                             from "@/lib/auth";
import { getConversation, exportConversationMarkdown } from "@/lib/conversations";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const conversationId   = (searchParams.get("conversationId") ?? "").trim();
  const agentName        = (searchParams.get("agentName")       ?? "Agent").trim();

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400, headers: NO_STORE });
  }

  const conv = getConversation(conversationId);
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404, headers: NO_STORE });
  }

  const markdown = exportConversationMarkdown(conversationId, agentName);
  if (markdown === null) {
    return NextResponse.json({ error: "Export failed" }, { status: 500, headers: NO_STORE });
  }

  // Safe filename: replace any non-alphanumeric characters
  const safeTitle = conv.title.replace(/[^a-zA-Z0-9_\- ]/g, "_").slice(0, 60);
  const filename  = `${safeTitle}.md`;

  return new NextResponse(markdown, {
    status:  200,
    headers: {
      "Content-Type":        "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store, private",
    },
  });
}
