/**
 * app/api/agents/[id]/tools/route.ts
 * GET — fetch the tool allowlist for an agent
 * PUT — replace the complete tool allowlist (validates against provider registry)
 */

import { NextRequest, NextResponse }                  from "next/server";
import { getSession }                                 from "@/lib/auth";
import { getAgent, getAgentTools, setAgentTools }     from "@/lib/agents";
import {
  listSupportedProviderIds,
  getActionsForProvider,
}                                                     from "@/lib/integrations/toolRouter";

const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  if (!getAgent(id)) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: NO_STORE });

  return NextResponse.json({ rules: getAgentTools(id) }, { headers: NO_STORE });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });

  const { id } = await params;
  if (!getAgent(id)) return NextResponse.json({ error: "Agent not found" }, { status: 404, headers: NO_STORE });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.rules)) {
    return NextResponse.json({ error: '"rules" must be an array' }, { status: 400, headers: NO_STORE });
  }

  // Build the known provider set once for O(1) lookups
  const knownProviders = new Set(listSupportedProviderIds());

  const rules:   { provider_id: string; action_id: string }[] = [];
  const invalid: string[] = [];

  for (const r of raw.rules as unknown[]) {
    if (!r || typeof r !== "object") continue;
    const rule       = r as Record<string, unknown>;
    const providerId = typeof rule.provider_id === "string" ? rule.provider_id.trim() : "";
    const actionId   = typeof rule.action_id   === "string" && rule.action_id.trim()
                         ? rule.action_id.trim()
                         : "*";

    if (!providerId) continue;

    // Validate provider exists in registry
    if (!knownProviders.has(providerId)) {
      invalid.push(`Unknown provider: "${providerId}"`);
      continue;
    }

    // Validate action exists for this provider (wildcard always allowed)
    if (actionId !== "*") {
      const providerActions = getActionsForProvider(providerId);
      const validActionIds  = new Set(providerActions?.map((a) => a.id) ?? []);
      if (!validActionIds.has(actionId)) {
        invalid.push(`Unknown action "${actionId}" for provider "${providerId}"`);
        continue;
      }
    }

    rules.push({ provider_id: providerId, action_id: actionId });
  }

  if (invalid.length > 0) {
    return NextResponse.json(
      { error: "Validation failed", details: invalid, code: "VALIDATION_ERROR" },
      { status: 400, headers: NO_STORE },
    );
  }

  setAgentTools(id, rules);

  return NextResponse.json({ rules: getAgentTools(id) }, { headers: NO_STORE });
}
