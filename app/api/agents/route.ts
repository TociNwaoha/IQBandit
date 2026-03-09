/**
 * app/api/agents/route.ts
 * GET  — list all agents (optional ?department=X filter)
 * POST — create a new agent
 */

import { NextRequest, NextResponse }                   from "next/server";
import { getSession }                                  from "@/lib/auth";
import { listAgents, listAgentsByDepartment, createAgent } from "@/lib/agents";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const dept   = request.nextUrl.searchParams.get("department");
  const agents = dept ? listAgentsByDepartment(dept) : listAgents();

  return NextResponse.json({ agents }, { headers: NO_STORE });
}

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;
  if (!raw.name || typeof raw.name !== "string" || !raw.name.trim()) {
    return NextResponse.json({ error: '"name" is required' }, { status: 400, headers: NO_STORE });
  }

  const agent = createAgent({
    name:          raw.name as string,
    description:   typeof raw.description   === "string" ? raw.description   : undefined,
    system_prompt: typeof raw.system_prompt === "string" ? raw.system_prompt : undefined,
    default_model: typeof raw.default_model === "string" ? raw.default_model : undefined,
    department:    typeof raw.department    === "string" ? raw.department    : undefined,
  });

  if (!agent) {
    return NextResponse.json(
      { error: "Could not create agent — database unavailable" },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ agent }, { status: 201, headers: NO_STORE });
}
