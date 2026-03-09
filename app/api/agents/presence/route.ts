/**
 * app/api/agents/presence/route.ts
 * GET — returns presence states for a set of agents.
 *
 * Query params (mutually exclusive):
 *   ?agentIds=<id1,id2,...>   — fetch presence for specific agent IDs
 *   ?department=<dept>        — fetch presence for all agents in a department
 *
 * Response: { presence: Record<agentId, AgentPresence> }
 */

import { NextRequest, NextResponse }      from "next/server";
import { getSession }                    from "@/lib/auth";
import { getPresenceForAgents }          from "@/lib/presence";
import { listAgentsByDepartment }        from "@/lib/agents";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const { searchParams } = request.nextUrl;
  const agentIdsParam    = searchParams.get("agentIds")   ?? "";
  const department       = searchParams.get("department") ?? "";

  let agentIds: string[] = [];

  if (agentIdsParam) {
    agentIds = agentIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
  } else if (department) {
    const agents = listAgentsByDepartment(department);
    agentIds     = agents.map((a) => a.id);
  }

  const presence = getPresenceForAgents(agentIds);

  return NextResponse.json({ presence }, { headers: NO_STORE });
}
