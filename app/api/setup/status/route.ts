/**
 * app/api/setup/status/route.ts
 * Returns whether the setup wizard has been completed and whether any
 * gateway config exists. Used by the /setup wizard on first load.
 * SERVER-SIDE ONLY — reads from SQLite via getSettings().
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const settings = getSettings();

  // Wizard has been explicitly finished
  const configured = settings.SETUP_WIZARD_DONE === "true";

  // Any meaningful config exists (token is the key signal — URL has a default)
  const hasConfig = Boolean(settings.OPENCLAW_GATEWAY_TOKEN);

  return NextResponse.json({ configured, hasConfig });
}
