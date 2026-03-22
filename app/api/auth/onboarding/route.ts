/**
 * app/api/auth/onboarding/route.ts
 * Saves onboarding data and provisions the user's free-tier container.
 * POST — requires auth.
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getUserFromRequest } from "@/lib/auth-helpers";
import { updateUser } from "@/lib/user-db";
import { updateUserBilling } from "@/lib/billing";
import { getInstanceByUserId, createInstance } from "@/lib/instances";
import {
  allocatePort,
  ensureDataDirs,
  createUserContainer,
} from "@/lib/container-manager";
import { installDefaultSkills } from "@/lib/skill-installer";
import type { PlanId } from "@/lib/plans";

const VALID_PLANS: readonly string[] = ["free", "starter", "pro", "bandit_plus"];

export async function POST(request: NextRequest) {
  const auth = await getUserFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; useCase?: string; agentName?: string; planId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { name, useCase, agentName, planId } = body;

  if (!name || !useCase || !agentName || !planId) {
    return NextResponse.json(
      { error: "name, useCase, agentName, and planId are required" },
      { status: 400 }
    );
  }

  if (!VALID_PLANS.includes(planId)) {
    return NextResponse.json({ error: "Invalid planId" }, { status: 400 });
  }

  const { userId } = auth;

  // Persist onboarding data
  updateUser(userId, {
    name:           name.trim(),
    useCase:        useCase.trim(),
    agentName:      agentName.trim(),
    onboardingDone: 1,
    updatedAt:      new Date().toISOString(),
  });

  // Update billing plan
  updateUserBilling(userId, { plan: planId });

  // Provision free-tier container (every user gets one — paid upgrades happen via Stripe webhook)
  const existingInstance = getInstanceByUserId(userId);

  if (!existingInstance) {
    const vpsHost = process.env.VPS_HOST;
    if (!vpsHost) {
      console.error("[auth] onboarding: VPS_HOST not configured — skipping container provision");
    } else {
      const gatewayToken  = randomBytes(32).toString("hex");
      const hostPort      = allocatePort();
      const containerName = `openclaw-user-${userId}`;
      const safeplan      = (VALID_PLANS.includes(planId) ? planId : "free") as PlanId;

      try {
        await ensureDataDirs(userId);
        await createUserContainer(userId, gatewayToken, hostPort, "free" as PlanId);
      } catch (err) {
        console.error("[auth] onboarding: Docker error:", err);
        // Non-fatal — container can be re-provisioned later
      }

      createInstance({
        user_id:             userId,
        tier:                "free" as PlanId,
        plan:                "free" as PlanId,
        status:              "running",
        container_name:      containerName,
        host_port:           hostPort,
        gateway_token:       gatewayToken,
        subdomain:           null,
        openclaw_url:        `http://${vpsHost}:${hostPort}`,
        contabo_instance_id: null,
        ip_address:          null,
        cancelled_at:        null,
      });

      // Non-blocking skill install
      installDefaultSkills(userId).catch((err) => {
        console.error("[auth] onboarding: installDefaultSkills failed:", err);
      });

      console.log(`[auth] onboarding complete userId=${userId} plan=${safeplan} (new container)`);
    }
  } else {
    console.log(`[auth] onboarding complete userId=${userId} plan=${planId} (existing container)`);
  }

  const requiresPayment = planId !== "free";

  return NextResponse.json({
    success:         true,
    requiresPayment,
    planId:          requiresPayment ? planId : undefined,
  });
}
