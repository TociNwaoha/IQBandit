"use client";

/**
 * app/dashboard/billing/page.tsx
 * Billing management page — dark theme dashboard.
 * Shows current plan, renewal info, upgrade options, and portal access.
 */

import { useEffect, useState, useCallback } from "react";
import { Card, Button, Badge, Modal, Skeleton, Toast } from "@/components/ui";
import { getPlanLimits } from "@/lib/plans";
import type { PlanId } from "@/lib/plans";

// ─── types ────────────────────────────────────────────────────────────────────

interface BillingStatus {
  plan:                string;
  planInterval:        string | null;
  subscriptionStatus:  string | null;
  currentPeriodEnd:    string | null;
  hasActiveSubscription: boolean;
  canUpgrade:          boolean;
  availableUpgrades:   string[];
}

interface Toast {
  message: string;
  variant: "success" | "error" | "info";
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  free:        "Free",
  starter:     "Starter",
  pro:         "Pro",
  bandit_plus: "Bandit Plus",
};

const PLAN_PRICES: Record<string, { monthly: number; annual: number }> = {
  starter:     { monthly: 9.99,  annual: 99.90  },
  pro:         { monthly: 19.99, annual: 199.90 },
  bandit_plus: { monthly: 39.99, annual: 399.90 },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function planPrice(planId: string, interval: string | null): string {
  const prices = PLAN_PRICES[planId];
  if (!prices) return "Free";
  if (interval === "annual") return `$${prices.annual.toFixed(2)}/yr`;
  return `$${prices.monthly.toFixed(2)}/mo`;
}

// ─── component ────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const [billing,         setBilling]         = useState<BillingStatus | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [upgradeOpen,     setUpgradeOpen]     = useState(false);
  const [upgradeLoading,  setUpgradeLoading]  = useState<string | null>(null);
  const [portalLoading,   setPortalLoading]   = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [toast,           setToast]           = useState<Toast | null>(null);

  const fetchBilling = useCallback(async () => {
    try {
      const res  = await fetch("/api/billing/status");
      const data = await res.json() as BillingStatus;
      setBilling(data);
    } catch {
      // Silently fail — UI shows free plan by default
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBilling();
  }, [fetchBilling]);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res  = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setToast({ message: data.error ?? "Failed to open portal", variant: "error" });
    } catch {
      setToast({ message: "Failed to open portal", variant: "error" });
    } finally {
      setPortalLoading(false);
    }
  }

  async function startCheckout(planId: string, interval: "monthly" | "annual" = "monthly") {
    setCheckoutLoading(planId);
    try {
      const res  = await fetch("/api/billing/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId, interval }),
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setToast({ message: data.error ?? "Failed to start checkout", variant: "error" });
    } catch {
      setToast({ message: "Failed to start checkout", variant: "error" });
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function doUpgrade(planId: string) {
    setUpgradeLoading(planId);
    try {
      const res  = await fetch("/api/billing/upgrade", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ planId, interval: billing?.planInterval ?? "monthly" }),
      });
      const data = await res.json() as { success?: boolean; plan?: string; error?: string };
      if (data.success) {
        setToast({ message: `Upgraded to ${PLAN_LABELS[data.plan ?? planId]}!`, variant: "success" });
        setUpgradeOpen(false);
        await fetchBilling();
      } else {
        setToast({ message: data.error ?? "Upgrade failed", variant: "error" });
      }
    } catch {
      setToast({ message: "Upgrade failed", variant: "error" });
    } finally {
      setUpgradeLoading(null);
    }
  }

  // ── loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="px-8 py-10 max-w-2xl flex flex-col gap-6">
        <Skeleton className="h-7 w-36" />
        <Card className="p-6 flex flex-col gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
          <Skeleton className="h-9 w-32" />
        </Card>
        <Card className="p-6 flex flex-col gap-4">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </Card>
      </div>
    );
  }

  const plan               = billing?.plan               ?? "free";
  const planInterval       = billing?.planInterval       ?? null;
  const subscriptionStatus = billing?.subscriptionStatus ?? null;
  const currentPeriodEnd   = billing?.currentPeriodEnd   ?? null;
  const availableUpgrades  = billing?.availableUpgrades  ?? [];
  const isPlanSafe         = (plan === "free" || plan === "starter" || plan === "pro" || plan === "bandit_plus") ? plan as PlanId : "free" as PlanId;
  const limits             = getPlanLimits(isPlanSafe);

  return (
    <div className="px-8 py-10 max-w-2xl flex flex-col gap-6">
      {/* Page title */}
      <h1 className="section-title">Billing</h1>

      {/* ── Past due banner ─────────────────────────────────────────────── */}
      {subscriptionStatus === "past_due" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-red-400">
              Payment failed — your agent is paused
            </p>
            <p className="text-xs text-zinc-500 mt-1">
              Update your payment method to restore access.
            </p>
          </div>
          <Button
            variant="danger"
            size="sm"
            loading={portalLoading}
            onClick={() => void openPortal()}
          >
            Update Payment →
          </Button>
        </div>
      )}

      {/* ── Cancelled banner ────────────────────────────────────────────── */}
      {subscriptionStatus === "cancelled" && (
        <div
          className="rounded-xl px-5 py-4 flex items-start justify-between gap-4"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface-2)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Subscription cancelled
            </p>
            {currentPeriodEnd && (
              <p className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                Access continues until {formatDate(currentPeriodEnd)}.
              </p>
            )}
          </div>
          <Button
            variant="secondary"
            size="sm"
            loading={checkoutLoading === "starter"}
            onClick={() => void startCheckout("starter")}
          >
            Resubscribe
          </Button>
        </div>
      )}

      {/* ── Free plan upsell ────────────────────────────────────────────── */}
      {plan === "free" && subscriptionStatus !== "cancelled" && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Upgrade to unlock all agents
              </p>
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Get X posting, image generation, 2GB RAM, and 40GB storage.
              </p>
              <ul className="flex flex-col gap-1 mt-2">
                {["All agents unlocked", "X posting enabled", "Image generation", "40GB storage"].map((f) => (
                  <li key={f} className="flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                    <span className="text-xs" style={{ color: "var(--color-text-secondary)" }}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex-shrink-0">
              <Button
                variant="primary"
                size="sm"
                loading={checkoutLoading === "starter"}
                onClick={() => void startCheckout("starter", "monthly")}
              >
                Upgrade $9.99/mo →
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ── Active subscription ─────────────────────────────────────────── */}
      {plan !== "free" && (
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>
              Current plan
            </p>
            {subscriptionStatus === "active" && (
              <Badge variant="success">Active</Badge>
            )}
            {subscriptionStatus === "past_due" && (
              <Badge variant="error">Past due</Badge>
            )}
          </div>

          <div>
            <p className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {PLAN_LABELS[plan] ?? plan}
            </p>
            <p className="text-sm mt-0.5" style={{ color: "var(--color-text-muted)" }}>
              {planPrice(plan, planInterval)}
              {currentPeriodEnd && (
                <> · renews {formatDate(currentPeriodEnd)}</>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="ghost"
              size="sm"
              loading={portalLoading}
              onClick={() => void openPortal()}
            >
              Manage Billing →
            </Button>
            {availableUpgrades.length > 0 && subscriptionStatus === "active" && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setUpgradeOpen(true)}
              >
                Upgrade Plan
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* ── Resources ───────────────────────────────────────────────────── */}
      <Card className="p-6 flex flex-col gap-4">
        <p className="text-xs uppercase tracking-widest font-semibold" style={{ color: "var(--color-text-muted)" }}>
          Resources
        </p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>RAM</p>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
              {limits.memory.replace("m", " MB").replace("g", " GB")}
            </p>
          </div>
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>Storage</p>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>{limits.storage}</p>
          </div>
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--color-text-muted)" }}>Agents</p>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-secondary)" }}>
              {plan === "free" ? "Research only" : "All unlocked"}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Upgrade modal ───────────────────────────────────────────────── */}
      <Modal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} title="Upgrade Plan">
        <div className="flex flex-col gap-3">
          <p className="text-sm mb-1" style={{ color: "var(--color-text-secondary)" }}>
            Choose a plan. Your subscription updates immediately.
          </p>
          {availableUpgrades.map((upgradePlan) => {
            const prices = PLAN_PRICES[upgradePlan];
            const isLoading = upgradeLoading === upgradePlan;
            return (
              <button
                key={upgradePlan}
                disabled={isLoading}
                onClick={() => void doUpgrade(upgradePlan)}
                className="w-full text-left px-4 py-3.5 rounded-xl transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-bg-surface-2)" }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border-hover)";
                    (e.currentTarget as HTMLElement).style.background = "var(--color-bg-surface-3)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
                  (e.currentTarget as HTMLElement).style.background = "var(--color-bg-surface-2)";
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                      {PLAN_LABELS[upgradePlan] ?? upgradePlan}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--color-text-muted)" }}>
                      {getPlanLimits(upgradePlan as PlanId).memory.replace("m", " MB").replace("g", " GB")} RAM ·{" "}
                      {getPlanLimits(upgradePlan as PlanId).storage} storage
                    </p>
                  </div>
                  <div className="text-right">
                    {prices && (
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text-secondary)" }}>
                        ${prices.monthly.toFixed(2)}/mo
                      </p>
                    )}
                    {isLoading ? (
                      <span className="text-xs text-blue-400">Upgrading…</span>
                    ) : (
                      <span className="text-xs text-blue-400">Select →</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Modal>

      {/* ── Toast ───────────────────────────────────────────────────────── */}
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
