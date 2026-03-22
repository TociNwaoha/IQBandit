/**
 * app/api/webhooks/stripe/route.ts
 * Handles Stripe webhook events for subscription lifecycle management.
 *
 * ALWAYS returns 200 — Stripe will retry on non-200.
 * Raw body is read before any parsing (required for signature verification).
 */

export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { randomBytes } from "crypto";
import { stripe } from "@/lib/stripe";
import {
  getUserBillingByCustomerId,
  updateUserBilling,
} from "@/lib/billing";
import {
  getInstanceByUserId,
  createInstance,
  updateInstance,
} from "@/lib/instances";
import {
  allocatePort,
  ensureDataDirs,
  createUserContainer,
  pauseUserContainer,
  resumeUserContainer,
} from "@/lib/container-manager";
import { installDefaultSkills } from "@/lib/skill-installer";
import { getPlanLimits, type PlanId } from "@/lib/plans";
import { runCommand } from "@/lib/ssh";

const VALID_PLANS: readonly string[] = ["free", "starter", "pro", "bandit_plus"];

function isValidPlan(value: unknown): value is PlanId {
  return typeof value === "string" && VALID_PLANS.includes(value);
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Must read raw body BEFORE any parsing — required for signature verification
  const body = await request.text();
  const sig  = request.headers.get("stripe-signature");

  if (!sig) {
    console.error("[stripe/webhook] Missing stripe-signature header");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("[stripe/webhook] Signature verification failed:", (err as Error).message);
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      default:
        // Unhandled event type — ignore silently
        break;
    }
  } catch (err) {
    console.error(`[stripe/webhook] Error handling ${event.type}:`, err);
    // Still return 200 so Stripe doesn't retry
  }

  return NextResponse.json({ received: true }, { status: 200 });
}

