"use client";

/**
 * components/AgentSidebar.tsx
 * Left sidebar for the /dashboard section.
 * Shows each agent with a live setup progress bar.
 * Navigates to setup when clicking an incomplete agent.
 *
 * CLIENT COMPONENT — uses hooks for routing and status polling.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { Badge, Skeleton, Avatar } from "@/components/ui";
import { ThemeToggle } from "@/components/ThemeToggle";

// ─── agent definitions ────────────────────────────────────────────────────────

interface AgentDef {
  name: string;
  label: string;
  emoji: string;
  active: boolean;
  /** null = fetched dynamically; number = always this value */
  staticProgress: number | null;
  tier: "starter" | "pro";
  setupUrl?: string;
}

const AGENTS: AgentDef[] = [
  {
    name:           "research-agent",
    label:          "Research Agent",
    emoji:          "🔍",
    active:         true,
    staticProgress: 100,
    tier:           "starter",
  },
  {
    name:           "social-media-manager",
    label:          "Social Media Agent",
    emoji:          "📱",
    active:         true,
    staticProgress: null,
    tier:           "starter",
    setupUrl:       "/dashboard/connections?setup=social",
  },
  {
    name:           "influencer-outreach",
    label:          "Influencer Outreach",
    emoji:          "🤝",
    active:         false,
    staticProgress: 0,
    tier:           "pro",
  },
  {
    name:           "email-digest",
    label:          "Email Digest",
    emoji:          "✉️",
    active:         false,
    staticProgress: 0,
    tier:           "pro",
  },
];

