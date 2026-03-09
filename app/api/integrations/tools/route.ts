/**
 * app/api/integrations/tools/route.ts
 * GET — lists all tool-router-supported providers with their connection status
 *       and available actions.
 *
 * Intended for discovery: debugging, future chat agent planning, and the
 * /integrations page "available actions" hint.
 *
 * No sensitive data is returned — tokens are never exposed.
 *
 * Response (200):
 * {
 *   providers: Array<{
 *     provider_id:       string
 *     display_name:      string
 *     connected:         boolean
 *     connection_status: "connected" | "expired" | "error" | "disconnected" | null
 *     account_label:     string | null
 *     actions:           Array<{ id: string, display_name: string, description: string }>
 *                        (populated only when status === "connected")
 *   }>
 *   total_connected: number
 *   total_actions:   number   — sum of actions across connected providers
 * }
 *
 * Error responses:
 *   401 — no session
 */

import { NextRequest, NextResponse }  from "next/server";
import { getSession }                 from "@/lib/auth";
import { getProvider }                from "@/lib/integrations/providerRegistry";
import { getConnectionByProvider }    from "@/lib/integrations/connections";
import {
  listSupportedProviderIds,
  getActionsForProvider,
  type ToolActionDef,
  type InputFieldSchema,
}                                     from "@/lib/integrations/toolRouter";

const USER_ID = "default";
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

interface ActionItem {
  id:           string;
  display_name: string;
  description:  string;
  /** Field definitions for the panel form — matches InputFieldSchema exactly. */
  input_schema: InputFieldSchema[];
}

interface ProviderItem {
  provider_id:       string;
  display_name:      string;
  connected:         boolean;
  connection_status: string | null;
  account_label:     string | null;
  actions:           ActionItem[];
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const providerIds = listSupportedProviderIds();

  const providers: ProviderItem[] = providerIds.map((pid) => {
    const registryEntry = getProvider(pid);
    const conn          = getConnectionByProvider(pid, USER_ID);
    const actions       = getActionsForProvider(pid) ?? [];
    const connected     = conn?.status === "connected";

    return {
      provider_id:       pid,
      display_name:      registryEntry?.displayName ?? pid,
      connected,
      connection_status: conn?.status ?? null,
      account_label:     (connected ? conn?.account_label : null) ?? null,
      // Only expose available actions for connected providers; omit backend-only actions
      actions: connected
        ? actions
            .filter((a: ToolActionDef) => !a.uiHidden)
            .map((a: ToolActionDef): ActionItem => ({
              id:           a.id,
              display_name: a.displayName,
              description:  a.description,
              input_schema: a.inputSchema,
            }))
        : [],
    };
  });

  const totalConnected = providers.filter((p) => p.connected).length;
  const totalActions   = providers.reduce((sum, p) => sum + p.actions.length, 0);

  return NextResponse.json(
    { providers, total_connected: totalConnected, total_actions: totalActions },
    { headers: NO_STORE },
  );
}
