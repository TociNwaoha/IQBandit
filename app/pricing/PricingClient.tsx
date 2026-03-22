"use client";

/**
 * app/pricing/PricingClient.tsx
 * Interactive pricing page — light theme (marketing).
 * Handles billing interval toggle and Stripe Checkout redirect.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

// ─── types ────────────────────────────────────────────────────────────────────

type Interval = "monthly" | "annual";

interface Plan {
  id: string;
  label: string;
  monthlyPrice: number;   // in dollars
  annualTotal: number;    // yearly total in dollars
  annualMonthly: number;  // per-month when billed annually
  annualSavings: number;  // savings vs monthly * 12
  tagline: string;
  popular?: boolean;
  features: { text: string; included: boolean }[];
}

// ─── plan data ────────────────────────────────────────────────────────────────

const PLANS: Plan[] = [
  {
    id:            "free",
    label:         "Free",
    monthlyPrice:  0,
    annualTotal:   0,
    annualMonthly: 0,
    annualSavings: 0,
    tagline:       "Get started for free",
    features: [
      { text: "Research Agent",           included: true  },
      { text: "512MB RAM",                included: true  },
      { text: "5GB storage",              included: true  },
      { text: "IQBandit Search (unlimited)", included: true },
      { text: "X posting",                included: false },
      { text: "Image generation",         included: false },
      { text: "All agents",               included: false },
      { text: "Priority support",         included: false },
    ],
  },
  {
    id:            "starter",
    label:         "Starter",
    monthlyPrice:  9.99,
    annualTotal:   99.90,
    annualMonthly: 8.33,
    annualSavings: 19.98,
    tagline:       "Everything you need to start posting",
    popular:       true,
    features: [
      { text: "Everything in Free",       included: true },
      { text: "All agents unlocked",      included: true },
      { text: "X posting enabled",        included: true },
      { text: "Image generation",         included: true },
      { text: "2GB RAM",                  included: true },
      { text: "40GB storage",             included: true },
      { text: "Priority support",         included: true },
    ],
  },
  {
    id:            "pro",
    label:         "Pro",
    monthlyPrice:  19.99,
    annualTotal:   199.90,
    annualMonthly: 16.66,
    annualSavings: 39.98,
    tagline:       "Advanced tools for growing creators",
    features: [
      { text: "Everything in Starter",    included: true },
      { text: "4GB RAM",                  included: true },
      { text: "80GB storage",             included: true },
      { text: "Browser control agent",    included: true },
      { text: "Advanced automations",     included: true },
    ],
  },
  {
    id:            "bandit_plus",
    label:         "Bandit Plus",
    monthlyPrice:  39.99,
    annualTotal:   399.90,
    annualMonthly: 33.33,
    annualSavings: 79.98,
    tagline:       "For power users",
    features: [
      { text: "Everything in Pro",        included: true },
      { text: "6GB RAM",                  included: true },
      { text: "160GB storage",            included: true },
      { text: "Maximum performance",      included: true },
      { text: "Early access to new features", included: true },
    ],
  },
];

// ─── components ───────────────────────────────────────────────────────────────

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-4 h-4 text-gray-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export function PricingClient({ isAuthenticated }: { isAuthenticated: boolean }) {
  const router   = useRouter();
  const [interval, setInterval] = useState<Interval>("monthly");
  const [loading, setLoading]   = useState<string | null>(null); // planId being loaded

  async function handleCTA(planId: string) {
    if (planId === "free") {
      router.push(isAuthenticated ? "/dashboard" : "/login");
      return;
    }

    if (!isAuthenticated) {
      router.push(`/login?plan=${planId}&interval=${interval}`);
      return;
    }

    setLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId, interval }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
      } else {
        console.error("[pricing] Checkout error:", data.error);
        setLoading(null);
      }
    } catch (err) {
      console.error("[pricing] Checkout fetch failed:", err);
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Minimal header */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">IQ</span>
            </div>
            <span className="text-sm font-semibold text-gray-900 hidden sm:block">IQBANDIT</span>
          </Link>
          <div className="flex items-center gap-3">
            {isAuthenticated ? (
              <Link
                href="/dashboard"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Dashboard →
              </Link>
            ) : (
              <Link
                href="/login"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-semibold text-gray-900 tracking-tight mb-3">
            Simple, transparent pricing
          </h1>
          <p className="text-lg text-gray-500">
            Start free. Upgrade when you&apos;re ready.
          </p>
        </div>

        {/* Interval toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 bg-gray-100 rounded-xl border border-gray-200">
            <button
              onClick={() => setInterval("monthly")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                interval === "monthly"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setInterval("annual")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                interval === "annual"
                  ? "bg-white text-gray-900 shadow-sm border border-gray-200"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Annual
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5">
                2 months free
              </span>
            </button>
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {PLANS.map((plan) => {
            const isFree    = plan.id === "free";
            const isPopular = plan.popular;
            const price     = interval === "monthly"
              ? plan.monthlyPrice
              : plan.annualMonthly;
            const isLoadingThis = loading === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border p-6 flex flex-col gap-5 ${
                  isPopular
                    ? "border-violet-300 shadow-md shadow-violet-100"
                    : "border-gray-200"
                }`}
              >
                {/* Popular badge */}
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-violet-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                      Most popular
                    </span>
                  </div>
                )}

                {/* Plan header */}
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">{plan.label}</p>
                  <p className="text-xs text-gray-500">{plan.tagline}</p>
                </div>

                {/* Pricing */}
                <div>
                  {isFree ? (
                    <div>
                      <span className="text-3xl font-bold text-gray-900">$0</span>
                      <span className="text-sm text-gray-500 ml-1">/mo</span>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold text-gray-900">
                          ${price.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500">/mo</span>
                      </div>
                      {interval === "annual" && (
                        <div className="mt-1 space-y-0.5">
                          <p className="text-xs text-gray-500">
                            ${plan.annualTotal.toFixed(2)} billed annually
                          </p>
                          <p className="text-xs text-emerald-600 font-medium">
                            Save ${plan.annualSavings.toFixed(2)} vs monthly
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="flex flex-col gap-2.5 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature.text} className="flex items-start gap-2">
                      {feature.included ? <CheckIcon /> : <XIcon />}
                      <span
                        className={`text-sm ${
                          feature.included ? "text-gray-700" : "text-gray-400"
                        }`}
                      >
                        {feature.text}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <button
                  onClick={() => void handleCTA(plan.id)}
                  disabled={isLoadingThis}
                  className={`w-full py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    isPopular
                      ? "bg-violet-600 hover:bg-violet-700 text-white"
                      : isFree
                        ? "bg-gray-100 hover:bg-gray-200 text-gray-900"
                        : "bg-gray-900 hover:bg-gray-800 text-white"
                  }`}
                >
                  {isLoadingThis ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Redirecting…
                    </span>
                  ) : isFree ? (
                    "Get Started Free"
                  ) : (
                    "Get Started"
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-10">
          All plans include a 14-day data retention period after cancellation.
          Secure payments via Stripe.
        </p>
      </main>
    </div>
  );
}
