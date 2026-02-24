/**
 * app/api/openclaw/test-connection/route.ts
 * Tests reachability of a gateway URL.
 * Body: { url?: string; token?: string }
 * If url/token are omitted, falls back to current persisted settings.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export async function POST(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { url?: string; token?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — we'll use stored settings
  }

  const settings = getSettings();
  const url = body.url?.trim() || settings.OPENCLAW_GATEWAY_URL;
  const token = body.token?.trim() || settings.OPENCLAW_GATEWAY_TOKEN;

  if (!url) {
    return NextResponse.json({ ok: false, message: "No gateway URL configured" });
  }

  const probe = (path: string) =>
    fetch(`${url}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });

  try {
    // Try /health first, then root
    for (const path of ["/health", "/"]) {
      let res: Response | null = null;
      try {
        res = await probe(path);
      } catch {
        continue;
      }
      if (res.ok) {
        let detail = "";
        try {
          const data = await res.clone().json() as { status?: string };
          if (data.status) detail = ` (status: ${data.status})`;
        } catch { /* non-JSON body is fine */ }
        return NextResponse.json({
          ok: true,
          message: `Gateway reachable${detail}`,
        });
      }
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json({
          ok: false,
          message: `Gateway responded HTTP ${res.status} — check your token`,
        });
      }
    }

    return NextResponse.json({
      ok: false,
      message: "Gateway unreachable — /health and / both failed",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return NextResponse.json({ ok: false, message: msg });
  }
}
