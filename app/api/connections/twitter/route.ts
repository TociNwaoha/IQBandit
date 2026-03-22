/**
 * app/api/connections/twitter/route.ts
 * Manage X/Twitter API credentials for the authenticated user.
 *
 * POST   — save credentials (tests them first, then injects into container)
 * DELETE — remove credentials and wipe from container env
 * GET    — return connection status (handle, name; no secrets)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { testConnection } from "@/lib/twitter";
import { saveConnection, deleteConnection, getConnectionStatus } from "@/lib/connections";
import { runCommand } from "@/lib/ssh";
import { getInstanceByUserId } from "@/lib/instances";

// ─── GET — connection status ──────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const status = getConnectionStatus(userId, "twitter");
  return NextResponse.json(status);
}

// ─── POST — save credentials ──────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  let body: { apiKey?: string; apiSecret?: string; accessToken?: string; accessSecret?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { apiKey, apiSecret, accessToken, accessSecret } = body;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) {
    return NextResponse.json(
      { error: "apiKey, apiSecret, accessToken, and accessSecret are all required" },
      { status: 400 }
    );
  }

  const credentials = { apiKey, apiSecret, accessToken, accessSecret };

  // Test credentials against the Twitter API before saving
  const test = await testConnection(credentials);
  if (!test.success) {
    return NextResponse.json(
      { error: "Invalid credentials — Twitter API rejected the keys" },
      { status: 400 }
    );
  }

  // Encrypt and store in SQLite
  saveConnection(userId, "twitter", credentials, test.handle, test.name);

  // Inject credentials into the user's container .env (config volume)
  // The config volume maps /home/iqbandit/users/{userId}/config → /home/node/.openclaw
  // OpenClaw reads /home/node/.openclaw/.env on startup
  const instance = getInstanceByUserId(userId);
  if (instance?.status === "running") {
    try {
      const envPath = `/home/iqbandit/users/${userId}/config/.env`;
      await runCommand(`echo "X_API_KEY=${apiKey}" >> ${envPath}`);
      await runCommand(`echo "X_API_SECRET=${apiSecret}" >> ${envPath}`);
      await runCommand(`echo "X_ACCESS_TOKEN=${accessToken}" >> ${envPath}`);
      await runCommand(`echo "X_ACCESS_SECRET=${accessSecret}" >> ${envPath}`);
      await runCommand(`docker restart openclaw-user-${userId}`);
      console.log(`[connections/twitter] Injected X credentials into container for user ${userId}`);
    } catch (err) {
      // Non-fatal — credentials are saved in DB; user can re-provision to pick them up
      console.error("[connections/twitter] Failed to inject credentials into container:", err);
    }
  }

  return NextResponse.json({ success: true, handle: test.handle, name: test.name });
}

// ─── DELETE — remove credentials ─────────────────────────────────────────────

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  // Remove from SQLite
  deleteConnection(userId, "twitter");

  // Remove keys from container .env by rewriting it without X_ keys
  const instance = getInstanceByUserId(userId);
  if (instance?.status === "running") {
    try {
      const envPath = `/home/iqbandit/users/${userId}/config/.env`;
      // Remove all X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET lines
      await runCommand(
        `sed -i '/^X_API_KEY=/d; /^X_API_SECRET=/d; /^X_ACCESS_TOKEN=/d; /^X_ACCESS_SECRET=/d' ${envPath} 2>/dev/null || true`
      );
      await runCommand(`docker restart openclaw-user-${userId}`);
      console.log(`[connections/twitter] Removed X credentials from container for user ${userId}`);
    } catch (err) {
      console.error("[connections/twitter] Failed to remove credentials from container:", err);
    }
  }

  return NextResponse.json({ success: true });
}
