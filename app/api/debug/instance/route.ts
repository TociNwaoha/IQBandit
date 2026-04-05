/**
 * app/api/debug/instance/route.ts
 *
 * Diagnostic endpoint — returns the instance record the chat route uses
 * to reach the user's OpenClaw container, plus a live connectivity probe
 * against that URL.
 *
 * Auth-gated (session cookie required). Safe in production.
 * gateway_token is never returned — only a boolean indicating whether it is set.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getInstanceByUserId } from "@/lib/instances";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

async function probeUrl(base: string): Promise<{ reachable: boolean; detail: string }> {
  for (const path of ["/health", "/"]) {
    try {
      const res = await fetch(`${base}${path}`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      if (res.ok) return { reachable: true, detail: `HTTP ${res.status} on ${path}` };
      if (res.status === 401 || res.status === 403) {
        return { reachable: true, detail: `HTTP ${res.status} on ${path} — gateway up, check token` };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("ECONNREFUSED") && !msg.includes("fetch failed") && !msg.includes("ETIMEDOUT")) {
        return { reachable: false, detail: msg };
      }
      // ECONNREFUSED on /health — try / before giving up
    }
  }
  return { reachable: false, detail: "ECONNREFUSED (both /health and / refused)" };
}

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId   = getCurrentUserIdFromSession(session);
  const instance = getInstanceByUserId(userId);
  const settings = getSettings();

  const instanceInfo = instance
    ? {
        status:            instance.status,
        openclaw_url:      instance.openclaw_url ?? null,
        host_port:         instance.host_port ?? null,
        container_name:    instance.container_name ?? null,
        gateway_token_set: !!instance.gateway_token,
        created_at:        instance.created_at,
        updated_at:        instance.updated_at,
      }
    : null;

  // Determine the URL the chat route would actually use
  const activeUrl =
    instance?.status === "running" && instance.openclaw_url && instance.gateway_token
      ? instance.openclaw_url
      : settings.OPENCLAW_GATEWAY_URL;

  let probe: { url_probed: string; reachable: boolean; detail: string } | null = null;
  if (activeUrl) {
    const result = await probeUrl(activeUrl);
    probe = { url_probed: activeUrl, ...result };
  }

  return NextResponse.json(
    {
      user_id:      userId,
      instance:     instanceInfo,
      probe,
      fallback_url: settings.OPENCLAW_GATEWAY_URL,
    },
    { headers: { "Cache-Control": "no-store, private" } }
  );
}
