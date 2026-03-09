/**
 * app/api/conversations/[id]/messages/route.ts
 * GET — return messages for a conversation, oldest first.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getMessages } from "@/lib/conversations";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  return NextResponse.json(getMessages(id));
}
