/**
 * app/api/billing/checkout/route.ts
 * Creates a Stripe Checkout session for subscription purchase.
 *
 * POST /api/billing/checkout
 * Body: { planId: 'starter' | 'pro' | 'bandit_plus', interval: 'monthly' | 'annual' }
 * Returns: { url: string }
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getCurrentUserIdFromSession } from "@/lib/users";
import { stripe, STRIPE_PRICES, isPaidPlanId, isBillingInterval } from "@/lib/stripe";
import { createOrGetStripeCustomer } from "@/lib/billing";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession(request);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getCurrentUserIdFromSession(session);
  const email  = session.email;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { planId, interval } = body as Record<string, unknown>;

  if (!isPaidPlanId(planId)) {
    return NextResponse.json(
      { error: "Invalid planId. Must be starter, pro, or bandit_plus." },
      { status: 400 }
    );
  }
  if (!isBillingInterval(interval)) {
    return NextResponse.json(
      { error: "Invalid interval. Must be monthly or annual." },
      { status: 400 }
    );
  }

  const priceId = STRIPE_PRICES[planId][interval];
  if (!priceId) {
    return NextResponse.json(
      { error: "Price not configured on server. Check Stripe env vars." },
      { status: 500 }
    );
  }

  let stripeCustomerId: string;
  try {
    stripeCustomerId = await createOrGetStripeCustomer(userId, email);
  } catch (err) {
    console.error("[billing/checkout] createOrGetStripeCustomer failed:", err);
    return NextResponse.json(
      { error: "Failed to create Stripe customer" },
      { status: 500 }
    );
  }

  try {
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${APP_URL}/dashboard?upgrade=success&plan=${planId}`,
      cancel_url:  `${APP_URL}/dashboard/billing?upgrade=cancelled`,
      metadata: { userId, planId, interval },
      subscription_data: {
        metadata: { userId, planId, interval },
      },
      allow_promotion_codes: true,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (err) {
    console.error("[billing/checkout] stripe.checkout.sessions.create failed:", err);
    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
