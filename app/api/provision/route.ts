/**
 * app/api/provision/route.ts
 * Provision (or inspect) a user's OpenClaw container.
 *
 * POST /api/provision  — spin up a new container for the authenticated user
 * GET  /api/provision  — return the current instance row for the user
 *
 * TODO: connect POST to Stripe webhook — call after payment_intent.succeeded
 */

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import {
  getInstanceByUserId,
  getAnyInstanceByUserId,
  createInstance,
} from "@/lib/instances";
import {
  allocatePort,
  ensureDataDirs,
  createUserContainer,
} from "@/lib/container-manager";

// ─── POST — provision ─────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);

  let tier: "starter" | "pro" = "starter";
  try {
    const body = await request.json();
    if (body.tier === "pro") tier = "pro";
  } catch {
    // body is optional
  }

  // Guard: no double-provisioning
  const existing = getInstanceByUserId(userId);
  if (existing) {
    return NextResponse.json(
      {
        error: "An active instance already exists for this user",
        instance: existing,
      },
      { status: 409 }
    );
  }

  // Cryptographically random gateway token (64 hex chars)
  const gatewayToken = randomBytes(32).toString("hex");

  // ── Starter tier ────────────────────────────────────────────────────────────
  if (tier === "starter") {
    const vpsHost = process.env.VPS_HOST;
    if (!vpsHost) {
      return NextResponse.json(
        { error: "VPS_HOST is not configured on this server" },
        { status: 500 }
      );
    }

    const hostPort = allocatePort();
    const containerName = `openclaw-user-${userId}`;

    try {
      await ensureDataDirs(userId);
      await createUserContainer(userId, gatewayToken, hostPort);
    } catch (err) {
      console.error("[provision] Docker error:", err);
      return NextResponse.json(
        { error: "Failed to start container", detail: String(err) },
        { status: 500 }
      );
    }

    const openclaw_url = `http://${vpsHost}:${hostPort}`;

    const instance = createInstance({
      user_id:             userId,
      tier:                "starter",
      status:              "running",
      container_name:      containerName,
      host_port:           hostPort,
      gateway_token:       gatewayToken,
      subdomain:           null,
      openclaw_url,
      contabo_instance_id: null,
      ip_address:          null,
      cancelled_at:        null,
    });

    if (!instance) {
      return NextResponse.json(
        { error: "Container started but failed to save instance record" },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        url:    openclaw_url,
        token:  gatewayToken,
        status: "running",
        instance,
      },
      { status: 201 }
    );
  }

  // ── Pro tier ────────────────────────────────────────────────────────────────
  // TODO: call Contabo VPS API to provision a dedicated instance
  // See lib/contabo.ts — createVPS(), waitForVPSReady()
  const instance = createInstance({
    user_id:             userId,
    tier:                "pro",
    status:              "provisioning",
    container_name:      null,
    host_port:           null,
    gateway_token:       gatewayToken,
    subdomain:           null,
    openclaw_url:        null,
    contabo_instance_id: null,
    ip_address:          null,
    cancelled_at:        null,
  });

  if (!instance) {
    return NextResponse.json(
      { error: "Failed to save instance record" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      success: true,
      url:    null,
      token:  gatewayToken,
      status: "provisioning",
      instance,
    },
    { status: 202 }
  );
}

// ─── GET — inspect ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = getCurrentUserIdFromSession(session);
  const instance = getAnyInstanceByUserId(userId);

  return NextResponse.json({ instance });
}
