/**
 * app/api/connections/status/route.ts
 * Returns setup progress for all agents — used by AgentSidebar and hooks.
 *
 * GET /api/connections/status
 * Returns progress (0–100), connected platforms, and missing platforms
 * for each agent.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getConnectionStatus } from "@/lib/connections";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  const twitter = getConnectionStatus(userId, "twitter");

  return NextResponse.json({
    "research-agent": {
      progress:  100,
      connected: [],
      missing:   [],
    },
    "social-media-manager": {
      progress:  twitter.connected ? 100 : 0,
      connected: twitter.connected ? ["twitter"] : [],
      missing:   twitter.connected ? [] : ["twitter"],
      handle:    twitter.handle ?? null,
      name:      twitter.name ?? null,
    },
    "influencer-outreach": {
      progress:  0,
      connected: [],
      missing:   [],
    },
    "email-digest": {
      progress:  0,
      connected: [],
      missing:   [],
    },
  });
}