// ─── handlers ─────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session
): Promise<void> {
  const { userId, planId, interval } = session.metadata ?? {};
  const subscriptionId = session.subscription as string | null;

  if (!userId || !planId || !subscriptionId) {
    console.error("[stripe/webhook] checkout.session.completed: missing metadata", session.id);
    return;
  }

  // Retrieve subscription's latest invoice for the billing period end
  // (current_period_end was removed in Stripe API 2026 — use invoice.period_end)
  const sub = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ["latest_invoice"],
  });
  const latestInvoice = sub.latest_invoice as Stripe.Invoice | null;
  const currentPeriodEnd = latestInvoice?.period_end
    ? new Date(latestInvoice.period_end * 1000).toISOString()
    : null;

  updateUserBilling(userId, {
    plan: planId,
    planInterval: interval ?? null,
    subscriptionId,
    subscriptionStatus: "active",
    currentPeriodEnd,
  });

  // Container provisioning / resource update
  const instance = getInstanceByUserId(userId);

  if (!instance) {
    // No container yet — provision one now (e.g., user went straight to paid plan)
    const gatewayToken = randomBytes(32).toString("hex");
    const vpsHost      = process.env.VPS_HOST;

    if (!vpsHost) {
      console.error("[stripe/webhook] checkout.session.completed: VPS_HOST not configured");
      return;
    }

    const safeplan = isValidPlan(planId) ? planId : "starter";
    const hostPort = allocatePort();
    const containerName = `openclaw-user-${userId}`;

    try {
      await ensureDataDirs(userId);
      await createUserContainer(userId, gatewayToken, hostPort, safeplan);
    } catch (err) {
      console.error("[stripe/webhook] checkout.session.completed: Docker error:", err);
      return;
    }

    const openclaw_url = `http://${vpsHost}:${hostPort}`;
    createInstance({
      user_id:             userId,
      tier:                safeplan,
      plan:                safeplan,
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

    installDefaultSkills(userId).catch((err) => {
      console.error("[stripe/webhook] installDefaultSkills failed:", err);
    });

    console.log(`[stripe] checkout.session.completed userId=${userId} plan=${safeplan} (new container)`);
  } else {
    // Container exists — update resources
    const safeplan = isValidPlan(planId) ? planId : "starter";
    const limits   = getPlanLimits(safeplan);
    const containerName = instance.container_name ?? `openclaw-user-${userId}`;

    try {
      await runCommand(
        `docker update --memory ${limits.memory} --cpus ${limits.cpus} ${containerName}`
      );
    } catch (err) {
      console.error("[stripe/webhook] docker update failed:", err);
    }

    updateInstance(instance.id, { plan: safeplan });
    console.log(`[stripe] checkout.session.completed userId=${userId} plan=${safeplan} (existing container updated)`);
  }
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription
): Promise<void> {
  const { userId, planId, interval } = sub.metadata;

  if (!userId) {
    console.error("[stripe/webhook] customer.subscription.updated: missing userId metadata");
    return;
  }

  // current_period_end removed in Stripe API 2026 — period end is tracked via invoice events
  updateUserBilling(userId, {
    subscriptionStatus: sub.status,
    ...(planId ? { plan: planId, planInterval: interval ?? null } : {}),
  });

  // If reactivated and container is paused — unpause
  if (sub.status === "active") {
    const instance = getInstanceByUserId(userId);
    if (instance?.status === "paused") {
      try {
        await resumeUserContainer(userId);
        updateInstance(instance.id, { status: "running" });
      } catch (err) {
        console.error("[stripe/webhook] docker unpause failed:", err);
      }
    }
  }

  console.log(`[stripe] customer.subscription.updated userId=${userId} status=${sub.status}`);
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription
): Promise<void> {
  const { userId } = sub.metadata;

  if (!userId) {
    console.error("[stripe/webhook] customer.subscription.deleted: missing userId metadata");
    return;
  }

  updateUserBilling(userId, {
    plan: "free",
    planInterval: null,
    subscriptionId: null,
    subscriptionStatus: "cancelled",
    // Keep currentPeriodEnd so UI can show "access until" date
  });

  // Downgrade instance plan to free (container keeps running until period end)
  const instance = getInstanceByUserId(userId);
  if (instance) {
    updateInstance(instance.id, { plan: "free" as PlanId });
  }

  // TODO: implement cron job to pause container at current_period_end

  console.log(`[stripe] customer.subscription.deleted userId=${userId}`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const customerId = invoice.customer as string;
  const billing    = getUserBillingByCustomerId(customerId);

  if (!billing) {
    console.error("[stripe/webhook] invoice.payment_failed: no billing for customer", customerId);
    return;
  }

  const userId = billing.user_id;
  updateUserBilling(userId, { subscriptionStatus: "past_due" });

  // Pause the container
  const instance = getInstanceByUserId(userId);
  if (instance?.status === "running") {
    try {
      await pauseUserContainer(userId);
      updateInstance(instance.id, { status: "paused" });
    } catch (err) {
      console.error("[stripe/webhook] docker pause failed:", err);
    }
  }

  console.log(`[stripe] payment_failed userId=${userId}`);
}

async function handlePaymentSucceeded(
  invoice: Stripe.Invoice
): Promise<void> {
  const customerId = invoice.customer as string;
  const billing    = getUserBillingByCustomerId(customerId);

  if (!billing) return; // Customer not in our DB — ignore

  const userId = billing.user_id;

  // Use invoice.period_end for current period tracking (2026 API — no sub.current_period_end)
  if (invoice.period_end) {
    const currentPeriodEnd = new Date(invoice.period_end * 1000).toISOString();
    updateUserBilling(userId, { currentPeriodEnd });
  }

  // If subscription was past_due, reactivate
  if (billing.subscription_status === "past_due") {
    updateUserBilling(userId, { subscriptionStatus: "active" });

    const instance = getInstanceByUserId(userId);
    if (instance?.status === "paused") {
      try {
        await resumeUserContainer(userId);
        updateInstance(instance.id, { status: "running" });
      } catch (err) {
        console.error("[stripe/webhook] docker unpause failed:", err);
      }
    }
  }
}
