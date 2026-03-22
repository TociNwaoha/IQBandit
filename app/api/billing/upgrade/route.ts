/**
 * app/api/billing/upgrade/route.ts
 * Upgrades an existing subscription to a higher plan immediately.
 *
 * POST /api/billing/upgrade
 * Body: { planId: 'pro' | 'bandit_plus', interval: 'monthly' | 'annual' }
 * Returns: { success: true, plan: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import {
  stripe,
  STRIPE_PRICES,
  isPaidPlanId,
  isBillingInterval,
  isPlanUpgrade,
} from "@/lib/stripe";
import { getUserBilling, updateUserBilling } from "@/lib/billing";
import { getInstanceByUserId, updateInstance } from "@/lib/instances";
import { getPlanLimits, type PlanId } from "@/lib/plans";
import { runCommand } from "@/lib/ssh";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getCurrentUserIdFromSession(session);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { planId, interval } = body as Record<string, unknown>;

  if (!isPaidPlanId(planId)) {
    return NextResponse.json(
      { error: "Invalid planId. Must be pro or bandit_plus." },
      { status: 400 }
    );
  }
  if (!isBillingInterval(interval)) {
    return NextResponse.json(
      { error: "Invalid interval. Must be monthly or annual." },
      { status: 400 }
    );
  }

  const billing = getUserBilling(userId);
  if (!billing?.subscription_id || billing.subscription_status !== "active") {
    return NextResponse.json(
      { error: "No active subscription found. Use checkout to start a subscription." },
      { status: 400 }
    );
  }

  if (!isPlanUpgrade(billing.plan, planId)) {
    return NextResponse.json(
      { error: `${planId} is not an upgrade from your current plan (${billing.plan}).` },
      { status: 400 }
    );
  }

  const newPriceId = STRIPE_PRICES[planId][interval];
  if (!newPriceId) {
    return NextResponse.json(
      { error: "Price not configured on server." },
      { status: 500 }
    );
  }

  // Get current subscription from Stripe
  let subscription: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>>;
  try {
    subscription = await stripe.subscriptions.retrieve(billing.subscription_id);
  } catch (err) {
    console.error("[billing/upgrade] Failed to retrieve subscription:", err);
    return NextResponse.json(
      { error: "Failed to retrieve subscription from Stripe." },
      { status: 500 }
    );
  }

  const currentItem = subscription.items.data[0];
  if (!currentItem) {
    return NextResponse.json(
      { error: "Subscription has no items." },
      { status: 500 }
    );
  }

  // Update Stripe subscription
  try {
    await stripe.subscriptions.update(billing.subscription_id, {
      items: [{ id: currentItem.id, price: newPriceId }],
      proration_behavior: "always_invoice",
      metadata: { userId, planId, interval },
    });
  } catch (err) {
    console.error("[billing/upgrade] stripe.subscriptions.update failed:", err);
    return NextResponse.json(
      { error: "Failed to update subscription." },
      { status: 500 }
    );
  }

  // Update SQLite billing
  updateUserBilling(userId, { plan: planId, planInterval: interval });

  // Update container resources via SSH (memory + CPUs only)
  // NOTE: storage-opt cannot be changed on a running container — requires recreation
  // TODO: resize storage requires container stop, recreation with new storage-opt
  const instance = getInstanceByUserId(userId);
  if (instance?.container_name) {
    const limits = getPlanLimits(planId as PlanId);
    try {
      await runCommand(
        `docker update --memory ${limits.memory} --cpus ${limits.cpus} ${instance.container_name}`
      );
      updateInstance(instance.id, { plan: planId as PlanId });
    } catch (err) {
      // Non-fatal: log but don't fail the upgrade
      console.error("[billing/upgrade] docker update failed:", err);
    }
  }

  return NextResponse.json({ success: true, plan: planId });
}
