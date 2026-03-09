/**
 * app/api/conversations/[id]/route.ts
 * PATCH  — rename a conversation (update title)
 * DELETE — delete a conversation and all its messages
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getConversation, updateConversationMeta, deleteConversation } from "@/lib/conversations";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  const conversation = getConversation(id);
  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: NO_STORE });
  }
  return NextResponse.json({ conversation }, { headers: NO_STORE });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  let title: string | undefined;
  try {
    const body = await request.json();
    if (typeof body.title === "string" && body.title.trim()) {
      title = body.title.trim();
    }
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  updateConversationMeta(id, { title });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  deleteConversation(id);
  return NextResponse.json({ ok: true });
}
