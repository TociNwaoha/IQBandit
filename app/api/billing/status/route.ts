/**
 * app/api/billing/status/route.ts
 * Returns the billing status for the authenticated user.
 *
 * GET /api/billing/status
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { getUserBilling } from "@/lib/billing";
import { PLAN_ORDER } from "@/lib/stripe";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getCurrentUserIdFromSession(session);
  const billing = getUserBilling(userId);

  const plan               = billing?.plan               ?? "free";
  const planInterval       = billing?.plan_interval      ?? null;
  const subscriptionStatus = billing?.subscription_status ?? null;
  const currentPeriodEnd   = billing?.current_period_end  ?? null;

  const hasActiveSubscription =
    subscriptionStatus === "active" || subscriptionStatus === "past_due";

  // Available upgrades: all plans higher than current in PLAN_ORDER, excluding 'free'
  const currentIdx = PLAN_ORDER.indexOf(plan as (typeof PLAN_ORDER)[number]);
  const availableUpgrades = PLAN_ORDER.slice(
    Math.max(currentIdx + 1, 1) // always skip 'free' (index 0)
  ) as string[];

  return NextResponse.json({
    plan,
    planInterval,
    subscriptionStatus,
    currentPeriodEnd,
    hasActiveSubscription,
    canUpgrade: availableUpgrades.length > 0,
    availableUpgrades,
  });
}
