/**
 * app/api/openclaw/health/route.ts
 * Proxies a health check to the OpenClaw gateway.
 * Requires an authenticated session — gateway token never leaves the server.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { checkGatewayHealth } from "@/lib/openclaw";

export async function GET(request: NextRequest) {
  // Require authentication before exposing gateway status
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const health = await checkGatewayHealth();
    return NextResponse.json(health, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Gateway unreachable";

    return NextResponse.json(
      { status: "down", message },
      { status: 502 }
    );
  }
}
