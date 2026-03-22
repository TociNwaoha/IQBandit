/**
 * lib/stripe.ts
 * Stripe client singleton and plan/price helpers.
 * SERVER-SIDE ONLY — never import in "use client" components.
 */

import Stripe from "stripe";

// ─── client ───────────────────────────────────────────────────────────────────

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

// ─── price map ────────────────────────────────────────────────────────────────

export const STRIPE_PRICES = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_STARTER_ANNUAL!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_PRO_ANNUAL!,
  },
  bandit_plus: {
    monthly: process.env.STRIPE_PRICE_BANDIT_PLUS_MONTHLY!,
    annual:  process.env.STRIPE_PRICE_BANDIT_PLUS_ANNUAL!,
  },
} as const;

export type PaidPlanId = keyof typeof STRIPE_PRICES;
export type BillingInterval = "monthly" | "annual";

// ─── plan order ───────────────────────────────────────────────────────────────

export const PLAN_ORDER = ["free", "starter", "pro", "bandit_plus"] as const;
export type PlanOrderId = (typeof PLAN_ORDER)[number];

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Reverse-lookup: priceId → planId, or null if not found. */
export function getPlanFromPriceId(priceId: string): string | null {
  for (const [planId, intervals] of Object.entries(STRIPE_PRICES)) {
    if (intervals.monthly === priceId || intervals.annual === priceId) {
      return planId;
    }
  }
  return null;
}

/** Reverse-lookup: priceId → billing interval, or null if not found. */
export function getIntervalFromPriceId(priceId: string): BillingInterval | null {
  for (const intervals of Object.values(STRIPE_PRICES)) {
    if (intervals.monthly === priceId) return "monthly";
    if (intervals.annual === priceId) return "annual";
  }
  return null;
}

/**
 * Returns true if newPlan is higher than currentPlan in PLAN_ORDER.
 * Both plans must be valid PLAN_ORDER entries.
 */
export function isPlanUpgrade(currentPlan: string, newPlan: string): boolean {
  const currentIdx = PLAN_ORDER.indexOf(currentPlan as PlanOrderId);
  const newIdx     = PLAN_ORDER.indexOf(newPlan as PlanOrderId);
  return currentIdx !== -1 && newIdx !== -1 && newIdx > currentIdx;
}

/** Type guard: is value a paid plan ID? */
export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return (
    value === "starter" || value === "pro" || value === "bandit_plus"
  );
}

/** Type guard: is value a valid billing interval? */
export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}
