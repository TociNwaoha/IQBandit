/**
 * PATCH /api/mission-control/approvals/[id]
 * Approve or deny a pending approval request.
 * Body: { decision: "approved" | "denied", reason?: string }
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { decideApproval, getApprovalById } from "@/lib/approvals";

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

  const ALLOWED = new Set(["decision", "reason"]);
  const unknown = Object.keys(raw).filter((k) => !ALLOWED.has(k));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.map((k) => `"${k}"`).join(", ")}` }, { status: 400, headers: NO_STORE });
  }

  if (raw.decision !== "approved" && raw.decision !== "denied") {
    return NextResponse.json({ error: '"decision" must be "approved" or "denied"' }, { status: 400, headers: NO_STORE });
  }

  const existing = getApprovalById(id, userId);
  if (!existing) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404, headers: NO_STORE });
  }

  const reason  = typeof raw.reason === "string" ? raw.reason : "";
  const updated = decideApproval(id, userId, raw.decision, reason);

  if (!updated) {
    return NextResponse.json(
      { error: "Could not update approval — it may not be in pending status" },
      { status: 409, headers: NO_STORE },
    );
  }

  return NextResponse.json({ approval: updated }, { headers: NO_STORE });
}
