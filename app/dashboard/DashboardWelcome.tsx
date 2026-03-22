"use client";

/**
 * app/dashboard/DashboardWelcome.tsx
 * Client component for the dashboard welcome state.
 * Shows agent team status and contextual suggestion chips.
 * Also shows upgrade banner for free users and handles upgrade URL params.
 */

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { Toast } from "@/components/ui";

interface Props {
  email: string;
}

interface BillingStatus {
  plan: string;
}

interface ToastState {
  message: string;
  variant: "success" | "info" | "error";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function nameFromEmail(email: string): string {
  return email.split("@")[0] ?? email;
}

export function DashboardWelcome({ email }: Props) {
  const { agents, isLoading } = useAgentStatus();
  const searchParams          = useSearchParams();

  const socialProgress = agents?.["social-media-manager"]?.progress ?? 0;
  const socialHandle   = agents?.["social-media-manager"]?.handle ?? null;
  const allReady       = !isLoading && socialProgress === 100;

  const name = nameFromEmail(email);

  // Billing state
  const [plan,            setPlan]            = useState<string>("free");
  const [billingLoaded,   setBillingLoaded]   = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [toast,           setToast]           = useState<ToastState | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);

  const fetchBilling = useCallback(async () => {
    try {
      const res  = await fetch("/api/billing/status");
      const data = await res.json() as BillingStatus;
      setPlan(data.plan ?? "free");
    } catch {
      // Default to free if fetch fails
    } finally {
      setBillingLoaded(true);
    }
  }, []);

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  useEffect(() => {
    const upgradeParam = searchParams.get("upgrade");
    if (upgradeParam === "success") {
      setToast({ message: "Your plan has been upgraded!", variant: "success" });
      void fetchBilling();
    } else if (upgradeParam === "cancelled") {
      setToast({ message: "Upgrade cancelled.", variant: "info" });
    }
  }, [searchParams, fetchBilling]);

  async function handleUpgrade() {
    setCheckoutLoading(true);
    try {
      const res  = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId: "starter", interval: "monthly" }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
      else setCheckoutLoading(false);
    } catch {
      setCheckoutLoading(false);
    }
  }

  const showUpgradeBanner = billingLoaded && plan === "free" && !bannerDismissed;

  return (
    <div className="flex flex-col items-start gap-8 px-8 py-10 max-w-2xl">
      {/* Upgrade banner — free plan only */}
      {showUpgradeBanner && (
        <div className="w-full rounded-xl border border-blue-500/20 bg-blue-500/10 px-5 py-4 flex items-start gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Upgrade to Starter to unlock X posting, all agents, and 40GB storage
            </p>
            <div className="flex items-center gap-3 mt-3 flex-wrap">
              <button
                onClick={() => void handleUpgrade()}
                disabled={checkoutLoading}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {checkoutLoading ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    Redirecting…
                  </>
                ) : (
                  "Upgrade for $9.99/mo →"
                )}
              </button>
              <Link
                href="/pricing"
                className="text-xs transition-colors"
                style={{ color: "var(--color-text-muted)" }}
              >
                View all plans
              </Link>
            </div>
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="transition-colors flex-shrink-0 text-lg leading-none"
            style={{ color: "var(--color-text-muted)" }}
            aria-label="Dismiss upgrade banner"
          >
            ×
          </button>
        </div>
      )}

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          {getGreeting()}, {name}. 👋
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          {allReady ? "Your AI team is ready." : "Some agents need setup."}
        </p>
      </div>

      {/* Agent team status */}
      <div
        className="w-full rounded-2xl divide-y overflow-hidden"
        style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface)", borderColor: "var(--color-border)" }}
      >
        {/* Research Agent */}
        <div className="flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="text-base">🔍</span>
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Research Agent</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-xs text-emerald-400">Ready</span>
          </div>
        </div>

        {/* Social Media Agent */}
        <div className="flex items-center justify-between px-5 py-3.5" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2.5">
            <span className="text-base">📱</span>
            <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>Social Media Agent</span>
          </div>
          {isLoading ? (
            <div className="h-3 w-20 rounded animate-pulse" style={{ background: "var(--color-bg-surface-2)" }} />
          ) : socialProgress === 100 ? (
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-xs text-emerald-400">
                {socialHandle ? `${socialHandle} connected` : "X connected"}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-amber-400">⚠️ Setup needed</span>
              <Link
                href="/dashboard/connections?setup=social"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors underline underline-offset-2"
              >
                Set up →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* CTA if setup needed */}
      {!isLoading && socialProgress < 100 && (
        <Link
          href="/dashboard/connections?setup=social"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
        >
          ⚡ Complete Social Media Setup
        </Link>
      )}

      {/* Suggestion chips */}
      <div>
        <p
          className="text-xs mb-3 uppercase tracking-widest font-semibold"
          style={{ color: "var(--color-text-muted)" }}
        >
          Quick actions
        </p>
        <div className="flex flex-wrap gap-2">
          {socialProgress < 100 ? (
            <>
              <Link
                href="/dashboard/connections?setup=social"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                ⚡ Set up X posting
              </Link>
              <Link
                href="/officebuilding"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                🔍 Research a topic
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/officebuilding"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                📝 Draft an X post
              </Link>
              <Link
                href="/officebuilding"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                🧵 Create a thread
              </Link>
              <Link
                href="/officebuilding"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--color-bg-surface)", border: "1px solid var(--color-border)", color: "var(--color-text-secondary)" }}
              >
                🔍 Research a topic
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Toast for upgrade params */}
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
