"use client";

/**
 * app/dashboard/agents/page.tsx
 * Agent management page — shows agent cards with setup progress.
 */

import Link from "next/link";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { PlatformBadge } from "@/components/PlatformBadge";
import { Card, Badge, Skeleton } from "@/components/ui";

// ─── progress bar ──────────────────────────────────────────────────────────────

function CardProgressBar({ progress }: { progress: number }) {
  const barColor =
    progress === 100
      ? "bg-emerald-500"
      : progress > 0
        ? "bg-amber-500"
        : "";

  return (
    <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: "var(--color-bg-surface-2)" }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${progress}%`, ...(!barColor ? { background: "var(--color-bg-surface-3)" } : {}) }}
      />
    </div>
  );
}

// ─── Social Media Agent card ───────────────────────────────────────────────────

function SocialMediaAgentCard({
  progress,
  handle,
  isLoading,
}: {
  progress: number;
  handle: string | null | undefined;
  isLoading: boolean;
}) {
  const isReady = progress === 100;

  return (
    <Card className="flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-3xl">📱</span>
          <div className="flex items-center gap-2 mt-2">
            <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Social Media Agent</h2>
            {isReady && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
          </div>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Post to X, Instagram, LinkedIn and more — automatically.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>Setup Progress</span>
          {isLoading ? (
            <Skeleton className="h-3 w-8" />
          ) : (
            <span className={`text-xs font-medium ${isReady ? "text-emerald-400" : ""}`} style={!isReady ? { color: "var(--color-text-secondary)" } : {}}>
              {progress}%
            </span>
          )}
        </div>
        {isLoading ? (
          <Skeleton className="h-1.5 w-full" />
        ) : (
          <CardProgressBar progress={progress} />
        )}
        <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
          {isReady ? "Ready to post" : "Connect X to get started"}
        </p>
      </div>

      {/* Platforms */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Platforms</p>
        <div className="flex flex-wrap gap-2">
          <PlatformBadge
            platform="twitter"
            status={isLoading ? "not_connected" : isReady ? "connected" : "not_connected"}
            handle={handle ?? undefined}
          />
          <PlatformBadge platform="instagram" status="coming_soon" />
          <PlatformBadge platform="linkedin"  status="coming_soon" />
        </div>
      </div>

      {/* CTA */}
      {isReady ? (
        <Link
          href="/officebuilding"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-primary)" }}
        >
          💬 Chat with Agent
        </Link>
      ) : (
        <Link
          href="/dashboard/connections?setup=social"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors"
        >
          ⚡ Set Up Now
        </Link>
      )}
    </Card>
  );
}

// ─── Research Agent card ──────────────────────────────────────────────────────

function ResearchAgentCard() {
  return (
    <Card className="flex flex-col p-6 gap-5">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <span className="text-3xl">🔍</span>
        <div className="flex items-center gap-2 mt-2">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>Research Agent</h2>
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
          Searches the web and reads articles for current facts.
          No setup required.
        </p>
      </div>

      {/* Progress — always full */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 bg-emerald-500/30 rounded-full overflow-hidden">
          <div className="h-full w-full bg-emerald-500 rounded-full" />
        </div>
        <span className="text-xs text-emerald-400 font-medium whitespace-nowrap">Ready</span>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium" style={{ color: "var(--color-text-muted)" }}>Powered by IQBandit Search</p>
        <div className="flex items-center gap-2">
          {["Free", "Unlimited", "Private"].map((tag) => (
            <Badge key={tag} variant="muted" className="!text-[10px]">{tag}</Badge>
          ))}
        </div>
      </div>

      {/* CTA */}
      <Link
        href="/officebuilding"
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors"
        style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-primary)" }}
      >
        💬 Chat with Agent
      </Link>
    </Card>
  );
}

// ─── Locked Pro card ─────────────────────────────────────────────────────────

function LockedAgentCard({ emoji, label, description }: { emoji: string; label: string; description: string }) {
  return (
    <Card className="flex flex-col p-6 gap-4 opacity-50">
      <div className="flex flex-col gap-1">
        <span className="text-3xl">{emoji}</span>
        <div className="flex items-center gap-2 mt-2">
          <h2 className="text-base font-semibold" style={{ color: "var(--color-text-secondary)" }}>{label}</h2>
          <Badge variant="muted" className="!text-[9px] !px-1.5 !py-0.5 font-bold uppercase">Pro</Badge>
        </div>
        <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>{description}</p>
      </div>
      <button
        disabled
        className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium cursor-not-allowed"
        style={{ background: "var(--color-bg-surface-2)", color: "var(--color-text-muted)" }}
      >
        🔒 Upgrade to Pro
      </button>
    </Card>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const { agents, isLoading } = useAgentStatus();

  const socialProgress = agents?.["social-media-manager"]?.progress ?? 0;
  const socialHandle   = agents?.["social-media-manager"]?.handle;

  return (
    <div className="px-8 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold tracking-tight" style={{ color: "var(--color-text-primary)" }}>My Agents</h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-text-muted)" }}>
          Set up and manage your AI agent team.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ResearchAgentCard />
        <SocialMediaAgentCard
          progress={isLoading ? 0 : socialProgress}
          handle={socialHandle}
          isLoading={isLoading}
        />
        <LockedAgentCard
          emoji="🤝"
          label="Influencer Outreach"
          description="Find and contact influencers in your niche automatically."
        />
        <LockedAgentCard
          emoji="✉️"
          label="Email Digest"
          description="Send curated daily digests from your research agent."
        />
      </div>
    </div>
  );
}
