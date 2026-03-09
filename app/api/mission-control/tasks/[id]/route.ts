/**
 * PATCH  /api/mission-control/tasks/[id] — update a task
 * DELETE /api/mission-control/tasks/[id] — delete a task
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { updateTask, deleteTask, type TaskStatus, type TaskPriority } from "@/lib/approvals";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const { id } = await params;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400, headers: NO_STORE });
  }
  const raw = body as Record<string, unknown>;

  const ALLOWED = new Set(["title","description","status","priority","agent_id","conversation_id"]);
  const unknown = Object.keys(raw).filter((k) => !ALLOWED.has(k));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.map((k) => `"${k}"`).join(", ")}` }, { status: 400, headers: NO_STORE });
  }

  const VALID_STATUS   = new Set(["backlog","planned","in_progress","blocked","done"]);
  const VALID_PRIORITY = new Set(["low","med","high"]);
  if (raw.status && !VALID_STATUS.has(raw.status as string)) {
    return NextResponse.json({ error: `"status" must be one of: ${[...VALID_STATUS].join(", ")}` }, { status: 400, headers: NO_STORE });
  }
  if (raw.priority && !VALID_PRIORITY.has(raw.priority as string)) {
    return NextResponse.json({ error: `"priority" must be one of: ${[...VALID_PRIORITY].join(", ")}` }, { status: 400, headers: NO_STORE });
  }

  const task = updateTask(id, userId, {
    title:           raw.title           as string | undefined,
    description:     raw.description     as string | undefined,
    status:          raw.status          as TaskStatus   | undefined,
    priority:        raw.priority        as TaskPriority | undefined,
    agent_id:        raw.agent_id        as string | undefined,
    conversation_id: raw.conversation_id as string | undefined,
  });

  if (!task) return NextResponse.json({ error: "Task not found or update failed" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ task }, { headers: NO_STORE });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const { id } = await params;

  const deleted = deleteTask(id, userId);
  if (!deleted) return NextResponse.json({ error: "Task not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json({ success: true }, { headers: NO_STORE });
}
