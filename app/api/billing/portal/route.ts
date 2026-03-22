/**
 * app/api/billing/portal/route.ts
 * Creates a Stripe Customer Portal session for managing subscriptions.
 *
 * POST /api/billing/portal
 * Returns: { url: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { stripe } from "@/lib/stripe";
import { getUserBilling } from "@/lib/billing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getCurrentUserIdFromSession(session);
  const billing = getUserBilling(userId);

  if (!billing?.stripe_customer_id) {
    return NextResponse.json(
      { error: "No billing account found. Please subscribe first." },
      { status: 400 }
    );
  }

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer:      billing.stripe_customer_id,
      configuration: process.env.STRIPE_PORTAL_CONFIG_ID,
      return_url:    `${APP_URL}/dashboard/billing`,
    });

    return NextResponse.json({ url: portalSession.url });
  } catch (err) {
    console.error("[billing/portal] stripe.billingPortal.sessions.create failed:", err);
    return NextResponse.json(
      { error: "Failed to create portal session" },
      { status: 500 }
    );
  }
}
