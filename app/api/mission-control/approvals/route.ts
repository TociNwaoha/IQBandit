/**
 * GET  /api/mission-control/approvals   — list approvals (filter by ?status=pending|approved|denied)
 * POST /api/mission-control/approvals   — create an approval policy (body.type === "policy")
 */

import { NextRequest, NextResponse }   from "next/server";
import { getSession }                  from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import {
  listApprovals,
  listApprovalPolicies,
  upsertApprovalPolicy,
  type ApprovalStatus,
} from "@/lib/approvals";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);
  const sp     = request.nextUrl.searchParams;
  const status  = sp.get("status") as ApprovalStatus | null;
  const mode    = sp.get("mode"); // "policies" to list policies instead

  if (mode === "policies") {
    const policies = listApprovalPolicies(userId);
    return NextResponse.json({ policies }, { headers: NO_STORE });
  }

  const approvals = listApprovals(
    userId,
    {
      status:      status ?? undefined,
      provider_id: sp.get("provider_id") ?? undefined,
      action:      sp.get("action") ?? undefined,
    },
    200,
  );
  return NextResponse.json({ approvals }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const userId = getCurrentUserIdFromSession(session);

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400, headers: NO_STORE });
  }
  const raw = body as Record<string, unknown>;

  if (raw.type !== "policy") {
    return NextResponse.json({ error: '"type" must be "policy"' }, { status: 400, headers: NO_STORE });
  }

  const ALLOWED = new Set(["type","name","enabled","match_provider_id","match_action","threshold_type","threshold_value","require_approval","notes","id"]);
  const unknown = Object.keys(raw).filter((k) => !ALLOWED.has(k));
  if (unknown.length > 0) {
    return NextResponse.json({ error: `Unknown field(s): ${unknown.map((k) => `"${k}"`).join(", ")}` }, { status: 400, headers: NO_STORE });
  }

  if (!raw.name || typeof raw.name !== "string") {
    return NextResponse.json({ error: '"name" is required and must be a string' }, { status: 400, headers: NO_STORE });
  }

  const policy = upsertApprovalPolicy(userId, {
    id:                raw.id                as string | undefined,
    name:              (raw.name as string).trim().slice(0, 100),
    enabled:           raw.enabled !== false,
    match_provider_id: (raw.match_provider_id as string | undefined) ?? "*",
    match_action:      (raw.match_action      as string | undefined) ?? "*",
    threshold_type:    (raw.threshold_type    as string | undefined) ?? "",
    threshold_value:   typeof raw.threshold_value === "number" ? raw.threshold_value : 0,
    require_approval:  raw.require_approval !== false,
    notes:             (raw.notes as string | undefined) ?? "",
  });

  if (!policy) {
    return NextResponse.json({ error: "Failed to save policy" }, { status: 500, headers: NO_STORE });
  }
  return NextResponse.json({ policy }, { status: 201, headers: NO_STORE });
}