// ─── progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ progress, loading }: { progress: number; loading: boolean }) {
  const color =
    progress === 100
      ? "bg-emerald-500"
      : progress > 0
        ? "bg-amber-500"
        : "bg-red-500/60";

  return (
    <div
      className="h-[3px] w-full rounded-full overflow-hidden"
      style={{ background: "var(--color-border)" }}
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${
          loading ? "animate-pulse w-1/3" : color
        }`}
        style={loading ? { background: "var(--color-border-hover)" } : { width: `${progress}%` }}
      />
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

interface AgentSidebarProps {
  email?: string;
  name?:  string;
}

const PLAN_LABELS: Record<string, string> = {
  free:        "Free",
  starter:     "Starter",
  pro:         "Pro",
  bandit_plus: "Bandit Plus",
};

export function AgentSidebar({ email, name }: AgentSidebarProps = {}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { agents: agentStatus, isLoading } = useAgentStatus();

  const [plan,          setPlan]          = useState<string>("free");
  const [logoutLoading, setLogoutLoading] = useState(false);

  const fetchPlan = useCallback(async () => {
    try {
      const res  = await fetch("/api/billing/status");
      const data = await res.json() as { plan?: string };
      if (data.plan) setPlan(data.plan);
    } catch {
      // ignore — default to free
    }
  }, []);

  useEffect(() => { void fetchPlan(); }, [fetchPlan]);

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      router.push("/login");
    } finally {
      setLogoutLoading(false);
    }
  }

  const displayName = name ?? email?.split("@")[0] ?? "User";

  function getProgress(agent: AgentDef): number {
    if (agent.staticProgress !== null) return agent.staticProgress;
    return agentStatus?.[agent.name]?.progress ?? 0;
  }

  function getStatusLabel(agent: AgentDef, progress: number): string {
    if (agent.name === "social-media-manager") {
      if (progress === 100) {
        const handle = agentStatus?.["social-media-manager"]?.handle;
        return handle ? `X connected (${handle}) ✓` : "X connected ✓";
      }
      return "⚠️ Setup required";
    }
    if (progress === 100) return "Ready";
    return "⚠️ Setup required";
  }

  function handleAgentClick(agent: AgentDef) {
    if (!agent.active) return;

    const progress = getProgress(agent);
    if (progress < 100 && agent.setupUrl) {
      router.push(agent.setupUrl);
    } else {
      router.push("/officebuilding");
    }
  }

  const isConnectionsActive = pathname.startsWith("/dashboard/connections");
  const isAgentsActive      = pathname === "/dashboard/agents";
  const isBillingActive     = pathname.startsWith("/dashboard/billing");
  const isSettingsActive    = pathname.startsWith("/dashboard/settings");

  const navLinkClass = (active: boolean) =>
    `flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
      active ? "font-medium" : ""
    }`;

  const navLinkStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "var(--color-bg-surface-2)", color: "var(--color-text-primary)" }
      : { color: "var(--color-text-muted)" };

  return (
    <aside
      className="flex flex-col w-64 min-h-full px-3 py-5 gap-4 shrink-0"
      style={{
        background: "var(--color-bg-surface)",
        borderRight: "1px solid var(--color-border)",
      }}
    >
      {/* Section label */}
      <div className="px-2">
        <p
          className="text-[10px] font-semibold uppercase tracking-widest"
          style={{ color: "var(--color-text-muted)" }}
        >
          My Agents
        </p>
      </div>

      {/* Agent list */}
      <div className="flex flex-col gap-1.5">
        {AGENTS.map((agent) => {
          const progress = getProgress(agent);
          const isLocked = !agent.active;
          const isReady  = progress === 100;

          return (
            <button
              key={agent.name}
              onClick={() => handleAgentClick(agent)}
              disabled={isLocked}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                isLocked ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
              }`}
              style={isLocked ? {} : {
                ["--hover-bg" as string]: "var(--color-bg-surface-2)",
              }}
              onMouseEnter={(e) => {
                if (!isLocked) (e.currentTarget as HTMLElement).style.background = "var(--color-bg-surface-2)";
              }}
              onMouseLeave={(e) => {
                if (!isLocked) (e.currentTarget as HTMLElement).style.background = "";
              }}
            >
              {/* Row 1: emoji + name + badges */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-base leading-none">{agent.emoji}</span>
                <span
                  className="text-sm font-medium flex-1 truncate leading-none"
                  style={{ color: isLocked ? "var(--color-text-muted)" : "var(--color-text-primary)" }}
                >
                  {agent.label}
                </span>
                {isLocked && (
                  <Badge variant="muted" className="!text-[9px] !px-1.5 !py-0.5 font-bold uppercase">
                    Pro
                  </Badge>
                )}
                {isReady && !isLocked && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                )}
              </div>

              {/* Row 2: status text */}
              {!isLocked && (
                <div className="mb-1.5 min-h-[14px]">
                  {isLoading ? (
                    <Skeleton className="h-2 w-24" />
                  ) : (
                    <p
                      className="text-[11px] leading-none"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {getStatusLabel(agent, progress)}
                    </p>
                  )}
                </div>
              )}

              {/* Row 3: progress bar */}
              {!isLocked && <ProgressBar progress={progress} loading={isLoading} />}

              {/* Row 4: CTA for incomplete agents */}
              {!isLocked && !isReady && !isLoading && (
                <p className="text-[10px] text-blue-400 mt-1.5 leading-none">
                  Tap to set up →
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom navigation */}
      <div
        className="mt-auto flex flex-col gap-0.5 pt-4"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <Link href="/dashboard/settings" className={navLinkClass(isSettingsActive)} style={navLinkStyle(isSettingsActive)}>
          Options
        </Link>
        <Link href="/dashboard/agents" className={navLinkClass(isAgentsActive)} style={navLinkStyle(isAgentsActive)}>
          All Agents
        </Link>
        <Link href="/dashboard/connections" className={navLinkClass(isConnectionsActive)} style={navLinkStyle(isConnectionsActive)}>
          Connections
        </Link>
        <Link href="/dashboard/billing" className={navLinkClass(isBillingActive)} style={navLinkStyle(isBillingActive)}>
          Billing
        </Link>
        <Link
          href="/officebuilding"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors"
          style={{ color: "var(--color-text-muted)" }}
        >
          Open Chat ↗
        </Link>
      </div>

      {/* User section */}
      <div
        className="pt-3 flex flex-col gap-2"
        style={{ borderTop: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-2.5 px-1">
          <Avatar name={displayName} size="sm" />
          <div className="flex-1 min-w-0">
            <p
              className="text-xs font-medium truncate"
              style={{ color: "var(--color-text-primary)" }}
            >
              {displayName}
            </p>
            {email && (
              <p
                className="text-[10px] truncate"
                style={{ color: "var(--color-text-muted)" }}
              >
                {email}
              </p>
            )}
          </div>
          <Badge variant={plan === "free" ? "muted" : "success"}>
            {PLAN_LABELS[plan] ?? plan}
          </Badge>
        </div>
        <div className="flex items-center gap-2 px-1">
          <button
            onClick={() => void handleLogout()}
            disabled={logoutLoading}
            className="flex-1 text-left flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-40"
            style={{ color: "var(--color-text-muted)" }}
          >
            {logoutLoading ? "Signing out…" : "← Sign out"}
          </button>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
