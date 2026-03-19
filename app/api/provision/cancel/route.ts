/**
 * app/api/provision/cancel/route.ts
 * Cancels a user's OpenClaw instance — pauses the container but does NOT delete it yet.
 *
 * POST /api/provision/cancel  — pause container, mark status='cancelled'
 *
 * TODO: schedule a deletion job 14 days after cancelled_at
 *       to call deleteUserContainer(userId) and mark status='deleted'
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getInstanceByUserId, updateInstance } from "@/lib/instances";
import { pauseUserContainer } from "@/lib/container-manager";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  const instance = getInstanceByUserId(userId);
  if (!instance) {
    return NextResponse.json({ error: "No active instance found for this user" }, { status: 404 });
  }

  // Pause the container on the VPS (preserves data, just freezes it)
  try {
    await pauseUserContainer(userId);
  } catch (err) {
    console.error("[provision/cancel] pause error:", err);
    // Log but don't block the cancel — container might already be stopped
  }

  // Mark as cancelled in SQLite
  updateInstance(instance.id, {
    status:       "cancelled",
    cancelled_at: new Date().toISOString(),
  });

  // TODO: schedule deletion job 14 days after cancelled_at
  // Call deleteUserContainer(userId) and set status='deleted' after grace period

  return NextResponse.json({ success: true });
}
