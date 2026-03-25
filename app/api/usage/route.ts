/**
 * app/api/usage/route.ts
 * Returns the authenticated user's model mode and BanditLM credit balance.
 * Used by the OfficeBuildingClient sidebar badge and the settings AI Model section.
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getUserById } from "@/lib/user-db";
import { getCurrentUserIdFromSession } from "@/lib/users";

export async function GET(request: NextRequest) {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const user   = getUserById(userId);
  const credits = user?.credits_usd ?? 5.00;

  return NextResponse.json({
    model_mode:      user?.model_mode      ?? "banditlm",
    credits_usd:     credits.toFixed(4),
    credits_display: `$${credits.toFixed(2)}`,
    empty:           credits <= 0,
    byok_provider:   user?.byok_provider   ?? null,
    byok_model_id:   user?.byok_model_id   ?? null,
  });
}
