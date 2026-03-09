/**
 * app/api/integrations/disconnect/route.ts
 * POST — marks a connection as disconnected and clears its stored tokens.
 *
 * POST body (JSON):
 * {
 *   provider_id: string  (required)
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { disconnectConnection } from "@/lib/integrations/connections";

const USER_ID = "default"; // single-admin MVP

/** Connections are user-specific; never cache. */
const NO_STORE = { "Cache-Control": "no-store, private" } as const;

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body must be a JSON object" }, { status: 400, headers: NO_STORE });
  }

  const raw = body as Record<string, unknown>;

  // Only provider_id is expected — reject anything extra.
  const unknownKeys = Object.keys(raw).filter((k) => k !== "provider_id");
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      { error: `Unknown field(s): ${unknownKeys.map((k) => `"${k}"`).join(", ")}` },
      { status: 400, headers: NO_STORE }
    );
  }

  if (!raw.provider_id || typeof raw.provider_id !== "string") {
    return NextResponse.json({ error: "provider_id is required" }, { status: 400, headers: NO_STORE });
  }

  try {
    disconnectConnection(raw.provider_id, USER_ID);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Disconnect failed";
    return NextResponse.json({ error: message }, { status: 500, headers: NO_STORE });
  }
}
